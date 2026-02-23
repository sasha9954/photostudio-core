import React from "react";
import { useNavigate } from "react-router-dom";
import { STUDIOS } from "./studiosData.js";
import "./StudiosPage.css";
import { useAuth } from "../app/AuthContext.jsx";

export default function StudiosPage() {
  const nav = useNavigate();
  const { user } = useAuth();

  const accountKey = user?.id || "guest";

  const goStudio = React.useCallback(
    (studioKey) => {
      if (studioKey === "lookbook") {
        // Preserve last selected mode (TORSO/LEGS/FULL) per account.
        const last = (localStorage.getItem(`ps_lb_lastMode_v1:${accountKey}`) || "TORSO").toUpperCase();
        nav(`/studio/lookbook?mode=${encodeURIComponent(last)}`);
        return;
      }
      nav(`/studio/${studioKey}`);
    },
    [nav, accountKey]
  );

  return (
    <div className="page">
      <div className="pageCard">
        <h1 className="pageTitle">Фото-студии</h1>
        <p className="pageSubtitle">Выбери студию. Сцена (модель/локация/детали) используется в любой студии.</p>

        <div className="studGrid">
          {STUDIOS.map((s) => (
            <button
              key={s.key}
              className={`studCard accent-${s.accent}`}
              type="button"
              onClick={() => goStudio(s.key)}
              title={s.title}
            >
              <div className="studMedia">
                {/* Optional future: put real preview images here */}
                <div className="studLetter">{s.letter}</div>
              </div>
              <div className="studInfo">
                <div className="studBadge">{s.badge}</div>
                <div className="studTitle">{s.title}</div>
                <div className="studDesc">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
