import {
  redirect,
} from "next/navigation";

import { VkReviewConsole } from "@/modules/admin-import/vk/VkReviewConsole";
import { loadVkReviewWorkspace } from "@/modules/admin-import/vk/vk-review-source";

import {
  authorizeAdminCatalogImportPage,
} from "@/modules/admin-import/admin-import-authorization";

export const dynamic = "force-dynamic";

type SearchParams = {
  probe?: string | string[];
  community?: string | string[];
  groupId?: string | string[];
  groupName?: string | string[];
  groupScreenName?: string | string[];
  groupType?: string | string[];
  membersCount?: string | string[];
  apiVersion?: string | string[];
  vkFailure?: string | string[];
  vkCode?: string | string[];
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

  const probe =
    firstValue(params.probe);

  const community =
    firstValue(params.community) ??
    "https://vk.ru/comics_white_dragon";

  const groupId =
    firstValue(params.groupId);

  const groupName =
    firstValue(params.groupName);

  const groupScreenName =
    firstValue(
      params.groupScreenName,
    );

  const groupType =
    firstValue(params.groupType);

  const membersCount =
    firstValue(
      params.membersCount,
    );

  const apiVersion =
    firstValue(params.apiVersion);

  const vkFailure =
    firstValue(params.vkFailure);

  const vkCode =
    firstValue(params.vkCode);

  const authorization =
    await authorizeAdminCatalogImportPage();

  if (!authorization.ok) {
    if (
      authorization.kind ===
      "unauthorized"
    ) {
      redirect(
        "/login?next=/admin/catalog-import/vk",
      );
    }

    if (
      authorization.kind ===
      "forbidden"
    ) {
      return (
        <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
          <p className="text-sm font-semibold text-[var(--primary)]">
            R6.3 · Authorization
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Доступ запрещён
          </h1>

          <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Недостаточно прав
            </h2>

            <p className="mt-3 text-sm text-[var(--muted)]">
              Для технического импорта требуется
              разрешение RUN_BULK_IMPORT.
            </p>
          </section>
        </main>
      );
    }

    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-8">
        <p className="text-sm font-semibold text-[var(--primary)]">
          R6.3 · Authorization
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Импорт каталога VK
        </h1>

        <section className="mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Админ-импорт отключён
          </h2>

          <p className="mt-3 text-sm text-[var(--muted)]">
            Production kill-switch
            ADMIN_IMPORT_ENABLED выключен.
          </p>
        </section>
      </main>
    );
  }

  const reviewWorkspace =
    await loadVkReviewWorkspace();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">
            R5.3 · VK Catalog Import
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Импорт каталога VK
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Service token используется только
            внутри серверного запроса. Сейчас
            выполняется первый реальный
            read-only discovery VK.
          </p>
        </div>


      </div>

      <VkReviewConsole
        candidateSet={
          reviewWorkspace.candidateSet
        }
        candidateSha256={
          reviewWorkspace.candidateSha256
        }
        categories={
          reviewWorkspace.categories
        }
        existingComics={
          reviewWorkspace.existingComics
        }
      />

      {probe === "connected" ? (
        <section className="mt-8 rounded-2xl border border-green-300 bg-green-50 p-5 text-green-900">
          <h2 className="font-semibold">
            VK подключён
          </h2>

          <p className="mt-2 text-sm">
            Сообщество успешно разрешено через
            VK API. Каталог и база данных не
            изменялись.
          </p>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-green-800/70">
                Название
              </dt>
              <dd className="font-semibold">
                {groupName ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="text-green-800/70">
                Group ID
              </dt>
              <dd className="font-semibold">
                {groupId ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="text-green-800/70">
                Screen name
              </dt>
              <dd className="font-semibold">
                {groupScreenName ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="text-green-800/70">
                Тип
              </dt>
              <dd className="font-semibold">
                {groupType ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="text-green-800/70">
                Подписчики
              </dt>
              <dd className="font-semibold">
                {membersCount ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="text-green-800/70">
                VK API
              </dt>
              <dd className="font-semibold">
                {apiVersion ?? "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {probe === "vk-error" ? (
        <section className="mt-8 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          <h2 className="font-semibold">
            VK discovery не выполнен
          </h2>

          <p className="mt-2 text-sm">
            {vkFailure === "authorization"
              ? "VK отклонил service token."
              : vkFailure === "rate-limit"
                ? "VK временно ограничил частоту запросов."
                : vkFailure === "access-denied"
                  ? "VK отказал в доступе к данным сообщества."
                  : vkFailure === "not-found"
                    ? "VK не смог найти указанный объект."
                    : vkFailure === "not-community"
                      ? "Указанная ссылка ведёт не на сообщество."
                      : vkFailure === "network"
                        ? "Сервер Comic Diary не смог связаться с VK API."
                        : "VK вернул неожиданный ответ."}
          </p>

          {vkCode ? (
            <p className="mt-2 text-xs text-red-800/70">
              VK error code: {vkCode}
            </p>
          ) : null}
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
          R5.3.2 выполняет read-only запросы
          utils.resolveScreenName и
          groups.getById. Альбомы, фотографии
          и стена пока не сканируются.
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
            Проверить подключение
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          Диагностический discovery
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Создаёт одноразовый JSON-отчёт с
          публичной структурой сообщества.
          Service token в отчёт не попадает
          и сервером не сохраняется.
        </p>

        <form
          action="/api/admin/catalog-import/vk/discovery"
          method="post"
          className="mt-6 space-y-5"
        >
          <input
            type="hidden"
            name="communityUrl"
            value={community}
          />

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
              Будет использован только для
              этого discovery-запроса.
            </span>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            Скачать discovery JSON
          </button>
        </form>

        <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
          <li>• до 100 альбомов с названиями и размерами</li>
          <li>• по 2 фото из 12 крупнейших обычных альбомов</li>
          <li>• до 50 последних постов стены</li>
          <li>• типы вложений постов и ссылки сообщества</li>
          <li>• никаких записей в каталог или БД</li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          Полный reconciliation
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Проходит всю публичную стену порциями
          по 100 постов и сопоставляет сигналы
          стены, альбомов и ссылок сообщества.
        </p>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Сырые тексты постов в JSON не
          сохраняются. Обычно операция занимает
          около 30–60 секунд.
        </p>

        <form
          action="/api/admin/catalog-import/vk/reconciliation"
          method="post"
          className="mt-6 space-y-5"
        >
          <input
            type="hidden"
            name="communityUrl"
            value={community}
          />

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
              Используется только внутри
              текущего серверного запроса.
            </span>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            Скачать reconciliation JSON
          </button>
        </form>

        <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
          <li>• все обычные VK-альбомы</li>
          <li>• полная стена, максимум 10 000 постов</li>
          <li>• названия комиксов без сырого текста постов</li>
          <li>• first/last seen и число упоминаний</li>
          <li>• album ID из ссылок и фото-вложений</li>
          <li>• original-source links сообщества</li>
          <li>• exact title matches и ID-backed evidence hints</li>
          <li>• unresolved wall-only сигналы</li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          Raw VK Snapshot
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Создаёт версионируемый source snapshot
          для разработки парсера без повторных
          запросов к VK.
        </p>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Snapshot сохраняет исходные названия
          альбомов, VK ID, ссылки, timestamps и
          derived wall evidence. Raw wall text и
          service token исключены.
        </p>

        <form
          action="/api/admin/catalog-import/vk/snapshot"
          method="post"
          className="mt-6 space-y-5"
        >
          <input
            type="hidden"
            name="communityUrl"
            value={community}
          />

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
              Используется только во время
              текущего server-side capture.
            </span>
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            Скачать Raw Snapshot v1
          </button>
        </form>

        <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
          <li>• буквальные raw title VK-альбомов</li>
          <li>• photo/page count без преобразования в главы</li>
          <li>• source URL и timestamps</li>
          <li>• signed cover URL только как временное evidence</li>
          <li>• community original-source links</li>
          <li>• wall evidence без raw post text</li>
          <li>• historical album references</li>
          <li>• никаких записей в каталог или БД</li>
        </ul>
      </section>
      <section className="mt-6 rounded-2xl border border-black/10 p-5">
        <h2 className="font-semibold">
          Контракт R5.3.2
        </h2>

        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>✓ server-side admin gate</li>
          <li>✓ HttpOnly подписанная админ-сессия</li>
          <li>✓ VK token не сохраняется и не логируется</li>
          <li>✓ VK API вызывается только сервером</li>
          <li>✓ только read-only discovery methods</li>
          <li>✓ discovery report не содержит service token</li>
          <li>✓ reconciliation не сохраняет raw wall text</li>
          <li>✓ каталог и база данных не изменяются</li>
        </ul>
      </section>
    </main>
  );
}