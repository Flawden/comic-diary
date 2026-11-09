"use client";

import { useEffect, useState } from "react";

const editorialNotes = [
  {
    title: "Не спешите выбирать",
    body: "Иногда нужная история находит читателя раньше, чем он успевает её поискать.",
  },
  {
    title: "У каждой истории свой ритм",
    body: "Одни ждут тихого вечера, другие — чашки горячего чая и нескольких свободных минут.",
  },
  {
    title: "Полка всегда немного волшебна",
    body: "За знакомой обложкой может оказаться целый мир, о котором вы ещё не знали.",
  },
  {
    title: "Читайте в своём темпе",
    body: "Здесь не нужно никуда торопиться. Достаточно перевернуть первую страницу.",
  },
  {
    title: "Оставьте место чуду",
    body: "Порой самая интересная история начинается с простого: «А что это?»",
  },
  {
    title: "Пусть вечер будет добрым",
    body: "Мы сохраним место на полке для истории, которая подойдёт именно этому вечеру.",
  },
] as const;

const ROTATION_INTERVAL_MS = 12_000;

export function CatalogEditorialRail() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1200px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intervalId: number | undefined;

    const syncRotation = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }

      if (!desktop.matches || reducedMotion.matches) {
        return;
      }

      intervalId = window.setInterval(() => {
        setActiveIndex((current) => (current + 1) % editorialNotes.length);
      }, ROTATION_INTERVAL_MS);
    };

    syncRotation();
    desktop.addEventListener("change", syncRotation);
    reducedMotion.addEventListener("change", syncRotation);

    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
      desktop.removeEventListener("change", syncRotation);
      reducedMotion.removeEventListener("change", syncRotation);
    };
  }, []);

  const note = editorialNotes[activeIndex];

  return (
    <aside className="catalog-editorial-rail" aria-label="Заметки чайной">
      <div className="catalog-editorial-rail-top">
        <span className="catalog-editorial-rail-symbol" aria-hidden="true">✧</span>
        <p className="catalog-editorial-rail-kicker">Записки чайной</p>
        <span className="catalog-editorial-rail-ornament" aria-hidden="true" />
      </div>

      <div className="catalog-editorial-rail-spacer" aria-hidden="true" />

      <div key={activeIndex} className="catalog-editorial-rail-copy" aria-live="off">
        <p className="catalog-editorial-rail-index">
          ЗАПИСКА {String(activeIndex + 1).padStart(2, "0")} / {String(editorialNotes.length).padStart(2, "0")}
        </p>
        <h2>{note.title}</h2>
        <p>{note.body}</p>
      </div>

      <div className="catalog-editorial-rail-bottom">
        <span className="catalog-editorial-rail-divider" aria-hidden="true" />
        <p>Налейте чаю. История найдётся.</p>
      </div>
    </aside>
  );
}