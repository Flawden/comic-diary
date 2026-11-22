'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
type Item = {
  id: number;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  grantsBeta: boolean;
};
type Page = { items: Item[]; nextCursor: number | null };
const labels: Record<string, string> = {
  ACTIVE: 'Ожидает регистрации',
  PENDING: 'Ожидает подтверждения почты',
  ACTIVATED: 'Активировано',
  EXPIRED: 'Истекло',
  REVOKED: 'Отозвано',
};
export function InvitationManager() {
  const [page, setPage] = useState<Page | null>(null),
    [email, setEmail] = useState(''),
    [grantsBeta,setGrantsBeta]=useState(true),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const lock = useRef(false);
  const load = useCallback(async (before?: number) => {
    const r = await fetch(
      '/api/admin/invitations' + (before ? '?before=' + before : ''),
      { cache: 'no-store' },
    );
    if (!r.ok) throw Error();
    const value: Page = await r.json();
    setPage((old) =>
      before && old
        ? { ...value, items: [...old.items, ...value.items] }
        : value,
    );
  }, []);
  useEffect(() => {
    let live = true;
    const task = setTimeout(() => {
      void load().catch(() => {
        if (live) setMessage('Не удалось загрузить приглашения.');
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(task);
    };
  }, [load]);
  async function action(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch {
      setMessage(
        'Ответ не получен. Обновите список перед повтором; потерянную ссылку восстановить нельзя — отзовите её и создайте новую.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const input =
    'mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3';
  return (
    <section className="mt-6 space-y-5" aria-label="Управление приглашениями">
      <form
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            setLink('');
            const r = await fetch('/api/admin/invitations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, grantsBeta }),
            });
            if (!r.ok) {
              setMessage(
                r.status === 409
                  ? 'Для этого адреса уже существует аккаунт. Используйте вход или восстановление.'
                  : r.status === 429
                    ? 'Достигнут лимит создания приглашений. Попробуйте позже.'
                    : 'Не удалось создать приглашение. Проверьте адрес и права.',
              );
              return;
            }
            const created = await r.json();
            setLink(created.link);
            setEmail('');
            await load();
          });
        }}
      >
        <label className="my-4 flex gap-3"><input type="checkbox" checked={grantsBeta} onChange={e=>setGrantsBeta(e.target.checked)} disabled={busy}/>Участник закрытой беты после подтверждения почты</label>
        <p className="text-sm">Награда-рамка выдаётся отдельно. Без галочки — обычное приглашение на регистрацию.</p>
        <label className="block">
          Почта участника
          <input
            className={input}
            type="email"
            required
            maxLength={320}
            autoComplete="off"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="tea-outline mt-4" disabled={busy}>
          {busy ? 'Обрабатываем…' : 'Создать приглашение'}
        </button>
      </form>
      {link && (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
          role="status"
        >
          <p>
            Сохраните ссылку сейчас: повторно показать её нельзя. Отправьте
            лично получателю.
          </p>
          <input
            className={input + ' break-all'}
            readOnly
            aria-label="Новая ссылка приглашения"
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="tea-outline mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(
                () => setMessage('Ссылка скопирована.'),
                () =>
                  setMessage('Выделите ссылку в поле и скопируйте вручную.'),
              );
            }}
          >
            Копировать ссылку
          </button>
          <button
            className="tea-text-action ml-4"
            type="button"
            onClick={() => setLink('')}
          >
            Скрыть ссылку
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <button
        className="tea-text-action"
        type="button"
        disabled={busy}
        onClick={() => void action(() => load())}
      >
        Обновить список
      </button>
      {!page && <p role="status">Загружаем…</p>}
      {page && !page.items.length && <p>Приглашений пока нет.</p>}
      <ul className="space-y-3">
        {page?.items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <h2 className="font-semibold">Приглашение #{item.id}</h2>
            <p className="break-all">{item.email}</p>
            <p>{labels[item.status]} · {item.grantsBeta ? "Участник беты" : "Обычная регистрация"}</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Действует до {new Date(item.expiresAt).toLocaleString('ru-RU')}
            </p>
            {['ACTIVE', 'PENDING'].includes(item.status) && (
              <button
                type="button"
                className="tea-outline mt-3"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Отозвать приглашение? Продолжение регистрации и подтверждение будут запрещены.',
                    )
                  )
                    void action(async () => {
                      const r = await fetch(
                        '/api/admin/invitations/' + item.id + '/revoke',
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: '{}',
                        },
                      );
                      if (!r.ok) throw Error();
                      const result = await r.json();
                      await load();
                      setMessage(result.warning);
                    });
                }}
              >
                Отозвать
              </button>
            )}
          </li>
        ))}
      </ul>
      {page?.nextCursor && (
        <button
          type="button"
          className="tea-outline"
          disabled={busy}
          onClick={() => void action(() => load(page.nextCursor!))}
        >
          Показать ещё
        </button>
      )}
    </section>
  );
}
