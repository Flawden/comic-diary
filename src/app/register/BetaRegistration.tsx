'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ActivationForm } from '../activate/ActivationForm';
type Info = { status: string; emailHint: string; expiresAt: string };
export function BetaRegistration({ enabled }: { enabled: boolean }) {
  const [secret, setSecret] = useState(''),
    [info, setInfo] = useState<Info | null>(null),
    [email, setEmail] = useState(''),
    [phase, setPhase] = useState('closed'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [cooldown, setCooldown] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const value = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (!value) return;
    const abort = new AbortController();
    const task = setTimeout(() => {
      setSecret(value);
      setPhase('loading');
      void fetch('/api/auth/invitations/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: value }),
        signal: abort.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw Error();
          const d: Info = await r.json();
          if (!abort.signal.aborted) {
            setInfo(d);
            setPhase(
              d.status === 'ACTIVE'
                ? 'register'
                : d.status === 'PENDING'
                  ? 'pending'
                  : 'unavailable',
            );
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) {
            setPhase('unavailable');
            setError(
              'Приглашение недоступно. Проверьте ссылку или свяжитесь с администратором.',
            );
          }
        });
    }, 0);
    return () => {
      clearTimeout(task);
      abort.abort();
    };
  }, [enabled]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(
      () => setCooldown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(intent: 'request' | 'resend', form?: HTMLFormElement) {
    if (lock.current) return;
    const body = { intent, invitation: secret, email };
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/auth/invitations/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setError(
          r.status === 429
            ? 'Слишком много запросов. Попробуйте позже.'
            : r.status === 503
              ? 'Регистрация сейчас недоступна. Попробуйте позже.'
              : 'Не удалось продолжить. Проверьте приглашённый email, срок ссылки и пароль (не менее 10 символов).',
        );
        return;
      }
      form?.reset();
      setPhase('pending');
      setCooldown(60);
      setNotice(
        intent === 'request'
          ? 'Запрос принят. Проверьте почту и папку «Спам».'
          : 'Запрос повторного письма принят. Проверьте почту.',
      );
    } catch {
      setError(
        'Ответ не получен. Откройте ту же ссылку заново: повторная регистрация не создаст второй аккаунт.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit('request', e.currentTarget);
  }
  const input =
    'mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)]';
  if (!enabled || phase === 'closed')
    return (
      <p className="mt-4 text-sm text-[var(--text-secondary)]">
        Если администратор выдал вам приглашение, откройте персональную ссылку.
        Готовые аккаунты создавать или получать чужие пароли не нужно.
      </p>
    );
  return (
    <section className="mt-5 space-y-4" aria-label="Регистрация по приглашению">
      {phase === 'loading' && <p role="status">Проверяем приглашение…</p>}
      {info && (
        <p className="break-words text-sm text-[var(--text-secondary)]">
          Приглашение для {info.emailHint}. Срок:{' '}
          {new Date(info.expiresAt).toLocaleString('ru-RU')}.
        </p>
      )}
      {phase === 'unavailable' && !error && (
        <p role="status">
          {info?.status === 'ACTIVATED'
            ? 'Приглашение уже использовано. Войдите в свой аккаунт.'
            : 'Срок приглашения истёк или оно отозвано. Свяжитесь с администратором.'}
        </p>
      )}
      {phase === 'register' && (
        <>
          <h3 className="font-semibold">Шаг 1 из 2 · Получение кода</h3>
          <form className="space-y-4" onSubmit={register}>
            <fieldset disabled={busy} className="space-y-4">
              <label className="block">
                Email (логин)
                <input
                  className={input}
                  name="email"
                  type="email"
                  maxLength={320}
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p className="text-sm text-[var(--text-secondary)]">
                Сначала подтвердите почту. Пароль для входа зададите на
                следующем шаге вместе с кодом из письма.
              </p>
              <button className="tea-outline w-full" type="submit">
                {busy ? 'Запрашиваем…' : 'Получить код на почту'}
              </button>
            </fieldset>
          </form>
        </>
      )}
      {phase === 'pending' && (
        <>
          <h3 className="font-semibold">Шаг 2 из 2 · Подтверждение и пароль</h3>
          <p>
            Без подтверждения почты вход в новый аккаунт недоступен. Введите код
            из письма и задайте окончательный пароль.
          </p>
          <ActivationForm
            enabled
            onComplete={() => {
              setPhase('complete');
              setSecret('');
              history.replaceState(null, '', location.pathname);
            }}
          />
          <details>
            <summary>Письмо не пришло?</summary>
            <p className="mt-3 text-sm">
              Повторная отправка — не чаще раза в минуту и не более пяти за час.
              Новый код отменяет предыдущий. Проверьте также папку «Спам».
            </p>
            <label className="mt-3 block">
              Приглашённый email
              <input
                className={input}
                type="email"
                autoComplete="email"
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="tea-outline mt-3"
              disabled={busy || cooldown > 0 || !email.trim()}
              onClick={() => void submit('resend')}
            >
              {cooldown > 0
                ? 'Повторить через ' + cooldown + ' с'
                : 'Запросить новое письмо'}
            </button>
          </details>
        </>
      )}
      {phase === 'complete' && (
        <div role="status">
          <p>
            Почта подтверждена. Ваш аккаунт готов — войдите с окончательным
            паролем.
          </p>
          <Link href="/login" className="tea-text-action">
            Войти →
          </Link>
        </div>
      )}
      {busy && <p role="status">Запрос обрабатывается…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
