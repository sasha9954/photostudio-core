import React from "react";
import ReactDOM from "react-dom";
import "./LookbookPage.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../app/AuthContext.jsx";
import { fetchJson, API_BASE } from "../services/api.js";

/**
 * LOOKBOOK — server-backed session per mode (TORSO/LEGS/FULL)
 * Канон: всё хранится в backend, строго account-scoped.
 * Без blob в persistent: refUrl/results должны быть /static/... или http(s).
 */

const MODES = [
  { key: "TORSO", label: "ТОРС" },
  { key: "LEGS", label: "НОГИ" },
  { key: "FULL", label: "ПОЛНЫЙ РОСТ" },
];

function normalizeMode(v) {
  const s = String(v || "").toUpperCase();
  return MODES.some((m) => m.key === s) ? s : null;
}

function readModeFromSearch(search) {
  try {
    const params = new URLSearchParams(search || "");
    const raw = params.get("mode") || params.get("m") || "";
    return normalizeMode(raw);
  } catch {
    return null;
  }
}


const DEFAULT_CARDS = [
  { slot: 1, label: "ПЕРЕД", type: "item", camera: "Низ 45°", pose: "Mix" },
  { slot: 2, label: "ПРАВЫЙ БОК", type: "item", camera: "Бок", pose: "Classic" },
  { slot: 3, label: "ЛЕВЫЙ БОК", type: "item", camera: "Бок", pose: "Classic" },
  { slot: 4, label: "СПИНА", type: "item", camera: "Фронт", pose: "Classic" },
  { slot: 5, label: "ТКАНЬ / МАТЕРИАЛ", type: "item", camera: "Фронт", pose: "Classic" },
  { slot: 6, label: "ДЕТАЛИРОВКА 1", type: "item", camera: "Фронт", pose: "Classic" },
  { slot: 7, label: "ДЕТАЛИРОВКА 2", type: "item", camera: "Фронт", pose: "Classic" },
  { slot: 8, label: "ЛОГОТИП", type: "logo", logoKind: "print" },
];



const FORMAT_OPTIONS = ["1:1", "16:9", "9:16"];

const CAMERA_OPTIONS = [
  { key: "front", label: "Фронт" },
  { key: "low45", label: "Низ 45°" },
  { key: "high45", label: "Верх 45°" },
  { key: "side", label: "Бок" },
  { key: "back", label: "Спина" },
  { key: "detail", label: "Деталь" },
];

const POSE_OPTIONS = [
  { key: "classic", label: "Classic" },
  { key: "mix", label: "Mix" },
  { key: "creative", label: "Creative" },
  { key: "hard", label: "Hardcore" },
  { key: "neutral", label: "Neutral" },
  { key: "motion", label: "Motion" },
];

const LOGO_KIND = [
  { key: "print", label: "Принт" },
  { key: "embroidery", label: "Вышивка" },
  { key: "patch", label: "Шиврон/патч" },
];

function sanitizePersistentUrl(u) {
  if (!u) return null;
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s) return null;
  if (s.startsWith("blob:")) return null;
  if (s.startsWith("data:")) return null;
  return s;
}

function resolveAssetUrl(u) {
  const s = sanitizePersistentUrl(u);
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/static/")) return `${API_BASE}${s}`;
  return s;
}

