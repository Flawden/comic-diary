"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

type ErrorPayload = { error?: unknown };

export function ActivationForm({ enabled }: { enabled: boolean }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || submitting) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const token = fields.get("token");
    const newPassword = fields.get("newPassword");
    const newPasswordConfirm = fields.get("newPasswordConfirm");
    if (typeof token !== "string" || typeof newPassword !== "string" ||
        typeof newPasswordConfirm !== "string") {
      setError("Не удалось прочитать форму.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/activate/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, newPasswordConfirm }),
      });
      if (response.ok) {
        form.reset();
        setComplete(true);
        return;
      }
      const data = (await response.json().catch(() => ({}))) as ErrorPayload;
      if (response.status === 429) {
        setError("Слишком много попыток. Попробуйте позже.");
      } else if (response.status === 503) {
        setError("Подтверждение сейчас недоступно. Попробуйте позже.");
      } else if (data.error === "password_mismatch") {
        setError("Пароли не совпадают.");
      } else if (data.error === "weak_password") {
        setError("Пароль должен содержать не менее 10 символов.");
      } else if (data.error === "invalid_or_expired_token") {
        setError("Код недействителен или истёк. Потребуется новый код.");
      } else {
        setError("Не удалось подтвердить почту. Проверьте данные и попробуйте позже.");
      }
    } catch {
      setError("Нет соединения с сервером. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div role="status" className="mt-6 space-y-3 text-sm leading-6 text-[var(--text-primary)]">
        <p>Почта подтверждена, пароль обновлён. Теперь можно войти в аккаунт.</p>
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Перейти ко входу</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <fieldset disabled={!enabled || submitting} className="space-y-5 disabled:opacity-60">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Одноразовый код из письма</span>
          <input type="text" name="token" required minLength={43} maxLength={43}
            pattern="[A-Za-z0-9_-]{43}" autoComplete="off" spellCheck={false}
            autoCapitalize="none" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Новый пароль</span>
          <input type="password" name="newPassword" required minLength={10} maxLength={256}
            autoComplete="new-password" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60" />
          <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">Не менее 10 символов.</span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Повторите новый пароль</span>
          <input type="password" name="newPasswordConfirm" required minLength={10} maxLength={256}
            autoComplete="new-password" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60" />
        </label>
        <button type="submit" disabled={!enabled || submitting}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--primary-foreground)] transition disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? "Подтверждаем…" : "Подтвердить почту"}
        </button>
      </fieldset>
      {error ? <p role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-primary)]">{error}</p> : null}
    </form>
  );
}
