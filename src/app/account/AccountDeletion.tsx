"use client";
import { useState, type FormEvent } from "react";
import { DiaryExport } from "./DiaryExport";
export const lifecycleError = (kind: string) => ({
  last_active_admin:"Нельзя удалить или заблокировать последнего активного администратора.",
  invalid_current_password:"Неверный текущий пароль.",
  invalid_confirmation:"Проверьте подтверждение удаления.",
  unauthorized:"Сессия закончилась. Войдите снова.",
  rate_limited:"Слишком много попыток. Попробуйте позже.",
  use_own_account_settings:"Свой аккаунт можно удалить только в настройках профиля.",
  account_deleted:"Аккаунт уже удалён.",
}[kind] ?? "Не удалось изменить аккаунт. Обновите страницу и проверьте состояние перед повторной попыткой.");
export function AccountDeletion() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget, data=new FormData(form);setBusy(true);setError("");
    try {
      const r=await fetch('/api/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:data.get('password'),confirm:data.get('confirm')})});
      const v=await r.json();if(!r.ok){setError(lifecycleError(v.error));setBusy(false);return;}
      form.reset();window.location.replace('/login?account=deleted');
    }catch{setError("Не удалось получить ответ. Обновите страницу, чтобы проверить состояние аккаунта.");setBusy(false);}
  }
  return <section className="reader-panel p-5 mt-6" aria-labelledby="delete-account-title">
    <h2 id="delete-account-title">Удалить мой аккаунт</h2>
    <p className="my-4">Удаление необратимо. Профиль, личный дневник, личные произведения и оформление будут удалены, вход на всех устройствах завершится. Опубликованные отзывы и ответы останутся от имени «Удалённый пользователь». Ранее созданные приглашения, записи безопасности и резервные копии сохраняются; удаление аккаунта не очищает эти архивы.</p>
    <details className="my-4"><summary>Скачать дневник перед удалением</summary><DiaryExport/></details>
    <form onSubmit={submit} className="grid gap-4 max-w-lg">
      <label>Текущий пароль<input name="password" type="password" autoComplete="current-password" required maxLength={256} className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]" /></label>
      <label>Для подтверждения напишите УДАЛИТЬ<input name="confirm" required pattern="УДАЛИТЬ" autoComplete="off" className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]" /></label>
      {error&&<p role="alert">{error}</p>}
      <button className="tea-outline" disabled={busy}>{busy?'Удаляем…':'Удалить аккаунт навсегда'}</button>
    </form>
  </section>;
}
