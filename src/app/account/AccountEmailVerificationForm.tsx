"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const inputStyle = "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--primary)] disabled:opacity-60";
export function AccountEmailVerificationForm({ requestEnabled }: { requestEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, action: "request" | "redeem") {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = action === "request" ? { currentPassword: data.get("currentPassword") }
      : { currentPassword: data.get("currentPassword"), token: data.get("token") };
    form.reset(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/account/email-verification/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        setFailed(true);
        setMessage(response.status === 429 ? "Слишком много попыток. Попробуйте позже."
          : response.status === 503 ? "Подтверждение почты временно недоступно."
          : response.status === 401 ? "Сессия завершена. Войдите в аккаунт снова."
          : "Не удалось подтвердить данные. Проверьте действующий пароль и код.");
      } else if (action === "request") setMessage("Если запрос принят, письмо придёт на адрес аккаунта. Повторная отправка доступна не чаще раза в минуту, не более пяти отправок за час.");
      else { setDone(true); setMessage("Почта подтверждена. Пароль и вход на устройствах сохранены."); router.refresh(); }
    } catch { setFailed(true); setMessage("Не удалось связаться с сервером. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-6" aria-busy={busy}>
    <p className="text-sm text-[var(--text-secondary)]">Подтвердите почту, чтобы пользоваться восстановлением пароля. Сам пароль при подтверждении не изменится. Не более пяти отправок за час.</p>
    {!done && <>
      {requestEnabled ? <form className="space-y-3" onSubmit={event => submit(event, "request")}>
        <label className="block">Действующий пароль для отправки кода
          <input className={inputStyle} type="password" name="currentPassword" autoComplete="current-password" required disabled={busy} />
        </label>
        <button className="tea-outline" disabled={busy} type="submit">Отправить код на почту</button>
      </form> : <p>Новые письма временно не отправляются. Уже полученный код можно подтвердить ниже.</p>}
      <form className="space-y-3" onSubmit={event => submit(event, "redeem")}>
        <label className="block">Код из письма
          <input className={inputStyle} type="text" name="token" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} minLength={43} maxLength={43} required disabled={busy} />
        </label>
        <label className="block">Введите действующий пароль ещё раз
          <input className={inputStyle} type="password" name="currentPassword" autoComplete="current-password" required disabled={busy} />
        </label>
        <button className="tea-outline" disabled={busy} type="submit">Подтвердить почту</button>
      </form>
    </>}
    {message && <p role={failed ? "alert" : "status"} className="text-sm">{message}</p>}
  </div>;
}
