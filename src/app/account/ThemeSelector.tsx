"use client";

import { useState } from "react";
import { themes, THEME_COOKIE, type ThemeId } from "@/shared/theme/themes";

const descriptions: Record<ThemeId, { label: string; detail: string }> = {
  night: { label: "Ночная", detail: "Тёмный фон и фиолетовый акцент" },
  paper: { label: "Бумажная", detail: "Светлый фон и тёплые оттенки" },
  tea: { label: "Чайная", detail: "Тёмный фон и мягкий зелёный акцент" },
};

function persistTheme(theme: ThemeId): boolean {
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  const saved = document.cookie.split(";").some((part) => part.trim() === `${THEME_COOKIE}=${theme}`);
  if (saved) document.documentElement.setAttribute("data-theme", theme);
  return saved;
}

export function ThemeSelector({ initialTheme }: { initialTheme: ThemeId }) {
  const [selected, setSelected] = useState(initialTheme);
  const [message, setMessage] = useState("");

  function choose(theme: ThemeId) {
    try {
      if (!persistTheme(theme)) {
        setMessage("Браузер не разрешил сохранить тему. Проверьте настройки cookie.");
        return;
      }
      setSelected(theme);
      setMessage(`Тема «${descriptions[theme].label}» сохранена.`);
    } catch {
      setMessage("Не удалось сохранить тему. Попробуйте ещё раз.");
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Оформление</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Выберите удобную тему. Она сохраняется в этом браузере на год и применяется ко всему сайту.
      </p>
      <fieldset className="mt-4 grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">Тема оформления</legend>
        {Object.keys(themes).map((key) => {
          const theme = key as ThemeId;
          const description = descriptions[theme];
          return (
            <label key={theme} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected === theme ? "border-[var(--primary)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}>
              <input type="radio" name="theme" value={theme} checked={selected === theme} onChange={() => choose(theme)} className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block font-semibold">{description.label}</span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">{description.detail}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <p role="status" className="mt-3 min-h-6 text-sm text-[var(--text-secondary)]">{message}</p>
    </section>
  );
}
