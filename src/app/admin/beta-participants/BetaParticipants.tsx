'use client';
import { useRef, useState } from 'react';
import { UserAvatar } from '@/shared/components/UserAvatar';
import type { PublicAppearance } from '@/modules/appearance/policy';
type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  revision: number;
  betaParticipant: boolean;
  betaFrameGranted: boolean;
  appearance: PublicAppearance;
};
function Member({ user }: { user: User }) {
  const [member, setMember] = useState(user.betaParticipant),
    [grant, setGrant] = useState(user.betaFrameGranted),
    [revision, setRevision] = useState(user.revision),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/admin/users/' + user.id + '/appearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betaParticipant: member,
          betaFrameGranted: grant,
          revision,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setNotice(
          data.error === 'appearance_changed'
            ? 'Данные изменились. Обновите страницу перед повторной попыткой.'
            : 'Не удалось сохранить изменения. Обновите страницу.',
        );
        return;
      }
      setRevision(data.revision);
      setNotice('Сохранено.');
    } catch {
      setNotice(
        'Подтверждение не получено. Обновите страницу и проверьте результат перед повторной попыткой.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="reader-panel beta-member" data-beta-user={user.id}>
      <header className="flex items-center gap-3">
        <UserAvatar name={user.name} appearance={user.appearance} />
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{user.name}</h2>
          <p className="text-sm break-all">{user.email}</p>
          <small>
            ID {user.id} · {user.role} · {user.active ? 'Активен' : 'Отключён'}
          </small>
        </div>
      </header>
      <fieldset disabled={busy} className="grid gap-3 mt-4">
        <legend className="sr-only">Доступ к бета-награде</legend>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={member}
            onChange={(e) => {
              setMember(e.target.checked);
              if (!e.target.checked) setGrant(false);
            }}
          />
          Участник закрытой беты
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={grant}
            disabled={!member}
            onChange={(e) => setGrant(e.target.checked)}
          />
          Доступ к рамке «Бета-дракон»
        </label>
        <button
          type="button"
          className="tea-outline justify-self-start"
          onClick={() => void save()}
        >
          {busy ? 'Сохраняем…' : 'Сохранить доступ'}
        </button>
      </fieldset>
      {notice && (
        <p role="status" className="mt-3">
          {notice}
        </p>
      )}
    </article>
  );
}
export function BetaParticipants({ initial }: { initial: User[] }) {
  return (
    <div className="grid gap-4">
      {initial.map((u) => (
        <Member key={u.id} user={u} />
      ))}
    </div>
  );
}
