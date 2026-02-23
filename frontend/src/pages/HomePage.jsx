import React from "react";
import { useNavigate } from "react-router-dom";

const Card = ({ title, desc, to, accent = "blue", soon, icon, photoSrc }) => {
  const nav = useNavigate();
  return (
    <button
      className={"navCard accent-" + accent + (soon ? " isSoon" : "")}
      onClick={() => {
        if (soon) return;
        nav(to);
      }}
      title={soon ? "Скоро" : title}
    >
      <div className="navCardTop">
        <div className="navCardIcon">{icon}</div>
        {soon ? <div className="navCardSoon">Скоро</div> : null}
      </div>

      <div className="navCardPhoto">
        {photoSrc ? <img className="navCardPhotoImg" src={photoSrc} alt="" loading="lazy" /> : null}
        <div className="navCardPhotoOverlay" />
        {!photoSrc ? <div className="navCardPhotoHint">Фото</div> : null}
      </div>

      <div className="navCardTitle">{title}</div>
      <div className="navCardDesc">{desc}</div>
    </button>
  );
};

export default function HomePage() {
  return (
    <div className="page">
      <div className="homeHero">
        <h1>PhotoStudio</h1>
        <p className="muted">
          Премиальная панель управления: выбери студию, собери сцену и запускай генерацию.
        </p>
      </div>

      <div className="cardGrid">
        <Card
          title="Фото-студии"
          desc="Витрина студий: Lookbook, предметка, editorial и другие. Начинаем с ядра."
          to="/studios"
          photoSrc="/home_cards/studios.png"
          accent="cyan"
          icon="📷"
        />
        <Card
          title="Создание сцены"
          desc="Собери базу: модель + локация + детали. Потом используем в любой студии."
          to="/scene"
          photoSrc="/home_cards/scene.png"
          accent="green"
          icon="🧩"
        />

        <Card
          title="Создай видео"
          desc="Видео из фото: jobs, прогресс, возобновление. Подключим после стабилизации core."
          to="/video"
          photoSrc="/home_cards/video.png"
          accent="pink"
          icon="🎬"
          soon
        />
        <Card
          title="Трансформация"
          desc="Пересборка образа по референсу: стиль, одежда, фон. Будет позже."
          to="/transform"
          photoSrc="/home_cards/transform.png"
          accent="blue"
          icon="🌀"
          soon
        />
        <Card
          title="Генерация моделей"
          desc="Создание персонажей для фотосессий: типажи, возраст, стиль. Позже."
          to="/models"
          photoSrc="/home_cards/models.png"
          accent="violet"
          icon="🧍"
          soon
        />
        <Card
          title="Принты и дизайн"
          desc="Одежда + лого/дизайн + область размещения + генерация. Позже."
          to="/prints"
          photoSrc="/home_cards/prints.png"
          accent="red"
          icon="🖨️"
          soon
        />
        <Card
          title="Примерочная"
          desc="Try-on режим: примерка одежды на модели с сохранением деталей. Позже."
          to="/tryon"
          photoSrc="/home_cards/tryon.png"
          accent="orange"
          icon="👕"
          soon
        />
      </div>
    </div>
  );
}
