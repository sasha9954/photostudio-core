import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import { AuthProvider } from "../app/AuthContext.jsx";
import { useAuth } from "../app/AuthContext.jsx";
import { fetchJson } from "../services/api.js";

/**
 * Global notifications (toast) + background job watcher.
 * Goal: if a long-running generation finishes while user is on another page,
 * show a nice "ГОТОВО" message with where it was generated + quick navigation.
 *
 * Implementation is intentionally minimal (no refactor across pages).
 */

function emitNotify(detail) {
  try {
    window.dispatchEvent(new CustomEvent("ps:notify", { detail }));
  } catch {}
}

function formatStudioLabel(studioKey) {
  const k = String(studioKey || "").toLowerCase();
  if (k === "lookbook") return "Lookbook";
  if (k === "scene") return "Сцена";
  if (k === "video") return "Видео";
  return studioKey || "Studio";
}

function NotificationCenter() {
  const nav = useNavigate();
  const [items, setItems] = React.useState([]);
  const seenRef = React.useRef(new Set());

  const push = React.useCallback((n) => {
    const id = String(n?.id || "").trim() || `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);

    const node = {
      id,
      kind: n?.kind || "info", // info|success|error
      title: n?.title || "",
      message: n?.message || "",
      source: n?.source || null,
      actions: Array.isArray(n?.actions) ? n.actions : [],
      createdAt: Date.now(),
      ttlMs: Number.isFinite(n?.ttlMs) ? n.ttlMs : 9000,
    };
    setItems((prev) => [node, ...(prev || [])].slice(0, 4));
  }, []);

  React.useEffect(() => {
    const onNotify = (e) => push(e?.detail || {});
    window.addEventListener("ps:notify", onNotify);
    return () => window.removeEventListener("ps:notify", onNotify);
  }, [push]);

  React.useEffect(() => {
    if (!items.length) return;
    const now = Date.now();
    const timers = items.map((it) => {
      const left = Math.max(1000, (it.ttlMs || 9000) - (now - (it.createdAt || now)));
      return setTimeout(() => {
        setItems((prev) => (prev || []).filter((x) => x.id !== it.id));
      }, left);
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [items]);

  const close = (id) => setItems((prev) => (prev || []).filter((x) => x.id !== id));

  const runAction = (a, id) => {
    try {
      if (a?.to) {
        nav(String(a.to));
      } else if (typeof a?.onClick === "function") {
        a.onClick();
      }
    } finally {
      if (a?.closeOnClick !== false) close(id);
    }
  };

  if (!items.length) return null;

  return (
    <div className="psToastStack" aria-live="polite" aria-relevant="additions">
      {items.map((it) => (
        <div key={it.id} className={`psToast psToast--${it.kind || "info"}`}>
          <button className="psToast__x" type="button" onClick={() => close(it.id)} aria-label="Закрыть">×</button>
          <div className="psToast__top">
            <div className="psToast__title">{it.title}</div>
            {it.source ? (
              <div className="psToast__source">{it.source}</div>
            ) : null}
          </div>
          {it.message ? <div className="psToast__msg">{it.message}</div> : null}
          {it.actions?.length ? (
            <div className="psToast__actions">
              {it.actions.map((a, idx) => (
                <button
                  key={`${it.id}_a${idx}`}
                  className={`psToast__btn ${a?.primary ? "primary" : ""}`}
                  type="button"
                  onClick={() => runAction(a, it.id)}
                >
                  {a?.label || "Ок"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GlobalJobWatcher() {
  const { user } = useAuth();
  const accountKey = user?.id || "guest";
  const notifiedRef = React.useRef(new Set());
  const timerRef = React.useRef(null);

  const notifyDone = React.useCallback((jobId, meta) => {
    const studioKey = meta?.studioKey || "lookbook";
    const mode = meta?.mode ? String(meta.mode).toUpperCase() : null;
    const count = Number(meta?.count || 0);
    const title = meta?.title || "Генерация готова";
    const message = meta?.message || (count ? `Готово кадров: ${count}` : "Можно открыть результат.");

    emitNotify({
      id: `job_done:${jobId}`,
      kind: "success",
      title,
      source: `${formatStudioLabel(studioKey)}${mode ? ` · ${mode}` : ""}`,
      message,
      actions: [
        { label: "Перейти", primary: true, to: meta?.to || "/studios" },
        { label: "Закрыть", primary: false },
      ],
      ttlMs: 11000,
    });
  }, []);

  const notifyError = React.useCallback((jobId, meta, msg) => {
    const studioKey = meta?.studioKey || "lookbook";
    const mode = meta?.mode ? String(meta.mode).toUpperCase() : null;
    emitNotify({
      id: `job_err:${jobId}`,
      kind: "error",
      title: meta?.title || "Ошибка генерации",
      source: `${formatStudioLabel(studioKey)}${mode ? ` · ${mode}` : ""}`,
      message: msg || "Не удалось завершить генерацию.",
      actions: [
        { label: "Открыть", primary: true, to: meta?.to || "/studios" },
        { label: "Закрыть", primary: false },
      ],
      ttlMs: 14000,
    });
  }, []);

  React.useEffect(() => {
    const stop = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const safeLsKeys = () => {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) out.push(k);
        }
      } catch {}
      return out;
    };

    const tick = async () => {
      try {
        // 1) Lookbook jobs: ps_lb_activeJob_v1:<accountKey>:<MODE> -> <jobId>
        const lbPrefix = `ps_lb_activeJob_v1:${accountKey}:`;
        const lbKeys = safeLsKeys().filter((k) => k.startsWith(lbPrefix));

        for (const k of lbKeys) {
          let jobId = null;
          try { jobId = localStorage.getItem(k); } catch {}
          jobId = jobId ? String(jobId).trim() : null;
          if (!jobId) continue;
          if (notifiedRef.current.has(jobId)) continue;

          const mode = String(k.slice(lbPrefix.length) || "").toUpperCase();
          const meta = { studioKey: "lookbook", mode, to: `/studio/lookbook?mode=${mode}` };

          const res = await fetchJson(`/api/lookbook/jobs/${jobId}`);
          const job = res?.job;
          const state = job?.state;

          if (state === "done") {
            const count = Array.isArray(job?.result?.results) ? job.result.results.length : 0;
            notifiedRef.current.add(jobId);
            try { localStorage.removeItem(k); } catch {}
            notifyDone(jobId, { ...meta, count, title: "Фотосессия готова", message: "Готово. Можно открыть результаты." });
          } else if (state === "error") {
            const msg = job?.error || "Ошибка фотосессии";
            notifiedRef.current.add(jobId);
            try { localStorage.removeItem(k); } catch {}
            notifyError(jobId, meta, msg);
          }
        }

        // 2) Scene jobs: ps_sc_activeJob_v1:<accountKey>:<KIND> -> JSON { jobId, action } OR plain <jobId>
        const scPrefix = `ps_sc_activeJob_v1:${accountKey}:`;
        const scKeys = safeLsKeys().filter((k) => k.startsWith(scPrefix));

        for (const k of scKeys) {
          let raw = null;
          try { raw = localStorage.getItem(k); } catch {}
          if (!raw) continue;

          let jobId = null;
          let action = "";
          try {
            const rec = JSON.parse(raw);
            jobId = rec?.jobId ? String(rec.jobId) : null;
            action = rec?.action ? String(rec.action) : "";
          } catch {
            // fallback: old format stores just jobId
            jobId = String(raw).trim();
          }

          if (!jobId) continue;
          if (notifiedRef.current.has(jobId)) continue;

          const kind = String(k.slice(scPrefix.length) || "").toLowerCase(); // model|location
          const mode = kind ? kind.toUpperCase() : null;

          const res = await fetchJson(`/api/scene/jobs/${jobId}`);
          const job = res?.job;
          const state = job?.state;

          const isApply = String(action || job?.action || "").toLowerCase().includes("apply");
          const title = kind === "model"
            ? (isApply ? "Детали модели применены" : "Модель готова")
            : (kind === "location" ? (isApply ? "Детали локации применены" : "Локация готова") : "Сцена готова");

          if (state === "done") {
            notifiedRef.current.add(jobId);
            try { localStorage.removeItem(k); } catch {}
            notifyDone(jobId, {
              studioKey: "scene",
              mode,
              to: "/scene",
              count: 1,
              title,
              message: "Готово. Перейдите в «Создание сцены».",
            });
          } else if (state === "error") {
            const msg = job?.error || "Ошибка сцены";
            notifiedRef.current.add(jobId);
            try { localStorage.removeItem(k); } catch {}
            notifyError(jobId, { studioKey: "scene", mode, to: "/scene", title: "Ошибка сцены" }, msg);
          }
        }
      } catch {
        // ignore transient errors
      } finally {
        timerRef.current = setTimeout(tick, 2000);
      }
    };

    tick();
    return () => stop();
  }, [accountKey, notifyDone, notifyError]);

  return null;
}

export default function ShellLayout(){
  return (
    <AuthProvider>
      <div className="shell">
        <Sidebar/>
        <div className="shellMain">
          <Header/>
          <main className="shellContent"><Outlet/></main>
        </div>
        {/* Global UI overlays */}
        <NotificationCenter />
        <GlobalJobWatcher />
      </div>
    </AuthProvider>
  );
}
        // 3) Video jobs
        try{
          const raw = localStorage.getItem(`${KEY_VIDEO_ACTIVE_JOB}:${accountKey}`);
          const st = raw ? JSON.parse(raw) : null;
          const jobId = st?.jobId;
          if(jobId){
            const res = await fetchJson(`/api/video/jobs/${jobId}`);
            const job = res?.job;
            if(job?.state === "done"){
              localStorage.removeItem(`${KEY_VIDEO_ACTIVE_JOB}:${accountKey}`);
              const title = job?.action === "merge" ? "Видео объединено" : "Видео готово";
              notify({
                title,
                message: "Готово. Перейдите в «Видео».",
                kind: "success",
                actionText: "Перейти",
                actionHref: "/video",
              });
            }else if(job?.state === "error"){
              localStorage.removeItem(`${KEY_VIDEO_ACTIVE_JOB}:${accountKey}`);
              notify({
                title: "Ошибка видео",
                message: job?.error || "Не удалось сделать видео",
                kind: "error",
                actionText: "Открыть",
                actionHref: "/video",
              });
            }
          }
        }catch{}


