"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AccountEmailVerificationForm.module.css";

type Step = "password" | "code" | "done";

export function AccountEmailVerificationForm({ requestEnabled }: { requestEnabled: boolean }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const previousOverflow = useRef<string | null>(null);
  const [step, setStep] = useState<Step>(requestEnabled ? "password" : "code");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const stepIndex = step === "password" ? 0 : step === "code" ? 1 : 2;

  useEffect(() => () => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  function open() {
    if (!dialog.current || dialog.current.open) return;
    setDiscard(false);
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.showModal();
  }
  function close() {
    if (locked.current) return;
    if (dirty) { setDiscard(true); return; }
    dialog.current?.close();
  }
  function closed() {
    dialog.current?.querySelectorAll("form").forEach(form => form.reset());
    setDirty(false); setDiscard(false);
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
    trigger.current?.focus();
    if (step === "done") router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: "request" | "redeem") {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = action === "request" ? { currentPassword: data.get("currentPassword") }
      : { currentPassword: data.get("currentPassword"), token: data.get("token") };
    locked.current = true; setBusy(true); setError(""); setMessage("");
    form.reset(); setDirty(false);
    try {
      const response = await fetch(`/api/account/email-verification/${action}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (response.ok) {
        if (action === "request") {
          setStep("code"); setUncertain(false);
          setMessage("Запрос принят сервером. Проверьте входящие и папку «Спам».");
        } else { setStep("done"); setUncertain(false); }
      } else if (action === "request" && response.status >= 500) {
        // A lost commit acknowledgement must not invite a second email request.
        setStep("code"); setUncertain(true);
        setError("Сервер не подтвердил результат запроса. Письмо могло быть отправлено: проверьте почту перед повторным запросом.");
      } else {
        setError(response.status === 429 ? "Слишком много попыток. Попробуйте позже."
          : response.status === 503 ? "Подтверждение почты временно недоступно."
          : response.status === 401 ? "Сессия завершена. Войдите в аккаунт снова."
          : action === "request" ? "Не удалось подтвердить действующий пароль. Проверьте его и попробуйте снова."
          : "Не удалось подтвердить данные. Проверьте действующий пароль и код.");
      }
    } catch {
      if (action === "request") {
        setStep("code"); setUncertain(true);
        setError("Соединение прервалось. Запрос мог быть принят: сначала проверьте почту, не отправляйте его повторно.");
      } else setError("Не удалось получить ответ. Проверьте статус профиля перед новой попыткой.");
    } finally { locked.current = false; setBusy(false); }
  }

  return <div id="email-verification" className={styles.entry}>
    <button ref={trigger} type="button" className="tea-outline" aria-haspopup="dialog" aria-controls={id} onClick={open}>Подтвердить почту</button>
    <p className={styles.hint}>Подтверждённая почта позволит восстановить доступ, если вы забудете пароль.</p>
    <dialog ref={dialog} id={id} className={styles.dialog} aria-labelledby={`${id}-title`}
      onClose={closed} onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Дракотека · ваш аккаунт</p><h2 id={`${id}-title`}>Подтверждение почты</h2></div>
        <button type="button" className={styles.close} aria-label="Закрыть подтверждение почты" disabled={busy} onClick={close}>×</button>
      </header>
      <div className={styles.content} aria-busy={busy}>
        <ol className={styles.steps} aria-label="Этапы подтверждения">
          {["Ваш пароль", "Код из письма", "Готово"].map((label, index) => <li key={label} aria-current={stepIndex === index ? "step" : undefined} data-complete={stepIndex > index}><span aria-hidden="true">{stepIndex > index ? "✓" : index + 1}</span>{label}</li>)}
        </ol>
        {discard && <div className={styles.notice} role="alert"><p>Введённые данные не сохранятся. Закрыть окно?</p><div className={styles.actions}>
          <button type="button" className="tea-outline" autoFocus onClick={() => setDiscard(false)}>Продолжить ввод</button>
          <button type="button" className="tea-outline" onClick={() => dialog.current?.close()}>Закрыть без сохранения</button>
        </div></div>}
        {busy && <p className={styles.notice} role="status"><span className={styles.spinner} aria-hidden="true"/>{step === "password" ? "Принимаем запрос на письмо…" : "Проверяем код и пароль…"}</p>}
        {step === "password" && <>
          <div className={styles.intro}><span className={styles.symbol} aria-hidden="true">✉</span><h3>Защитим доступ к вашей истории</h3><p>Письмо придёт на адрес из аккаунта. Для отправки кода подтвердите действующий пароль. Пароль при этом не изменится.</p></div>
          <form onSubmit={event => void submit(event, "request")} onInput={() => setDirty(true)}>
            <label className={styles.label}>Действующий пароль для отправки кода<input className={styles.input} type="password" name="currentPassword" autoComplete="current-password" required disabled={busy}/></label>
            <button className={styles.primary} type="submit" disabled={busy || !requestEnabled}>{busy ? "Принимаем запрос…" : "Отправить код на почту"}</button>
          </form>
          <p className={styles.hint}>Не более пяти отправок за час.</p>
          <button type="button" className={styles.link} disabled={busy} onClick={() => { dialog.current?.querySelector("form")?.reset(); setDirty(false); setError(""); setStep("code"); }}>У меня уже есть код</button>
        </>}
        {step === "code" && <>
          <div className={styles.intro}><span className={styles.symbol} aria-hidden="true">✉</span><h3>{uncertain ? "Проверьте почту" : "Осталось ввести код"}</h3><p>Доставка может занять некоторое время. Откройте письмо от Дракотеки, скопируйте одноразовый код и введите его ниже вместе с действующим паролем.</p></div>
          {!requestEnabled && <p className={styles.hint}>Новые письма временно не отправляются. Уже полученный код можно подтвердить здесь.</p>}
          {message && <p role="status" className={styles.notice}>{message}</p>}
          <form onSubmit={event => void submit(event, "redeem")} onInput={() => setDirty(true)}>
            <label className={styles.label}>Код из письма<input className={`${styles.input} ${styles.code}`} type="text" name="token" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} minLength={43} maxLength={43} required disabled={busy}/></label>
            <label className={styles.label}>Введите действующий пароль ещё раз<input className={styles.input} type="password" name="currentPassword" autoComplete="current-password" required disabled={busy}/></label>
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Подтверждаем…" : "Подтвердить почту"}</button>
          </form>
          <p className={styles.hint}>Не сообщайте никому код. Закрытие окна не отменяет уже принятый запрос. Ограничение: не чаще одного запроса в минуту и не более пяти отправок за час.</p>
        </>}
        {step === "done" && <div className={styles.success} role="status"><span className={styles.symbol} aria-hidden="true">✓</span><h3>Почта подтверждена</h3><p>Готово! Пароль и вход на устройствах сохранены. Теперь эта почта подходит для восстановления доступа.</p><button type="button" className={styles.primary} onClick={() => dialog.current?.close()}>Вернуться в профиль</button></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </dialog>
  </div>;
}
