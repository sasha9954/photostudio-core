import React from "react";
import { useAuth } from "../app/AuthContext.jsx";

export default function AccountPage(){
  const { user, credits } = useAuth();

  return (
    <div className="pageCard">
      <h1 className="pageTitle">Аккаунт</h1>
      {!user ? (
        <p className="pageSubtitle">Ты сейчас как <b>Гость</b>. Нажми «Войти» справа сверху.</p>
      ) : (
        <>
          <p className="pageSubtitle">Данные аккаунта (server-backed).</p>
          <div style={{ display:"grid", gap:8, maxWidth:520 }}>
            <div className="kv"><span className="k">Имя</span><span className="v">{user.name}</span></div>
            <div className="kv"><span className="k">Email</span><span className="v">{user.email}</span></div>
            <div className="kv"><span className="k">ID</span><span className="v">{user.id}</span></div>
            <div className="kv"><span className="k">Кредиты</span><span className="v"><b>{credits}</b></span></div>
          </div>
        </>
      )}
    </div>
  );
}
