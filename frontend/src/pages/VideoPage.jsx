import React from "react";
import { fetchJson, API_BASE } from "../services/api.js";
import { useAuth } from "../app/AuthContext.jsx";
import "./VideoPage.css";

function GlassSelect({ value, options, onChange, ariaLabel }){
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const btnRef = React.useRef(null);

  React.useEffect(() => {
    if(!open) return;
    const onDocDown = (e) => {
      const el = rootRef.current;
      if(!el) return;
      if(el.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if(e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (opt) => {
    onChange?.(opt);
    setOpen(false);
    btnRef.current?.focus?.();
  };

  return (
    <div ref={rootRef} className={`glassSelect ${open ? "open" : ""}`} aria-label={ariaLabel || "Выбор"}>
      <button
        ref={btnRef}
        type="button"
        className="glassSelectBtn"
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen(v => !v)}
      >
        <span className="glassSelectValue">{value}</span>
        <span className="glassSelectChevron" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="glassSelectBackdrop" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="glassSelectMenu" role="listbox">
            {options.map((opt) => {
              const active = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={active ? "true" : "false"}
                  className={`glassSelectItem ${active ? "active" : ""}`}
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function getAccountKey(user){
  const id = (user && user.id) ? String(user.id) : "";
  const email = (user && user.email) ? String(user.email).toLowerCase() : "";
  return (id || email || "guest").trim();
}

function safeParse(json, fallback){
  try{ return JSON.parse(json); }catch{ return fallback; }
}

function sanitizePersistentUrl(url){
  const s = (url || "").trim();
  if(!s) return "";
  if(s.startsWith("blob:")) return "";
  if(s.startsWith("data:")) return "";
  return s;
}

function resolveAssetUrl(url){
  const s = sanitizePersistentUrl(url);
  if(!s) return "";
  if(s.startsWith("/static/")) return `${API_BASE}${s}`;
  return s;
}

async function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const ENGINE_LIST = [
  { key: "STANDARD", label: "STANDARD", sub: "2.6", locked: false },
  { key: "CINEMA", label: "CINEMA", sub: "3.0", locked: true },
  { key: "ULTRA", label: "ULTRA", sub: "3.1", locked: true },
  { key: "STUDIO", label: "STUDIO", sub: "2.0", locked: true },
];

const CAMERA_LIST = [
  // Product-safe camera moves (no orbit/crane/panorama that can cause hallucinated redraws)
  "Статично",
  "Микро-движение",
  "Наезд",
  "Отъезд",
  "Сдвиг ←",
  "Сдвиг →",
  "Сдвиг ↑",
  "Сдвиг ↓",
  "Наклон ↑",
  "Наклон ↓",
];

export default function VideoPage(){
  const { user } = useAuth();
  const accountKey = React.useMemo(() => getAccountKey(user), [user]);

  const KEY = React.useMemo(() => ({
    photo: `ps_video_photoSlots_v1:${accountKey}`,
    clips: `ps_video_clipSlots_v1:${accountKey}`,
    state: `ps_video_state_v1:${accountKey}`,
    unlock: `ps_video_unlock_v1:${accountKey}`,
  }), [accountKey]);

  const [photoSlots, setPhotoSlots] = React.useState(() => Array(9).fill(""));
  const [clipSlots, setClipSlots] = React.useState(() => Array(9).fill(""));
  const [activePhotoIdx, setActivePhotoIdx] = React.useState(0);
  const [activeClipIdx, setActiveClipIdx] = React.useState(0);

  const [format, setFormat] = React.useState("9:16");
  const [duration, setDuration] = React.useState(5);
  const [camera, setCamera] = React.useState(CAMERA_LIST[0]);
  const [light, setLight] = React.useState("Мягкий");
  const [engine, setEngine] = React.useState("STANDARD");
  const [status, setStatus] = React.useState("Здесь будут действия и ошибки (почему генерация не запустилась и т.д.).");

  const [unlocks, setUnlocks] = React.useState(() => ({ }));
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [unlockTarget, setUnlockTarget] = React.useState(null);
  const [unlockCode, setUnlockCode] = React.useState("");

  const didHydrateRef = React.useRef(false);
  const uploadingRef = React.useRef(false);
  const photoFileRef = React.useRef(null);
  const clipFileRef = React.useRef(null);

  // hydrate
  React.useEffect(() => {
    const p = safeParse(localStorage.getItem(KEY.photo) || "", null);
    const c = safeParse(localStorage.getItem(KEY.clips) || "", null);
    const st = safeParse(localStorage.getItem(KEY.state) || "", null);
    const un = safeParse(localStorage.getItem(KEY.unlock) || "", null);

    if(Array.isArray(p) && p.length === 9){
      setPhotoSlots(p.map(sanitizePersistentUrl));
    }
    if(Array.isArray(c) && c.length === 9){
      setClipSlots(c.map(sanitizePersistentUrl));
    }
    if(st && typeof st === "object"){
      if(["9:16","1:1","16:9"].includes(st.format)) setFormat(st.format);
      if([5,10].includes(st.duration)) setDuration(st.duration);
      if(typeof st.camera === "string" && CAMERA_LIST.includes(st.camera)) setCamera(st.camera);
      if(typeof st.light === "string" && ["Мягкий","Контраст","Тёплый"].includes(st.light)) setLight(st.light);
      if(typeof st.engine === "string") setEngine(st.engine);
      if(Number.isFinite(st.activePhotoIdx)) setActivePhotoIdx(Math.min(8, Math.max(0, st.activePhotoIdx)));
      if(Number.isFinite(st.activeClipIdx)) setActiveClipIdx(Math.min(8, Math.max(0, st.activeClipIdx)));
    }
    if(un && typeof un === "object"){
      setUnlocks(un);
    }
    didHydrateRef.current = true;
  }, [KEY.photo, KEY.clips, KEY.state, KEY.unlock]);

  // persist
  React.useEffect(() => {
    if(!didHydrateRef.current) return;
    if(uploadingRef.current) return;
    try{ localStorage.setItem(KEY.photo, JSON.stringify(photoSlots.map(sanitizePersistentUrl))); }catch{}
  }, [photoSlots, KEY.photo]);

  React.useEffect(() => {
    if(!didHydrateRef.current) return;
    if(uploadingRef.current) return;
    try{ localStorage.setItem(KEY.clips, JSON.stringify(clipSlots.map(sanitizePersistentUrl))); }catch{}
  }, [clipSlots, KEY.clips]);

  React.useEffect(() => {
    if(!didHydrateRef.current) return;
    if(uploadingRef.current) return;
    try{
      localStorage.setItem(KEY.state, JSON.stringify({
        format, duration, camera, light, engine, activePhotoIdx, activeClipIdx,
      }));
    }catch{}
  }, [KEY.state, format, duration, camera, light, engine, activePhotoIdx, activeClipIdx]);

  React.useEffect(() => {
    if(!didHydrateRef.current) return;
    try{ localStorage.setItem(KEY.unlock, JSON.stringify(unlocks || {})); }catch{}
  }, [KEY.unlock, unlocks]);

  const isEngineLocked = React.useMemo(() => {
    const def = ENGINE_LIST.find(e => e.key === engine);
    if(!def) return false;
    if(!def.locked) return false;
    return !unlocks?.[def.key];
  }, [engine, unlocks]);

  const cost = React.useMemo(() => {
    if(engine !== "STANDARD") return 0;
    return duration === 10 ? 2 : 1;
  }, [engine, duration]);

  async function importFromLookbook(){
    setStatus("Импортируем кадры из Lookbook…");
    try{
      // если в будущем появится endpoint — подхватим.
      // Пока пытаемся брать из localStorage (старый путь), если есть.
      const maybe = safeParse(localStorage.getItem(`ps_lastLookbookShots_v1:${accountKey}`) || "", null);
      if(Array.isArray(maybe) && maybe.length){
        const next = Array(9).fill("");
        maybe.slice(0,9).forEach((u, i) => { next[i] = sanitizePersistentUrl(u); });
        setPhotoSlots(next);
        setActivePhotoIdx(0);
        setStatus(`Импортировано кадров: ${maybe.slice(0,9).length}`);
        return;
      }
      setStatus("Пока нечего импортировать. Загрузите фото вручную.");
    }catch(e){
      setStatus(`Импорт не удался: ${e?.message || e}`);
    }
  }

  async function onPickPhotoFile(file){
    if(!file) return;
    uploadingRef.current = true;
    setStatus("Загружаем фото…");
    try{
      const dataUrl = await fileToDataUrl(file);
      const out = await fetchJson("/api/assets/fromDataUrl", { method: "POST", body: { dataUrl } });
      const url = sanitizePersistentUrl(out?.url);
      if(!url) throw new Error("Не удалось сохранить фото");

      setPhotoSlots(prev => {
        const next = [...prev];
        next[activePhotoIdx] = url;
        return next;
      });
      setStatus("Фото добавлено.");
    }catch(e){
      setStatus(`Ошибка загрузки фото: ${e?.message || e}`);
    }finally{
      uploadingRef.current = false;
    }
  }

  async function onPickClipFile(file){
    if(!file) return;
    uploadingRef.current = true;
    setStatus("Загружаем клип…");
    try{
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/video/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if(!res.ok){
        const msg = data?.detail || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const url = sanitizePersistentUrl(data?.url);
      if(!url) throw new Error("Не удалось сохранить клип");
      setClipSlots(prev => {
        const next = [...prev];
        next[activeClipIdx] = url;
        return next;
      });
      setStatus("Клип добавлен.");
    }catch(e){
      setStatus(`Ошибка загрузки клипа: ${e?.message || e}`);
    }finally{
      uploadingRef.current = false;
    }
  }

  async function saveActivePhoto(){
    const raw = sanitizePersistentUrl(photoSlots[activePhotoIdx]);
    if(!raw){
      setStatus("Нечего сохранять: выберите кадр с фото.");
      return;
    }
    setStatus("Сохраняем кадр…");
    try{
      const url = resolveAssetUrl(raw);
      const res = await fetch(url, { method: "GET", credentials: "include" });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const ext = (() => {
        const mime = (blob.type || "").toLowerCase();
        if(mime.includes("png")) return "png";
        if(mime.includes("webp")) return "webp";
        if(mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
        const m = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
        return (m ? m[1].toLowerCase() : "png");
      })();

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `frame_${activePhotoIdx + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      setStatus("Кадр сохранён.");
    }catch(e){
      setStatus(`Ошибка сохранения: ${e?.message || e}`);
    }
  }


  function deletePhotoSlot(idx) {
    setPhotoSlots((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : Array(9).fill("");
      next[idx] = "";
      return next;
    });
    setActivePhotoIdx((prevIdx) => (prevIdx === idx ? 0 : prevIdx));
  }

  function deleteClipSlot(idx) {
    setClipSlots((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : Array(9).fill("");
      next[idx] = "";
      return next;
    });
    setActiveClipIdx((prevIdx) => (prevIdx === idx ? 0 : prevIdx));
  }

  async function mergeClips(){
    const urls = clipSlots.map(sanitizePersistentUrl).filter(Boolean);
    if(urls.length < 2){
      setStatus("Нужно минимум 2 клипа для объединения.");
      return;
    }
    setStatus("Объединяем клипы (ffmpeg)…");
    try{
      const out = await fetchJson("/api/video/merge", { method: "POST", body: { clipUrls: urls } });
      const url = sanitizePersistentUrl(out?.url);
      if(!url) throw new Error("Не удалось собрать итог");
      // кладём в первый пустой слот
      setClipSlots(prev => {
        const next = [...prev];
        const idx = next.findIndex(x => !sanitizePersistentUrl(x));
        if(idx >= 0) next[idx] = url;
        else next[8] = url;
        return next;
      });
      setActiveClipIdx(0);
      setStatus("Готово. Итог добавлен в клипы.");
    }catch(e){
      setStatus(`Ошибка объединения: ${e?.message || e}`);
    }
  }

  function handleEngineClick(key){
    const def = ENGINE_LIST.find(e => e.key === key);
    if(!def) return;
    if(def.locked && !unlocks?.[def.key]){
      setUnlockTarget(def.key);
      setUnlockCode("");
      setUnlockOpen(true);
      return;
    }
    setEngine(def.key);
  }

  function tryUnlock(){
    // простой приватный код. позже можно вынести в backend/env
    const ok = (unlockCode || "").trim() === "EVO777";
    if(!ok){
      setStatus("Неверный код доступа.");
      return;
    }
    setUnlocks(prev => ({ ...(prev || {}), [unlockTarget]: true }));
    setEngine(unlockTarget);
    setUnlockOpen(false);
    setStatus(`Движок ${unlockTarget} разблокирован (только для вас).`);
  }

  const activeClipUrl = resolveAssetUrl(clipSlots[activeClipIdx]);

  return (
    <div className="videoPage">
      <div className="videoHero">
        <h1 className="videoTitle">Создай видео</h1>
        <div className="videoSubtitle">Видео из фото. Верх — исходники (1–9), низ — клипы для объединения.</div>
      </div>

      <div className="videoGrid">
        {/* LEFT */}
        <div className="videoCol">
          <div className="videoCard">
            <div className="videoCardHeader">
              <div>
                <div className="videoCardTitle">Фото</div>
                <div className="videoCardHint">Кадры (1–9). Активный кадр подсвечен. При ручной загрузке — добавляем по индексу.</div>
              </div>
            </div>

            <div className="slotPreview" onClick={() => photoFileRef.current?.click()}>
              {sanitizePersistentUrl(photoSlots[activePhotoIdx])
                ? <img src={resolveAssetUrl(photoSlots[activePhotoIdx])} alt="frame" />
                : <div className="slotEmpty">Фото не выбрано</div>}
            </div>

            <div className="slotStrip" aria-label="Кадры (1–9)">
              {photoSlots.map((u, idx) => {
                const ok = !!sanitizePersistentUrl(u);
                const isActive = idx === activePhotoIdx;
                return (
                  <button
                    key={idx}
                    className={`slotCard ${isActive ? "active" : ""} ${ok ? "filled" : ""}`}
                    onClick={() => setActivePhotoIdx(idx)}
                    title={`Кадр ${idx + 1}`}
                    type="button"
                  >
                    {ok ? (
                      <img className="slotThumb" src={resolveAssetUrl(u)} alt={`Кадр ${idx + 1}`} />
                    ) : null}
                    <div className="slotNum">{idx + 1}</div>
                    {ok ? (
                      <button
                        type="button"
                        className="slotX"
                        title="Удалить кадр"
                        onClick={(e) => { e.stopPropagation(); deletePhotoSlot(idx); }}
                      >
                        ×
                      </button>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <input
              ref={photoFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{display:"none"}}
              onChange={(e) => onPickPhotoFile(e.target.files?.[0])}
            />

            <div className="videoLeftBtns">
              <button className="videoBtn" onClick={() => photoFileRef.current?.click()}>Загрузить фото</button>
              <button className="videoBtn secondary" onClick={() => setPhotoSlots(Array(9).fill(""))}>Очистить</button>
              <button className="videoBtn secondary" onClick={saveActivePhoto}>Сохранить</button>
            </div>

            <div className="formatRow">
              <div className="formatLabel">Формат</div>
              {["9:16","1:1","16:9"].map(f => (
                <button
                  key={f}
                  className={`pill ${format===f?"active":""}`}
                  onClick={() => setFormat(f)}
                >{f}</button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="videoCol">
          <div className="videoCard">
            <div className="videoCardTitle">Создание видео</div>

            <div className="sectionTitle">Движение камеры</div>
            <div className="cameraSelectRow">
              <GlassSelect
                ariaLabel="Движение камеры"
                value={camera}
                options={CAMERA_LIST}
                onChange={(v) => setCamera(v)}
              />
            </div>

            <div className="sectionTitle">Освещение</div>
            <div className="row">
              {["Мягкий","Контраст","Тёплый"].map(x => (
                <button key={x} className={`pill ${light===x?"active":""}`} onClick={() => setLight(x)}>{x}</button>
              ))}
            </div>

            <div className="sectionTitle">Модель видео</div>
            <div className="engineRow">
              {ENGINE_LIST.map((e) => {
                const locked = e.locked && !unlocks?.[e.key];
                const active = engine === e.key;
                return (
                  <button
                    key={e.key}
                    className={`engineCard ${active?"active":""} ${locked?"locked":""}`}
                    onClick={() => handleEngineClick(e.key)}
                  >
                    <div className="engineTop">
                      <div className="engineName">{e.label}</div>
                      <div className="engineSub">{e.sub}</div>
                    </div>
                    <div className="engineBottom">
                      {locked ? <span>🔒 Доступ по коду</span> : <span>Доступно</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="sectionTitle">Длительность</div>
            <div className="row">
              {[5,10].map(x => (
                <button key={x} className={`pill ${duration===x?"active":""}`} onClick={() => setDuration(x)}>{x}s</button>
              ))}
            </div>

            <button
              className={`videoBtn primary ${isEngineLocked?"disabled":""}`}
              disabled={isEngineLocked}
              onClick={() => setStatus("Генерация видео будет подключена следующим шагом. Пока доступны загрузка клипов и ffmpeg-объединение.")}
            >
              {isEngineLocked ? "НЕДОСТУПНО (🔒)" : `СДЕЛАТЬ ВИДЕО • ${cost} кр`}
            </button>

            <div className="statusBox">
              <div className="statusTitle">Статус</div>
              <div className="statusText">{status}</div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="videoCol">
          <div className="videoCard">
            <div className="videoCardHeader">
              <div className="videoCardTitle">Видео</div>
            </div>

            <div className="videoPlayer">
              {activeClipUrl
                ? <video src={activeClipUrl} controls />
                : <div className="slotEmpty">Видео появится здесь</div>}
            </div>

            <input
              ref={clipFileRef}
              type="file"
              accept="video/mp4,video/webm"
              style={{display:"none"}}
              onChange={(e) => onPickClipFile(e.target.files?.[0])}
            />

            <div className="clipStrip" aria-label="Клипы (1–9)">
              {clipSlots.map((u, idx) => {
                const ok = !!sanitizePersistentUrl(u);
                const isActive = idx === activeClipIdx;
                return (
                  <button
                    key={idx}
                    className={`slotCard ${isActive ? "active" : ""} ${ok ? "filled" : ""}`}
                    onClick={() => setActiveClipIdx(idx)}
                    title={`Клип ${idx + 1}`}
                    type="button"
                  >
                    {ok ? (
                      <video className="slotThumb" src={resolveAssetUrl(u)} muted playsInline preload="metadata" />
                    ) : null}
                    <div className="slotNum">{idx + 1}</div>
                    {ok ? (
                      <button
                        type="button"
                        className="slotX"
                        title="Удалить клип"
                        onClick={(e) => { e.stopPropagation(); deleteClipSlot(idx); }}
                      >
                        ×
                      </button>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="videoRightBtns">
              <button className="videoBtn" onClick={() => clipFileRef.current?.click()}>Загрузить клип</button>
              <button className="videoBtn secondary" onClick={mergeClips}>Объединить</button>
              <button className="videoBtn secondary" onClick={() => setClipSlots(Array(9).fill(""))}>Очистить</button>
            </div>

            <div className="videoHint">
              <div className="videoHintTitle">Клипы для объединения</div>
              <div className="videoHintText">Клипы добавляются вручную (пока). Нажмите «Объединить» — backend склеит через ffmpeg.</div>
            </div>
          </div>
        </div>
      </div>

      {unlockOpen && (
        <div className="unlockOverlay" onMouseDown={() => setUnlockOpen(false)}>
          <div className="unlockModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="unlockTitle">Доступ к {unlockTarget}</div>
            <div className="unlockText">Введите код доступа (только для владельца).</div>
            <input className="unlockInput" value={unlockCode} onChange={(e) => setUnlockCode(e.target.value)} placeholder="Код" />
            <div className="unlockBtns">
              <button className="videoBtn" onClick={tryUnlock}>ОК</button>
              <button className="videoBtn secondary" onClick={() => setUnlockOpen(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
