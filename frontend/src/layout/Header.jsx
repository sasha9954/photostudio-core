import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext.jsx";
import { authLogout } from "../services/authApi.js";

const PAGE_TITLES = {
  "/home": "Главная",
  "/studios": "Фото-студии",
  "/scene": "Создание сцены",
  "/video": "Видео",
  "/transform": "Трансформация",
  "/models": "Генерация моделей",
  "/prints": "Принты и дизайн",
  "/tryon": "Примерочная",
  "/credits": "Кредиты",
  "/account": "Аккаунт",
  "/login": "Вход / Регистрация",
};

export default function Header() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, credits, loading, refresh } = useAuth();

  const pageTitle = PAGE_TITLES[loc.pathname] || "PhotoStudio";

  async function onLogout(){
    try{ await authLogout(); }catch{}
    await refresh();
    nav("/home");
  }

  const isLogin = loc.pathname === "/login";

  return (
    <header className="header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14 }}>
      <div className="headerTitle" style={{ flex:"1 1 auto", minWidth:0 }}>
        <div className="headerPageTitle">{pageTitle}</div>
      </div>

      <div className="headerRight" style={{ display:"flex", alignItems:"center", gap:10, marginLeft:"auto", flex:"0 0 auto", justifyContent:"flex-end", flexWrap:"wrap" }}>
        <Link className="pill" to="/account" title="Аккаунт">
          <span className="pillIcon">👤</span>
          <span className="pillText">{loading ? "..." : (user?.name || "Гость")}</span>
        </Link>

        <Link className="pill" to="/credits" title="Кредиты">
          <span className="pillIcon">💳</span>
          <span className="pillText">{loading ? "..." : `${credits} кредитов`}</span>
        </Link>

        {!user && !isLogin ? (
          <Link className="btn" to="/login">🔑 Войти</Link>
        ) : null}

        {user ? (
          <button className="btn btnGhost" onClick={onLogout} title="Выйти">⎋ Выйти</button>
        ) : null}
      </div>
    </header>
  );
}