// Универсалка для ассетов: если ссылка ведёт на /static/assets/<hash>.(png|jpg|jpeg|webp)
// и расширение оказалось неверным/старым — пробуем найти существующий файл с тем же hash.
function splitAssetUrl(url) {
  if (!url || typeof url !== "string") return null;
  const m = url.match(
    /^(https?:\/\/[^\s]+?\/static\/assets\/)([^\/?#]+?)(\.(png|jpe?g|webp))?(\?[^#]*)?(#.*)?$/i
  );
  if (!m) return null;
  const prefix = m[1];
  const name = m[2];
  const ext = (m[4] || "").toLowerCase();
  const q = m[5] || "";
  const h = m[6] || "";
  return { prefix, name, ext, q, h };
}

async function urlOk(url) {
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    return !!r && r.ok;
  } catch {
    return false;
  }
}

async function resolveExistingAssetUrl(url) {
  const info = splitAssetUrl(url);
  if (!info) return url;

  // 1) сначала пробуем как есть
  if (await urlOk(url)) return url;

  // 2) если не найдено — перебираем расширения
  const exts = ["png", "jpg", "jpeg", "webp"];
  for (const e of exts) {
    if (info.ext && info.ext === e) continue;
    const cand = `${info.prefix}${info.name}.${e}${info.q}${info.h}`;
    if (await urlOk(cand)) return cand;
  }

  return url;
}

function useDebouncedEffect(effect, deps, delayMs) {
  React.useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

async function fileToDataUrl(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  const mime = file.type || "image/png";
  return `data:${mime};base64,${b64}`;
}

function notify(detail) {
  try {
    window.dispatchEvent(new CustomEvent("ps:notify", { detail }));
  } catch {}
}

export default function LookbookPage() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();

  // Persist active job per-account+mode so generation survives navigation/F5.
  // Backend also stores jobId inside session._run, but localStorage makes resume instant.
  const accountKey = user?.id || "guest";
  const lastModeKey = React.useCallback(() => `ps_lb_lastMode_v1:${accountKey}`, [accountKey]);
  const didInitModeRef = React.useRef(false);
  const didInitModeAccountRef = React.useRef(null);
  const jobKey = React.useCallback(
    (m) => `ps_lb_activeJob_v1:${accountKey}:${String(m || "").toUpperCase()}`,
    [accountKey]
  );

  // --- mode state (must be declared before effects that use it) ---
  const [mode, setMode] = React.useState(() => readModeFromSearch(window.location?.search) || "TORSO");



// --- mode hydration / persistence (account-scoped) ---
// 1) If URL has ?mode=FULL, it wins (used by notifications "Открыть").
React.useEffect(() => {
  const qMode = readModeFromSearch(location.search);
  if (!qMode) return;
  if (qMode === mode) return;
  setMode(qMode);
  try { localStorage.setItem(lastModeKey(), qMode); } catch {}
}, [location.search, mode, lastModeKey]);

// 2) On account change / first mount: restore last used mode if URL does not specify.
React.useEffect(() => {
  if (didInitModeAccountRef.current === accountKey && didInitModeRef.current) return;
  didInitModeAccountRef.current = accountKey;
  didInitModeRef.current = false;
  const qMode = readModeFromSearch(location.search);
  if (qMode) { didInitModeRef.current = true; return; }
  let saved = null;
  try { saved = localStorage.getItem(lastModeKey()); } catch {}
  const sMode = normalizeMode(saved);
  if (sMode && sMode !== mode) setMode(sMode);
  didInitModeRef.current = true;
}, [accountKey, location.search, lastModeKey, mode]);

const setModeAndPersist = React.useCallback((nextMode, { push = false } = {}) => {
  const nm = normalizeMode(nextMode) || "TORSO";
  setMode(nm);
  try { localStorage.setItem(lastModeKey(), nm); } catch {}
  // keep URL in sync so refresh opens same mode
  try {
    const params = new URLSearchParams(location.search || "");
    params.set("mode", nm);
    const to = `${location.pathname}?${params.toString()}`;
    nav(to, { replace: !push });
  } catch {}
}, [lastModeKey, location.pathname, location.search, nav]);
const [scene, setScene] = React.useState(null);
  const [session, setSession] = React.useState(null);
  const [sessionMode, setSessionMode] = React.useState(null); // which mode current session belongs to
  const didHydrateRef = React.useRef(false);
  const fetchSeqRef = React.useRef(0); // prevent late fetches overwriting newer mode
  const [activeResultIndex, setActiveResultIndex] = React.useState(-1);

  // Генерация: смешные фразы в большом окне результата (каждые 3–5 сек)
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [activeJobId, setActiveJobId] = React.useState(null);
  const [genLine, setGenLine] = React.useState("");
  const genTimerRef = React.useRef(null);
  const genSeqRef = React.useRef(0);
  const jobPollRef = React.useRef(null);
  const [activeCardSlot, setActiveCardSlot] = React.useState(null);

  // small menu state (card camera/pose/logo)
  const [menu, setMenu] = React.useState({ open: false, type: null, slot: null, x: 0, y: 0 });

  // Slot mini-menu (Upload / URL / Delete) — like ScenePage, but for Lookbook cards
  const cardFileRefs = React.useRef({});
  const menuFileRef = React.useRef(null);
  const [pendingFileSlot, setPendingFileSlot] = React.useState(null); // slot -> input element
  const menuSlotRef = React.useRef(null);
  const [openSlotMenu, setOpenSlotMenu] = React.useState(null); // slot number | null
  const [slotMenuPortal, setSlotMenuPortal] = React.useState(null); // { slot, left, top }
  const [slotMenuPlacement, setSlotMenuPlacement] = React.useState({}); // { [slot]: "up"|"down" }
  const [urlModal, setUrlModal] = React.useState({ open: false, slot: null, value: "" });

  
  // Lightbox (preview big result image)
  const [lightbox, setLightbox] = React.useState({ open: false, url: null });

  const openLightbox = React.useCallback((url) => {
    if (!url) return;
    setLightbox({ open: true, url });
  }, []);

  const closeLightbox = React.useCallback(() => {
    setLightbox({ open: false, url: null });
  }, []);

  React.useEffect(() => {
    if (!lightbox.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox.open, closeLightbox]);

const closeSlotMenu = React.useCallback(() => {
    setOpenSlotMenu(null);
    setSlotMenuPortal(null);
  }, []);

  const openSlotMenuFor = React.useCallback((slot, anchorEl) => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewportH = window.innerHeight || 800;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const need = 240;
    const place = spaceBelow < need && spaceAbove > spaceBelow ? "up" : "down";
    setSlotMenuPlacement((p) => ({ ...(p || {}), [slot]: place }));

    const menuW = 210;
    const pad = 10;
    let left = rect.right + 10;
    if (left + menuW + pad > (window.innerWidth || 1200)) {
      left = Math.max(pad, rect.left - menuW - 10);
    }
    let top = rect.top;
    if (place === "up") {
      top = Math.max(pad, rect.bottom - need);
    }
    setSlotMenuPortal({ slot, left, top });
    setOpenSlotMenu(slot);
  }, []);

  const requestFileForCard = React.useCallback((slot) => {
    // Use a single portal-level file input to avoid ref/DOM sync issues
    setPendingFileSlot(slot);
    const inputEl = menuFileRef.current;
    if (!inputEl || !inputEl.isConnected || typeof inputEl.click !== "function") {
      // fallback to per-card refs if portal input isn't ready
      const alt = cardFileRefs.current?.[slot];
      if (alt && alt.isConnected && typeof alt.click === "function") {
        try { alt.value = ""; } catch {}
        alt.click();
      // Menu will be closed in onChange after the file is selected.
      }
      return;
    }

    try { inputEl.value = ""; } catch {}
    inputEl.click();
    // Do NOT close menu here: keep input mounted until user picks a file.
    // Menu will be closed in onChange after the file is selected.
  }, [closeSlotMenu]);

  const requestUrlForCard = React.useCallback((slot) => {
    closeSlotMenu();
    const cur = (Array.isArray(session?.cards) ? session.cards : []).find((c) => Number(c?.slot) === Number(slot))?.refUrl || "";
    setUrlModal({ open: true, slot, value: String(cur || "") });
  }, [closeSlotMenu, session]);

  const closeUrlModal = React.useCallback(() => {
    setUrlModal({ open: false, slot: null, value: "" });
  }, []);

  const confirmUrlModal = React.useCallback(() => {
    if (!urlModal.open) return;
    const v = (urlModal.value || "").trim();
    if (!v) {
      setCard(urlModal.slot, { refUrl: null });
      closeUrlModal();
      return;
    }
    setCard(urlModal.slot, { refUrl: v });
    closeUrlModal();
  }, [urlModal, closeUrlModal]);

  const deleteCardRef = React.useCallback((slot) => {
    setCard(slot, { refUrl: null });
    closeSlotMenu();
  }, [closeSlotMenu]);

  // Close slot menu on outside click / ESC
  React.useEffect(() => {
    if (!openSlotMenu) return;
    const onDown = (e) => {
      if (menuSlotRef.current && menuSlotRef.current.contains(e.target)) return;
      closeSlotMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeSlotMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openSlotMenu, closeSlotMenu]);

React.useEffect(() => {
    if (!openSlotMenu) return;
    const onScroll = () => closeSlotMenu();
    const onResize = () => closeSlotMenu();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [openSlotMenu, closeSlotMenu]);

    React.useEffect(() => {
    if (!urlModal.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeUrlModal();
      if (e.key === "Enter") confirmUrlModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [urlModal.open, closeUrlModal, confirmUrlModal]);

  const openMenu = (e, type, slot) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      open: true,
      type,
      slot,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  };

  const closeMenu = () => setMenu({ open: false, type: null, slot: null, x: 0, y: 0 });

  const fetchScene = async () => {
    const res = await fetchJson("/api/scene/current");
    setScene(res?.scene || null);
  };

  const fetchSession = async (m) => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = await fetchJson(`/api/lookbook/session/${m}`);
      if (seq !== fetchSeqRef.current) return; // stale response (mode switched)

      const s = res?.session || null;
      if (s) {
        // sanitize urls
        if (Array.isArray(s.cards)) {
          s.cards = s.cards.map((c) => ({ ...c, refUrl: sanitizePersistentUrl(c?.refUrl) }));
        }
        if (Array.isArray(s.results)) {
          // results can be either ["url", ...] OR [{slotIndex, url}, ...] depending on backend version
          s.results = s.results
            .map((r) => {
              if (!r) return null;
              if (typeof r === "string") {
                const u = sanitizePersistentUrl(r);
                return u ? u : null;
              }
              if (typeof r === "object") {
                const u = sanitizePersistentUrl(r.url);
                if (!u) return null;
                return { ...r, url: u };
              }
              return null;
            })
            .filter(Boolean);
        }

        // fix old/wrong extensions for /static/assets/<hash>.* (png/jpg/jpeg/webp)
        if (Array.isArray(s.cards) && s.cards.length) {
          s.cards = await Promise.all(
            s.cards.map(async (c) => {
              if (!c || !c.refUrl) return c;
              const abs = resolveAssetUrl(c.refUrl) || c.refUrl;
              const fixed = await resolveExistingAssetUrl(abs);
              return fixed && fixed !== abs ? { ...c, refUrl: fixed } : c;
            })
          );
        }
        if (Array.isArray(s.results) && s.results.length) {
          s.results = await Promise.all(
            s.results.map(async (r) => {
              if (!r) return r;
              if (typeof r === "string") {
                const abs = resolveAssetUrl(r) || r;
                const fixed = await resolveExistingAssetUrl(abs);
                return fixed && fixed !== abs ? fixed : r;
              }
              if (typeof r === "object" && r.url) {
                const abs = resolveAssetUrl(r.url) || r.url;
                const fixed = await resolveExistingAssetUrl(abs);
                return fixed && fixed !== abs ? { ...r, url: fixed } : r;
              }
              return r;
            })
          );
        }
      }
      const firstIdx = (() => {
        if (!s || !Array.isArray(s.results) || !s.results.length) return -1;
        // if objects with slotIndex — pick smallest slotIndex; else pick first by order
        const objs = s.results.filter((r) => r && typeof r === "object" && Number.isFinite(Number(r.slotIndex)));
        if (objs.length) {
          const min = Math.min(...objs.map((r) => Number(r.slotIndex)));
          if (Number.isFinite(min) && min >= 1 && min <= 9) return min - 1;
        }
        return 0;
      })();

      setSession(s);
      setSessionMode(m);
      setActiveResultIndex(firstIdx);
      setActiveCardSlot(null);
    } catch (e) {
      if (seq !== fetchSeqRef.current) return;
      console.warn("[lookbook] fetchSession failed:", e?.message || e);
      setSession(null);
      setSessionMode(m);
      setActiveResultIndex(-1);
      setActiveCardSlot(null);
    }
  };

  React.useEffect(() => {
    (async () => {
      await fetchScene();
      await fetchSession(mode);
      didHydrateRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!didHydrateRef.current) return;
    setActiveCardSlot(null);
    closeMenu();
    closeSlotMenu();
    setSession(null);
    setSessionMode(null);
    setActiveResultIndex(-1);
    (async () => {
      await fetchSession(mode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Persist session (debounced) — server-backed
  useDebouncedEffect(
    () => {
      if (!didHydrateRef.current) return;
      if (!session) return;
      if (sessionMode !== mode) return; // prevent cross-mode bleed on fast tab switch
      fetchJson(`/api/lookbook/session/${mode}`, { method: "PATCH", body: { format: session.format, cards: session.cards, results: session.results } })
        .catch((e) => console.warn("[lookbook] persist failed:", e?.message || e));
    },
    [mode, session, sessionMode],
    450
  );

  // Update scene helper (model/location upload)
  async function persistDataUrlToAssetUrl(dataUrl) {
    const res = await fetchJson("/api/assets/fromDataUrl", { method: "POST", body: { dataUrl } });
    return res?.url || null;
  }
  async function patchScene(patch) {
    await fetchJson("/api/scene/current", { method: "PATCH", body: patch });
    await fetchScene();
  }

  const onUploadSceneImage = async (kind, file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const url = await persistDataUrlToAssetUrl(dataUrl);
    if (!url) return;
    if (kind === "model") await patchScene({ modelUrl: url });
    if (kind === "location") await patchScene({ locationUrl: url });
  };

  const onOpenSceneCreate = (openChat) => {
    // IMPORTANT: preserve current Lookbook mode on return from ScenePage
    const returnTo = encodeURIComponent(`/studio/lookbook?mode=${encodeURIComponent(mode)}`);
    const q = openChat ? `&openChat=${encodeURIComponent(openChat)}` : "";
    // also pass mode explicitly for robustness (ScenePage may use mode/variant/returnMode)
    nav(`/scene?returnTo=${returnTo}&mode=${encodeURIComponent(mode)}${q}`);
  };

  const setCard = (slot, patch) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, cards: Array.isArray(prev.cards) ? prev.cards.map((c) => ({ ...c })) : [] };
      const idx = next.cards.findIndex((c) => Number(c?.slot) === Number(slot));
      if (idx >= 0) next.cards[idx] = { ...next.cards[idx], ...patch };
      return next;
    });
  };

  const onUploadCard = async (slot, file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const url = await persistDataUrlToAssetUrl(dataUrl);
    if (!url) return;
    setCard(slot, { refUrl: url });
  };

  const cards = React.useMemo(() => {
    const from = Array.isArray(session?.cards) ? session.cards : [];
    const bySlot = new Map();
    for (const c of from) {
      if (!c || typeof c.slot !== "number") continue;
      bySlot.set(c.slot, c);
    }
    // Всегда 8 карточек как в макете (даже если сессия пустая)
    return DEFAULT_CARDS.map((d) => {
      const existing = bySlot.get(d.slot) || {};
      return {
        ...d,
        ...existing,
        slot: d.slot,
        label: existing.label || d.label,
        type: existing.type || d.type,
      };
    });
  }, [session]);

  const filledCardsCount = React.useMemo(() => {
    return cards.filter((c) => sanitizePersistentUrl(c?.refUrl)).length;
  }, [cards]);

  const resultsRaw = session?.results || [];

// Нормализуем результаты в 9 слотов (idx 0..8).
// Поддерживаем оба формата:
// 1) ["url", ...] (старый)
// 2) [{slotIndex, url}, ...] (новый)
const thumbSlots = React.useMemo(() => {
  // Плотная раскладка результатов: 1..N без привязки к slotIndex карточек.
  // Канон: если в TORSO заполнены карточки 1/3/7, то в "Результат" это будет 1/2/3.
  const out = Array.from({ length: 9 }, () => null);

  let write = 0;
  const push = (u) => {
    if (!u) return;
    // ищем первый свободный слот
    while (write < out.length && out[write]) write++;
    if (write < out.length) {
      out[write] = u;
      write++;
    }
  };

  for (let i = 0; i < resultsRaw.length; i++) {
    const r = resultsRaw[i];
    if (!r) continue;

    if (typeof r === "string") {
      push(r);
      continue;
    }

    if (typeof r === "object") {
      push(r.url);
      continue;
    }
  }

  return out;
}, [resultsRaw]);

// Активный результат: берём src из thumbSlots по activeResultIndex
const activeUrl =
  activeResultIndex >= 0 && activeResultIndex < thumbSlots.length
    ? thumbSlots[activeResultIndex]
    : null;

const results = thumbSlots.filter(Boolean);

// Если результатов стало меньше (или их нет) — корректируем активный индекс
React.useEffect(() => {
  const filled = thumbSlots.some(Boolean);
  if (!filled) {
    if (activeResultIndex !== -1) setActiveResultIndex(-1);
    return;
  }
  if (activeResultIndex < 0 || activeResultIndex >= thumbSlots.length || !thumbSlots[activeResultIndex]) {
    // если активный слот пуст — сбрасываем
    setActiveResultIndex(-1);
    setActiveCardSlot(null);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [thumbSlots.join("|")]);
const goToPrints = () => {
    // pages/prints пока заглушка: перенос сделаем позже через server session
    nav(`/prints?mode=${encodeURIComponent(mode)}`);
  };
  const goToVideo = () => {
    nav(`/video?mode=${encodeURIComponent(mode)}`);
  };

  const downloadResults = async () => {
    try {
      // backend решает: 1 файл => изображение; 2+ => zip
      const resp = await fetch(`${API_BASE}/api/lookbook/download/${mode}`, {
        method: "GET",
        credentials: "include",
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.warn("download failed", resp.status, txt);
        alert("Не удалось скачать результаты.");
        return;
      }
      const blob = await resp.blob();
      // filename из Content-Disposition (если есть)
      const cd = resp.headers.get("content-disposition") || "";
      const m = /filename="([^"]+)"/i.exec(cd);
      const filename = (m && m[1]) ? m[1] : (blob.type === "application/zip" ? `lookbook_${mode}.zip` : `lookbook_${mode}.png`);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      alert("Ошибка скачивания.");
    }
  };

  // Ротация смешных фраз (рандом 3–5 сек). Привязка к модели/локации — мягкая.
  React.useEffect(() => {
    if (!isGenerating) {
      if (genTimerRef.current) {
        clearTimeout(genTimerRef.current);
        genTimerRef.current = null;
      }
      return;
    }

    const seq = ++genSeqRef.current;
    const modelHint = (scene?.modelPrompt || scene?.modelText || "модель").toString().trim();
    const locHint = (scene?.locationPrompt || scene?.locationText || "локация").toString().trim();

    const sanitizeHint = (s) => {
      const t = (s || "").replace(/\s+/g, " ").trim();
      if (!t) return "";
      return t.length > 38 ? t.slice(0, 38) + "…" : t;
    };
    const mh = sanitizeHint(modelHint);
    const lh = sanitizeHint(locHint);

    const lines = [
      `Подбираю свет так, чтобы ${mh || "модель"} выглядела как в рекламе…`,
      `Ставлю ${mh || "модель"} на метку и проверяю тени…`,
      `Выравниваю перспективу — ${lh || "локация"} должна быть ровной…`,
      `Глажу пиксели утюгом. Шшш…`,
      `Уговариваю ткань не мяться. Почти получилось…`,
      `Полирую детали: швы, текстуры, логотипы…`,
      `Договариваюсь с ${lh || "локация"}: «без сюрпризов, пожалуйста»…`,
      `Считаю кадры… раз… два… три…`,
      `Сейчас будет красиво. Держи кофе ☕`,
      `Секундочку… я тут в режиме «фотограф‑перфекционист»…`,
      `Собираю «вау‑эффект» по частям…`,
      `Заставляю нейросеть не фантазировать лишнее 🙃`,
    ];

    const pick = () => lines[Math.floor(Math.random() * lines.length)];
    setGenLine(pick());

    const schedule = () => {
      if (!isGenerating) return;
      const ms = 3000 + Math.floor(Math.random() * 2001);
      genTimerRef.current = setTimeout(() => {
        if (genSeqRef.current !== seq) return; // отмена при перезапуске
        setGenLine(pick());
        schedule();
      }, ms);
    };
    schedule();

    return () => {
      if (genTimerRef.current) {
        clearTimeout(genTimerRef.current);
        genTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, scene?.modelPrompt, scene?.locationPrompt, scene?.modelText, scene?.locationText]);

  const stopJobPolling = React.useCallback(() => {
    if (jobPollRef.current) {
      clearTimeout(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const clearActiveJob = React.useCallback((m) => {
    try { localStorage.removeItem(jobKey(m)); } catch {}
    setActiveJobId(null);
    stopJobPolling();
  }, [jobKey, stopJobPolling]);

  const pollJob = React.useCallback((jobId, m) => {
    stopJobPolling();
    const modeUpper = String(m || mode || "TORSO").toUpperCase();
    if (!jobId) return;

    const tick = async () => {
      try {
        const res = await fetchJson(`/api/lookbook/jobs/${jobId}`);
        const job = res?.job;
        const state = job?.state;

        if (state === "done") {
          const results = job?.result?.results || [];
          setSession((prev) => (prev ? { ...prev, results } : prev));
          setActiveResultIndex(Array.isArray(results) && results.length ? 0 : -1);
          setIsGenerating(false);
          clearActiveJob(modeUpper);
          notify({
            id: `job_done:${jobId}`,
            kind: "success",
            title: "Генерация готова",
            source: `Lookbook · ${modeUpper}`,
            message: Array.isArray(results) ? `Готово кадров: ${results.length}` : "Можно открыть результат.",
            actions: [
              { label: "Ок", primary: true },
              { label: "К студии", primary: false, to: `/studio/lookbook?mode=${mode}` },
            ],
            ttlMs: 10000,
          });
          try { await refresh?.(); } catch {}
          return;
        }

        if (state === "error") {
          const msg = job?.error || "Ошибка фотосессии";
          setIsGenerating(false);
          clearActiveJob(modeUpper);
          try { await refresh?.(); } catch {}
          notify({
            id: `job_err:${jobId}`,
            kind: "error",
            title: "Ошибка генерации",
            source: `Lookbook · ${modeUpper}`,
            message: String(msg || "Ошибка фотосессии"),
            actions: [
              { label: "Ок", primary: true },
              { label: "К студии", primary: false, to: `/studio/lookbook?mode=${mode}` },
            ],
            ttlMs: 14000,
          });
          return;
        }

        // queued/running
        setIsGenerating(true);
        setActiveJobId(jobId);
        jobPollRef.current = setTimeout(tick, 1500);
      } catch (e) {
        // transient fetch error
        jobPollRef.current = setTimeout(tick, 2000);
      }
    };

    tick();
  }, [clearActiveJob, mode, refresh, stopJobPolling]);

  // Resume job after navigation/F5: try localStorage first, then session._run from backend.
  React.useEffect(() => {
    const k = jobKey(mode);
    let stored = null;
    try { stored = localStorage.getItem(k); } catch {}
    const sessionJobId = session?._run?.jobId;
    const sessionRunning = !!session?._run?.running;
    const jobId = (stored && String(stored)) || (sessionRunning ? sessionJobId : null);
    if (jobId) {
      setActiveJobId(jobId);
      setIsGenerating(true);
      pollJob(jobId, mode);
    } else {
      setActiveJobId(null);
    }
    return () => stopJobPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, jobKey, session?._run?.jobId, session?._run?.running]);

  const onPhotoshoot = async () => {
    if (isGenerating) return;
    if (!scene?.modelUrl || !scene?.locationUrl) {
      alert("Сначала выбери МОДЕЛЬ и ЛОКАЦИЮ (с компа или через Создать). ");
      return;
    }
    // Проверка: есть ли хотя бы одна карточка с рефом
    const hasAnyCard = Array.isArray(session?.cards) && session.cards.some((c) => !!c?.refUrl);
    if (!hasAnyCard) {
      alert("Добавь хотя бы одну картинку в карточки (реф одежды/детали/логотип).");
      return;
    }
    setIsGenerating(true);
    if (!genLine) setGenLine("Готовлю фотосессию…");
    try {
      const res = await fetchJson(`/api/lookbook/photoshoot/${mode}`, { method: "POST", body: { debug: false } });
      const jobId = res?.jobId;
      if (!res?.ok || !jobId) {
        const msg = res?.message || res?.detail || "Ошибка фотосессии";
        throw new Error(msg);
      }
      try { localStorage.setItem(jobKey(mode), String(jobId)); } catch {}
      setActiveJobId(jobId);
      pollJob(jobId, mode);
    } catch (e) {
      console.warn("[lookbook] photoshoot failed:", e);
      alert(`Ошибка фотосессии: ${e?.message || e}`);
    } finally {
      // isGenerating is controlled by job polling.
      try { await refresh?.(); } catch {}
    }
  };

  return (
    <div className={`lb-root mode-${mode}`} onClick={() => { if (menu.open) closeMenu(); }}>
      <div className="lb-titleRow">
        <div>
          <div className="lb-bigTitle">LOOKBOOK</div>
          <div className="lb-subTitle">Каталожная съёмка одежды на модели</div>
        </div>
      </div>

      <div className="lb-grid">
        {/* LEFT column: scene */}
        <div className="lb-col lb-colLeft">
          <div className="lb-panel">
            <div className="lb-panelTitle">МОДЕЛЬ</div>
            <div className="lb-slotBig">
              {sanitizePersistentUrl(scene?.modelUrl) ? (
                <>
                <img className="lb-slotImg" alt="model" src={resolveAssetUrl(scene?.modelUrl)} />
                                <button
                                  className="lb-clearX"
                                  type="button"
                                  title="Очистить"
                                  onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); patchScene({ modelUrl: null }); }}
                                >
                                  ×
                                </button>
              </>
              ) : (
                <div className="lb-slotPlus">+</div>
              )}
              <input
                className="lb-file"
                type="file"
                accept="image/*"
                onChange={(e) => onUploadSceneImage("model", e.target.files?.[0])}
              />
            </div>
            <div className="lb-slotBtns">
              <label className="lb-btn">
                загрузить
                <input className="lb-fileHidden" type="file" accept="image/*" onChange={(e) => onUploadSceneImage("model", e.target.files?.[0])} />
              </label>
              <button className="lb-btn lb-btnPrimary" onClick={() => onOpenSceneCreate("model")}>создать</button>
            </div>
          </div>

          <div className="lb-panel">
            <div className="lb-panelTitle">ЛОКАЦИЯ</div>
            <div className="lb-slotBig">
              {sanitizePersistentUrl(scene?.locationUrl) ? (
                <>
                <img className="lb-slotImg" alt="location" src={resolveAssetUrl(scene?.locationUrl)} />
                                <button
                                  className="lb-clearX"
                                  type="button"
                                  title="Очистить"
                                  onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); patchScene({ locationUrl: null }); }}
                                >
                                  ×
                                </button>
              </>
              ) : (
                <div className="lb-slotPlus">+</div>
              )}
              <input
                className="lb-file"
                type="file"
                accept="image/*"
                onChange={(e) => onUploadSceneImage("location", e.target.files?.[0])}
              />
            </div>
            <div className="lb-slotBtns">
              <label className="lb-btn">
                загрузить
                <input className="lb-fileHidden" type="file" accept="image/*" onChange={(e) => onUploadSceneImage("location", e.target.files?.[0])} />
              </label>
              <button className="lb-btn lb-btnPrimary" onClick={() => onOpenSceneCreate("location")}>создать</button>
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="lb-col lb-colCenter">
          <div className="lb-centerPanel lb-panel">
          <div className="lb-modes">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={"lb-modeBtn" + (mode === m.key ? " isActive" : "")}
                onClick={() => setModeAndPersist(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="lb-cardsGrid">
            {cards.map((c) => {
              const refUrl = sanitizePersistentUrl(c?.refUrl);
              return (
                <div
                  key={c.slot}
                  className={
                    "lb-card" +
                    (c.type === "logo" ? " isLogo" : "") +
                    (activeCardSlot === c.slot ? " isActive" : "")
                  }
                  onClick={() => setActiveCardSlot(c.slot)}
                >
                  <div className="lb-cardTitle">{c.label}</div>
                  <div
                    className="lb-cardSlot"
                    onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); openSlotMenuFor(c.slot, e.currentTarget); }}
                    title="Клик — меню (С компа / URL / Удалить)"
                  >
                    {refUrl ? <img className="lb-cardImg" alt="" src={resolveAssetUrl(refUrl)} /> : <div className="lb-slotPlus">+</div>}
                    <input
                      ref={(el) => { if (el) { cardFileRefs.current[c.slot] = el; } else { try { delete cardFileRefs.current[c.slot]; } catch {} } }}
                      className="lb-fileHidden"
                      type="file"
                      accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; onUploadCard(c.slot, f); closeSlotMenu(); }}
                    />
                  </div>

                  <div className="lb-cardControls">
                    {c.type === "logo" ? (
                      <button className="lb-pill" type="button" onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); openMenu(e, "logoKind", c.slot); }}>
                        {(LOGO_KIND.find((x) => x.key === c.logoKind)?.label) || "Принт"}
                      </button>
                    ) : (
                      <>
                        <button className="lb-pill" type="button" onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); openMenu(e, "camera", c.slot); }}>
                          {(CAMERA_OPTIONS.find((x) => x.key === c.camera)?.label) || "Фронт"}
                        </button>
                        <button className="lb-pill" type="button" onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); openMenu(e, "pose", c.slot); }}>
                          {(POSE_OPTIONS.find((x) => x.key === c.pose)?.label) || "Classic"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lb-bottomRow">
            <div className="lb-format">
              {FORMAT_OPTIONS.map((f) => (
                <button
                  key={f}
                  className={"lb-formatBtn" + (session?.format === f ? " isActive" : "")}
                  onClick={() => setSession((p) => (p ? { ...p, format: f } : p))}
                >
                  {f}
                </button>
              ))}
            </div>

            <button className="lb-photoshootBtn" onClick={onPhotoshoot} disabled={filledCardsCount === 0 || isGenerating}>
              ФОТОСЕССИЯ
            </button>
          </div>
        </div>

          </div>
        {/* RIGHT */}
        <div className="lb-col lb-colRight">
          <div className="lb-panel lb-resultsPanel">
            <div className="lb-panelTitle">РЕЗУЛЬТАТ</div>

            <div className="lb-resultsArea">
              <div className="lb-resultBig">
                {activeUrl ? (
                  <img
                    className="lb-resultBigImg"
                    alt="result"
                    src={resolveAssetUrl(activeUrl)}
                    onClick={() => openLightbox(resolveAssetUrl(activeUrl))}
                  />
                ) : (
                  <div className="lb-resultHint">
                    Результат появится<br />после <b>ФОТОСЕССИИ</b>
                  </div>
                )}

                {isGenerating ? (
                  <div className="lb-genOverlay" aria-live="polite">
                    <div className="lb-genBox">
                      <div className="lb-genSpinner" />
                      <div className="lb-genLine">{genLine || "Генерация…"}</div>
                      <div className="lb-genSub">Идёт фотосессия…</div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="lb-resultThumbs">
                {thumbSlots.map((u, idx) => {
                  const isActive = idx === activeResultIndex;
                  const isFilled = !!u;
                  return (
                    <button
                      key={(u || "empty") + "_" + idx}
                      className={
                        "lb-thumb" +
                        (isActive ? " isActive" : "") +
                        (isFilled ? " isFilled" : " isEmpty")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!u) return;
                        setActiveResultIndex(idx);
                      }}
                      type="button"
                      title={isFilled ? `Результат ${idx + 1}` : `Пусто ${idx + 1}`}
                      disabled={!isFilled}
                    >
                      {isFilled ? (
                        <img alt="" src={resolveAssetUrl(u)} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lb-resultsBtns">
              <button className="lb-btn2" onClick={goToPrints} disabled={!results.length}>принты и дизайн</button>
              <button className="lb-btn2" onClick={goToVideo} disabled={!results.length}>сделать видео</button>
              <button className="lb-btn2" onClick={downloadResults} disabled={!results.length}>сохранить</button>
            </div>

            <div className="lb-sessionInfo">
              <div className="lb-sessionTitle">Итог сессии</div>
              <div className="lb-sessionRow"><span>Режим</span><b>{mode}</b></div>
              <div className="lb-sessionRow"><span>Карточек заполнено</span><b>{filledCardsCount}/8</b></div>
              <div className="lb-sessionRow"><span>Списание кредитов</span><b>{filledCardsCount}</b></div>
            </div>

            <div className="lb-status">
              <div className="lb-statusTitle">Статус</div>
              <div className="lb-statusText">Здесь будут действия и ошибки движка (почему фотосессия не запустилась, что запретил валидатор и т.д.).</div>
            </div>
          </div>
        </div>
      </div>

      {/* floating menu */}
      {menu.open && (
        <div className="lb-menuOverlay" onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
  onClick={(e)=>{e.preventDefault();e.stopPropagation(); closeMenu(); }}>
          <div
            className="lb-menu"
            style={{ left: Math.max(16, Math.min(window.innerWidth - 220, menu.x - 110)), top: Math.max(16, Math.min(window.innerHeight - 260, menu.y)) }}
            onClick={(e) => e.stopPropagation()}
          >
            {menu.type === "camera" && CAMERA_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className="lb-menuItem"
                onClick={() => { setCard(menu.slot, { camera: opt.key }); closeMenu(); }}
              >
                {opt.label}
              </button>
            ))}
            {menu.type === "pose" && POSE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className="lb-menuItem"
                onClick={() => { setCard(menu.slot, { pose: opt.key }); closeMenu(); }}
              >
                {opt.label}
              </button>
            ))}
            {menu.type === "logoKind" && LOGO_KIND.map((opt) => (
              <button
                key={opt.key}
                className="lb-menuItem"
                onClick={() => { setCard(menu.slot, { logoKind: opt.key }); closeMenu(); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* card slot mini-menu (portal) */}
      {openSlotMenu && slotMenuPortal && ReactDOM.createPortal(
        <div
          className="lb-slotMenuPortal"
          style={{ left: slotMenuPortal.left, top: slotMenuPortal.top }}
          ref={menuSlotRef}
          onClick={(e) => e.stopPropagation()}
        >
<input
            ref={menuFileRef}
            className="lb-fileHidden"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const slot = pendingFileSlot || openSlotMenu;
              if (!slot) return;
              onUploadCard(slot, f);
              setPendingFileSlot(null);
              closeSlotMenu();
            }}
          />
          <button type="button" onClick={() => requestFileForCard(openSlotMenu)}>С компа</button>
          <button type="button" onClick={() => requestUrlForCard(openSlotMenu)}>URL</button>
          <button
            type="button"
            onClick={() => deleteCardRef(openSlotMenu)}
            disabled={!sanitizePersistentUrl((Array.isArray(session?.cards) ? session.cards : []).find((c) => Number(c?.slot) === Number(openSlotMenu))?.refUrl)}
          >
            Удалить
          </button>
          <div className="lb-slotMenuSep" />
          <button type="button" onClick={closeSlotMenu}>Отмена</button>
        </div>,
        document.body
      )}

      {/* URL modal (portal) */}
      {urlModal.open && ReactDOM.createPortal(
        <div className="lb-modalOverlay" onClick={closeUrlModal}>
          <div className="lb-urlModal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>URL изображения</div>
            <input
              className="lb-urlInput"
              placeholder="https://... или /static/assets/..."
              value={urlModal.value}
              onChange={(e) => setUrlModal((p) => ({ ...p, value: e.target.value }))}
              autoFocus
            />
            <div className="lb-urlModalActions">
              <button className="lb-btn" type="button" onClick={closeUrlModal}>Отмена</button>
              <button className="lb-btn lb-btnPrimary" type="button" onClick={confirmUrlModal}>Готово</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {lightbox.open && (
        <div className="lb-lightboxOverlay" onClick={closeLightbox}>
          <div className="lb-lightboxInner" onClick={(e) => e.stopPropagation()}>
            <img className="lb-lightboxImg" src={lightbox.url} alt="preview" />
          </div>
        </div>
      )}

    </div>
  );
}