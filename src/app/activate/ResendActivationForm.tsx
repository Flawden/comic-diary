"use client";
import { useState, type FormEvent } from "react";
export function ResendActivationForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/activate/request", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setMessage(response.status === 202
        ? "Если адрес ожидает подтверждения, новый код появится в почте. Между запросами подождите минуту. Используйте последнее письмо."
        : response.status === 429 ? "Слишком много запросов. Попробуйте позже."
        : "Повторная отправка сейчас недоступна. Попробуйте позже.");
    } catch { setMessage("Не удалось связаться с сервером. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <details className="mt-6 border-t border-[var(--border)] pt-4 text-sm leading-6">
    <summary className="cursor-pointer text-[var(--primary)]">Письмо не пришло или код истёк?</summary>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">Email<input type="email" name="email" required maxLength={320} autoComplete="email" disabled={busy}
        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)]" /></label>
      <button disabled={busy} className="rounded-xl border border-[var(--border)] px-4 py-3 text-[var(--primary)]">{busy ? "Запрашиваем…" : "Запросить новый код"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </details>;
}
