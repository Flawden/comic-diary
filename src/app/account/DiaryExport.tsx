"use client";

import { useState } from "react";

export function DiaryExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Войдите в аккаунт заново и повторите экспорт." : "Не удалось создать экспорт. Попробуйте ещё раз.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"\r\n]+)"/)?.[1] ?? "comic-diary.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Файл готов и передан браузеру для скачивания.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось скачать файл. Попробуйте ещё раз.");
    } finally { setBusy(false); }
  }
  return (
    <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold">Экспорт дневника</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Скачайте JSON со статусами, оценками, заметками и отметками глав, включая архив.
        В файл входят свои приватные тайтлы и записи с отключённым отслеживанием.
        Обложки сохраняются ссылками. Время отметки не подтверждает дату чтения.
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Файл содержит ваши личные заметки. Автоматическое восстановление из этого файла пока недоступно.</p>
      <button type="button" onClick={download} disabled={busy} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
        {busy ? "Подготовка файла…" : "Скачать дневник · JSON"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>
    </section>
  );
}
