import React from "react";
import { useAuth } from "../app/AuthContext.jsx";
import { creditsTopup, creditsLedger } from "../services/authApi.js";

const PACKS = [
  { id: "start", title: "Старт", credits: 20, price: 15 },
  { id: "opt", title: "Оптимально", credits: 50, price: 30 },
  { id: "pro", title: "Профи", credits: 100, price: 50 },
];

export default function CreditsPage() {
  const { credits, refresh } = useAuth();
  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [payOpen, setPayOpen] = React.useState(false);
  const [payPack, setPayPack] = React.useState(null);
  const [card, setCard] = React.useState({ number: "", exp: "", cvc: "", name: "" });

  const loadLedger = React.useCallback(async () => {
    try {
      const res = await creditsLedger({ limit: 50 });
      if (res?.ok) setRows(res.rows || []);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  async function buyPack(pack) {
    setErr("");
    setBusy(true);
    try {
      // v0: имитируем оплату картой, на сервере просто делаем topup
      await creditsTopup({ amount: pack.credits, reason: `TOPUP ${pack.credits}` });
      await refresh();
      await loadLedger();
    } catch (ex) {
      setErr(String(ex?.message || ex));
    } finally {
      setBusy(false);
    }
  }

  function openPay(pack) {
    setErr("");
    setPayPack(pack);
    setCard({ number: "", exp: "", cvc: "", name: "" });
    setPayOpen(true);
  }

  function closePay() {
    if (busy) return;
    setPayOpen(false);
  }

  async function submitPay(e) {
    e.preventDefault();
    if (!payPack) return;
    await buyPack(payPack);
    setPayOpen(false);
  }

  // UX: закрытие модалки по ESC
  React.useEffect(() => {
    if (!payOpen) return;
    const onKey = (ev) => {
      if (ev.key === "Escape") closePay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOpen, busy]);

  return (
    <div className="pageCard creditsCard">
      <h1 className="pageTitle">Кредиты</h1>
      <p className="pageSubtitle">Покупка пакетов и история операций</p>

      <div className="creditsTop">
        <div className="balanceBox">
          <div className="muted">Баланс</div>
          <div className="balanceValue">{credits} кредитов</div>
          <div className="muted" style={{ marginTop: 4 }}>
            1 фото = 1 кредит
          </div>
        </div>

        <div className="packsRow">
          {PACKS.map((p) => (
            <div key={p.id} className="packCard">
              <div className="packTop">
                <div>
                  <div className="packTitle">{p.title}</div>
                  <div className="packSub">${p.price}</div>
                </div>
                <div className="packPrice">${p.price}</div>
              </div>
              <div className="packCredits">{p.credits} кредитов</div>
              <button className="btn packBtn" disabled={busy} onClick={() => openPay(p)}>
                Купить
              </button>
            </div>
          ))}
        </div>
      </div>

      {err ? <div className="errorBox">Ошибка: {err}</div> : null}

      <h2 className="sectionTitle">История операций</h2>
      <div className="ledgerList">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="ledgerRow">
              <div className="ledgerLeft">
                <div className="ledgerReason">{r.reason || "Операция"}</div>
                <div className="ledgerTime">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className={"ledgerDelta " + (Number(r.delta) < 0 ? "neg" : "pos")}>
                {Number(r.delta) > 0 ? `+${r.delta}` : r.delta}
              </div>
            </div>
          ))
        ) : (
          <div className="muted">История пустая.</div>
        )}
      </div>

      {payOpen ? (
        <div
          className="payModalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePay();
          }}
        >
          <div className="payModal" role="dialog" aria-modal="true">
            <div className="payModalHead">
              <div>
                <div className="payModalTitle">Оплата</div>
                <div className="payModalSub">
                  Пакет: {payPack?.credits} кредитов — ${payPack?.price}
                </div>
              </div>
            </div>

            <form className="payModalForm" onSubmit={submitPay}>
              <label className="field">
                <div className="fieldLabel">Номер карты (демо)</div>
                <input
                  className="input"
                  value={card.number}
                  onChange={(e) => setCard((s) => ({ ...s, number: e.target.value }))}
                  placeholder="4242 4242 4242 4242"
                />
              </label>

              <div className="payModalCols">
                <label className="field">
                  <div className="fieldLabel">MM/YY</div>
                  <input
                    className="input"
                    value={card.exp}
                    onChange={(e) => setCard((s) => ({ ...s, exp: e.target.value }))}
                    placeholder="12/30"
                  />
                </label>
                <label className="field">
                  <div className="fieldLabel">CVC</div>
                  <input
                    className="input"
                    value={card.cvc}
                    onChange={(e) => setCard((s) => ({ ...s, cvc: e.target.value }))}
                    placeholder="123"
                  />
                </label>
              </div>

              <label className="field">
                <div className="fieldLabel">Имя держателя</div>
                <input
                  className="input"
                  value={card.name}
                  onChange={(e) => setCard((s) => ({ ...s, name: e.target.value }))}
                  placeholder="SASHA"
                />
              </label>

              <div className="payModalActions">
                <button type="button" className="btn btnGhost" disabled={busy} onClick={closePay}>
                  Отмена
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  Оплатить
                </button>
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                v0: тестовый режим. Позже подключим реальный платёж (Stripe/WayForPay).
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
