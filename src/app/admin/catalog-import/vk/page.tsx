import { cookies } from "next/headers";

import {
  ADMIN_IMPORT_SESSION_COOKIE,
  getAdminImportAvailability,
  verifyAdminImportSession,
} from "@/modules/admin-import/admin-import-gate";

export const dynamic = "force-dynamic";

type SearchParams = {
  gate?: string | string[];
  probe?: string | string[];
  community?: string | string[];
};

function firstValue(
  value: string | string[] | undefined,
) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function VkCatalogImportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params =
    await searchParams;

  const gateMessage =
    firstValue(params.gate);

  const probe =
    firstValue(params.probe);

  const community =
    firstValue(params.community) ??
    "https://vk.ru/comics_white_dragon";

  const availability =
    getAdminImportAvailability();

  if (availability === "disabled") {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm font-semibold text-[var(--primary)]">
          R5.3 · VK Catalog Import
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Импорт каталога VK
        </h1>

        <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Админ-импорт отключён
          </h2>

          <p className="mt-3 text-sm text-[var(--muted)]">
            Установите ADMIN_IMPORT_ENABLED=true
            и задайте ADMIN_IMPORT_SECRET
            в локальном окружении сервера.
          </p>
        </section>
      </main>
    );
  }

  if (availability === "misconfigured") {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm font-semibold text-[var(--primary)]">
          R5.3 · VK Catalog Import
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Импорт каталога VK
        </h1>

        <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Админ-импорт настроен не полностью
          </h2>

          <p className="mt-3 text-sm text-[var(--muted)]">
            ADMIN_IMPORT_ENABLED включён,
            но ADMIN_IMPORT_SECRET отсутствует.
          </p>
        </section>
      </main>
    );
  }

  const cookieStore =
    await cookies();

  const session =
    cookieStore.get(
      ADMIN_IMPORT_SESSION_COOKIE,
    )?.value;

  const unlocked =
    verifyAdminImportSession(session);

  if (!unlocked) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm font-semibold text-[var(--primary)]">
          R5.3 · VK Catalog Import
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Импорт каталога VK
        </h1>

        <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Вход в техническую админку
          </h2>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Временный gate будет заменён
            нормальной авторизацией в R7.
          </p>

          {gateMessage === "invalid" ? (
            <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              Неверный admin secret.
            </p>
          ) : null}

          {gateMessage === "expired" ? (
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Админ-сессия истекла.
            </p>
          ) : null}

          <form
            action="/api/admin/catalog-import/session"
            method="post"
            className="mt-5 space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Admin secret
              </span>

              <input
                type="password"
                name="adminSecret"
                autoComplete="off"
                required
                className="w-full rounded-xl border border-black/15 bg-white px-4 py-3"
              />
            </label>

            <button
              type="submit"
              className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white"
            >
              Открыть импорт
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R5.3 · VK Catalog Import
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Импорт каталога VK
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Сейчас это безопасная оболочка.
            Запросы к VK ещё не выполняются,
            а service token не сохраняется.
          </p>
        </div>

        <form
          action="/api/admin/catalog-import/session"
          method="post"
        >
          <input
            type="hidden"
            name="intent"
            value="logout"
          />

          <button
            type="submit"
            className="rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold"
          >
            Закрыть админку
          </button>
        </form>
      </div>

      {probe === "accepted" ? (
        <section className="mt-8 rounded-2xl border border-green-300 bg-green-50 p-5 text-green-900">
          <h2 className="font-semibold">
            Форма принята
          </h2>

          <p className="mt-2 text-sm">
            Community URL прошёл локальную
            проверку. Service token получен
            сервером и отброшен после запроса.
            В VK ничего не отправлялось.
          </p>
        </section>
      ) : null}

      {probe === "invalid-community" ? (
        <section className="mt-8 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          Некорректная ссылка на сообщество VK.
        </section>
      ) : null}

      {probe === "invalid-token" ? (
        <section className="mt-8 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          Service token выглядит некорректно.
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          Подключение VK
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          R5.3.1 проверяет только безопасную
          передачу формы. Реальный read-only
          discovery появится в R5.3.2.
        </p>

        <form
          action="/api/admin/catalog-import/vk/preview"
          method="post"
          className="mt-6 space-y-5"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Сообщество VK
            </span>

            <input
              type="url"
              name="communityUrl"
              required
              defaultValue={community}
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Service token
            </span>

            <input
              type="password"
              name="serviceToken"
              autoComplete="off"
              spellCheck={false}
              required
              className="w-full rounded-xl border border-black/15 bg-white px-4 py-3"
            />

            <span className="mt-2 block text-xs text-[var(--muted)]">
              Не записывается в БД, cookie,
              URL, хранилище браузера или логи.
            </span>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            Проверить форму
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 p-5">
        <h2 className="font-semibold">
          Контракт R5.3.1
        </h2>

        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>✓ временный server-side admin gate</li>
          <li>✓ HttpOnly подписанная админ-сессия</li>
          <li>✓ VK token не сохраняется</li>
          <li>✓ VK token не возвращается клиенту</li>
          <li>✓ каталог и база данных не изменяются</li>
          <li>✓ внешние VK-запросы пока отключены</li>
        </ul>
      </section>
    </main>
  );
}