import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  getAdminWorkspaceAccess,
} from "@/modules/admin-ui/admin-page-access";
import {
  listAdministrativeAuditEvents,
} from "@/modules/admin-ui/admin-read-model";

export const dynamic =
  "force-dynamic";

function formatDetails(
  value: Record<string, unknown>,
) {
  return JSON.stringify(
    value,
    null,
    2,
  );
}

export default async function AdminAuditPage() {
  const access =
    await getAdminWorkspaceAccess();

  if (!access.currentUser) {
    redirect(
      "/login?next=%2Fadmin%2Faudit",
    );
  }

  if (!access.canViewAudit) {
    return (
      <div className="reader-page admin-page">
        <p className="text-sm font-semibold text-[var(--primary)]">
          Comic Diary
        </p>

        <h1 className="mt-2 reader-title">
          Доступ запрещён
        </h1>

        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          Журнал аудита доступен только роли ADMIN
          через разрешение ADMIN_SECURITY.
        </p>

        <Link
          href="/admin"
          className="mt-6 inline-flex font-semibold text-[var(--primary)]"
        >
          ← В панель управления
        </Link>
      </div>
    );
  }

  const events =
    await listAdministrativeAuditEvents();

  return (
    <div className="reader-page admin-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R7.6 · Admin
          </p>

          <h1 className="mt-2 reader-title">
            Журнал аудита
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Последние административные и редакторские действия.
            Записи создаются атомарно вместе с исходной mutation.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-xl border border-black/10 bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
        >
          ← Панель
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-[var(--surface)] p-6 text-sm text-[var(--muted)] shadow-sm">
          Событий пока нет.
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {events.map(
            (event) => (
              <article
                key={event.id}
                className="rounded-2xl bg-[var(--surface)] p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">
                      {event.action}
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {event.targetType} · {event.targetKey}
                    </p>
                  </div>

                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="text-xs text-[var(--muted)]"
                  >
                    {event.occurredAt.toISOString()}
                  </time>
                </div>

                <p className="mt-4 text-sm">
                  Actor:{" "}
                  <strong>{event.actorRole}</strong>
                  {" · "}
                  {event.actorDisplayName ??
                    event.actorEmail ??
                    `user:${event.actorUserId}`}
                </p>

                <pre className="mt-4 overflow-x-auto rounded-xl border border-black/5 p-4 text-xs leading-5">
                  {formatDetails(
                    event.details as Record<string, unknown>,
                  )}
                </pre>
              </article>
            ),
          )}
        </div>
      )}
    </div>
  );
}
