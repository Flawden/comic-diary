"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { PASSWORD_RESET_REQUEST_GENERIC_ACK } from "@/modules/auth/password-reset-request-http";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    if (typeof email !== "string") return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-reset/request", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (response.status === 202) { form.reset(); setComplete(true); }
      else if (response.status === 429) setError("Слишком много запросов. Попробуйте позже.");
      else if (response.status === 503) setError("Восстановление сейчас недоступно. Попробуйте позже.");
      else setError("Не удалось принять запрос. Проверьте адрес и попробуйте позже.");
    } catch { setError("Нет соединения с сервером. Попробуйте позже."); }
    finally { setSubmitting(false); }
  }
  if (complete) return <div role="status" className="mt-5 space-y-4 text-sm leading-6">
    <p>{PASSWORD_RESET_REQUEST_GENERIC_ACK}</p>
    <p>Проверьте входящие и папку «Спам». Код действует 20 минут. После нового запроса прежний код недействителен.</p>
    <Link href="/reset-password" className="font-semibold text-[var(--primary)] hover:underline">Ввести код и новый пароль</Link>
  </div>;
  return <form onSubmit={submit} className="mt-5 space-y-4">
    <fieldset disabled={submitting} className="space-y-4 disabled:opacity-60">
      <label className="block"><span className="mb-2 block text-sm font-medium">Email аккаунта</span>
        <input name="email" type="email" required maxLength={320} autoComplete="email" autoCapitalize="none" spellCheck={false}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
      </label>
      <button type="submit" disabled={submitting} className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
        {submitting ? "Принимаем запрос…" : "Получить код восстановления"}
      </button>
    </fieldset>
    {error ? <p role="alert" className="text-sm leading-6">{error}</p> : null}
  </form>;
}
