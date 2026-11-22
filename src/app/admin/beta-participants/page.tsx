import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { users, userAppearance, appearanceEvents } from '@/db/schema';
import { getCurrentUser } from '@/modules/auth/request-identity';
import { publicAppearance } from '@/modules/appearance/service';
import { BetaParticipants } from './BetaParticipants';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect('/login?next=%2Fadmin%2Fbeta-participants');
  if (actor.role !== 'ADMIN')
    return (
      <div className="reader-page">
        <h1 className="reader-title">Доступ запрещён</h1>
        <p>Участниками беты управляет только администратор.</p>
      </div>
    );
  const { after } = await searchParams;
  const cursor = after && /^\d{1,9}$/.test(after) ? Number(after) : 0;
  const rows = await db
    .select({
      id: users.id,
      name: users.displayName,
      email: users.email,
      active: users.isActive,
      role: users.role,
      appearance: userAppearance,
    })
    .from(users)
    .leftJoin(userAppearance, eq(users.id, userAppearance.userId))
    .where(and(gt(users.id, cursor),isNull(users.deletedAt)))
    .orderBy(asc(users.id))
    .limit(51);
  const page = rows.slice(0, 50);
  const events = await db
    .select()
    .from(appearanceEvents)
    .orderBy(desc(appearanceEvents.id))
    .limit(20);
  return (
    <div className="reader-page admin-page">
      <p className="reader-eyebrow">Панель управления</p>
      <h1 className="reader-title">Участники беты и рамки</h1>
      <nav className="my-5 flex flex-wrap gap-4">
        <Link href="/admin/users">Пользователи</Link>
        <Link href="/admin/invitations">Приглашения</Link>
        <Link href="/admin/beta-participants" aria-current="page">
          Участники беты
        </Link>
      </nav>
      <p className="max-w-3xl mb-5">
        Отметка участия и доступ к эксклюзивной рамке выдаются вручную. Новые
        пользователи не получают их автоматически. Роли, пароли и сессии не
        меняются; выдача не включает рамку за пользователя. Изменения
        записываются в журнал.
      </p>
      <BetaParticipants
        initial={page.map((r) => ({
          id: r.id,
          name: r.name || 'Читатель',
          email: r.email,
          role: r.role,
          active: r.active,
          revision: r.appearance?.revision ?? 0,
          betaParticipant: r.appearance?.betaParticipant ?? false,
          betaFrameGranted: r.appearance?.betaFrameGranted ?? false,
          appearance: publicAppearance(r.appearance),
        }))}
      />
      <nav className="my-5 flex gap-5" aria-label="Страницы участников">
        {cursor > 0 && <Link href="/admin/beta-participants">К началу</Link>}
        {rows.length > 50 && (
          <Link href={'/admin/beta-participants?after=' + page.at(-1)!.id}>
            Следующие пользователи →
          </Link>
        )}
      </nav>
      <details className="reader-panel">
        <summary>Последние изменения доступа</summary>
        {events.length ? (
          events.map((e) => (
            <p className="my-3 text-sm" key={e.id}>
              Пользователь #{e.targetUserId ?? 'удалён'} · участник:{' '}
              {e.betaParticipant ? 'да' : 'нет'} · рамка:{' '}
              {e.betaFrameGranted ? 'доступна' : 'нет доступа'} · администратор
              #{e.actorUserId ?? 'удалён'} ·{' '}
              <time dateTime={e.createdAt.toISOString()}>
                {e.createdAt.toISOString()} (UTC)
              </time>
            </p>
          ))
        ) : (
          <p>Изменений пока нет.</p>
        )}
      </details>
    </div>
  );
}
