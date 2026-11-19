# AUTH-01 — отчёт ночной интеграции

Программный сценарий запроса и погашения кода реализован и проверен с mock HTTP.
Фактическая отправка остаётся отключённой по умолчанию. Настоящие ключи, домен,
production SQL, commit, push, merge и deploy не использовались.

## Где находится результат

- Worktree: `C:\Users\Atell\IdeaProjects\comic-diary-auth01-nightshift`.
- Ветка: `codex/auth01-dispatch-nightshift-20261118`.
- HEAD/база: `96987060cbfe1f12cab2971ec78ab0b2ed8a56d7`.
- Новых коммитов нет; весь результат остаётся незакоммиченным в новом worktree.
- Целевая удалённая AUTH-01-ветка была проверена и fetch выполнен только для неё.
  Полученный SHA совпал с заданным. Другие рабочие копии не синхронизировались.
- Две UI-правки в `comic-diary-auth01` сохранены: `globals.css` (1 добавление,
  15 удалений), `ChapterReadingPanel.tsx` (1 удаление). Их HEAD остался `6397ed8`.
- Основная копия `comic-diary` на `feature/catalog-redesign` осталась чистой.
- `package.json` и `package-lock.json` не изменены.

## Реализовано

1. Рабочая форма `/forgot-password`: запрос, одинаковое подтверждение для всех
   аккаунтов, сообщения о лимите/недоступности/сети, переход к вводу кода.
   Без полного серверного readiness форма не показывается; API отвечает 503.
2. Единый серверный dispatcher: claim -> preflight -> fence -> reservation ->
   повторная проверка под блокировками -> commit необратимого start -> HTTP ->
   outcome bridge -> существующий reserved finalizer.
3. Private HTTP-транспорт Resend: фиксированный endpoint, сохранённый
   Idempotency-Key, один POST, запрет redirects/retries, timeout всего обмена
   10 секунд и предел ответа 4096 байт. Тестовый адаптер C5 не используется.
4. Разрешение определяется PostgreSQL и private-потоком управления. Внешний
   authorization/receipt, письмо, получатель и ключ не принимаются. JSON тела
   создаётся из проверенных примитивов сохранённого задания.
5. Миграция 0044 добавляет `dispatch_started_at` и CHECK. Исторические миграции
   не изменены. Повторная отправка при сбое после commit запрещена.
6. Различаются отказ до HTTP, accepted/rejected/uncertain и неподтверждённая
   фиксация. Зависшие in-flight claims старше пяти минут закрываются uncertain,
   никогда не возвращаются в ready. Старый claim-only finalizer не может
   завершить задание с start-маркером.
7. Worker подключён через Next instrumentation только при явном серверном
   флаге. Runtime Compose прокидывает настройки с default OFF; operator CLI
   включён в Docker-образ и меняет persisted gate через generation CAS.
8. Сохранены verified-mailbox policy, TTL 20 минут, лимиты, атомарное погашение,
   отзыв сессий и отсутствие автоматического входа.
9. В CI добавлены C7-контракт, интеграционная проверка и браузерная приёмка.

Reservation Receipt из Termux не получен и не объявляется проверенным или
использованным. Settlement-кандидат послужил основой обработки результата, но
лишний промежуточный модуль не добавлялся. Слабая authorization-модель транспорта
не переносилась.

## Результаты проверок

| Проверка | Результат |
| --- | --- |
| Auth unit tests | 199/199 PASS |
| Auth source contracts | 325/325 PASS, включая R1C2C7 |
| Новая интеграционная suite, отдельная PostgreSQL 18 | 41/41 PASS |
| Та же suite, отдельная PostgreSQL 17.11 | 41/41 PASS |
| Два независимых Node worker-процесса | Один HTTP, PASS |
| Миграции с нуля и повторное применение на PG17/PG18 | PASS |
| Браузер, включённая форма с mocked POST | 6/6: tea/paper/night, 320/1440 px |
| Браузер, OFF | 6/6, поля запроса отсутствуют, redemption disabled |
| Ошибки браузерной формы | 429, 503, обрыв сети PASS во всех шести вариантах |
| Typecheck / lint / git diff --check | PASS |
| Production Next build, Windows | PASS |
| Docker production image build, Linux | PASS |
| Docker runtime smoke, network=none, recovery OFF | PASS: страница 200, request API 503, БД не требуется |
| Compose config / workflow YAML parse | PASS |

Интеграция проверяет поддельный authorization, неизвестный caller payload,
запрет test seam в production, повтор reservation, legacy-finalizer bypass,
конкуренцию, изменение ключа/digest/почты/generation/OFF и отзыв токена перед
start, потерянную фиксацию, восстановление uncertain, HTTP-ошибки, malformed и
oversized ответы, timeout запроса и потока ответа. Полный API-сценарий проверяет
смену пароля, конкурирующее погашение, отзыв сессий и неизменность дневника/роли.

Все browser POST перехвачены Playwright; до старта Next в QA-сервере блокируется
весь исходящий server fetch. Реальная wire-проверка транспорта использует только
loopback mock server. Provider HTTP и настоящие письма не выполнялись.

Пять исторических source-тестов получили только нормализацию Windows path/EOL.
Ни одно защитное утверждение не удалено; ожидаемые SHA содержимого сохранены.

## Что не проверено и риски

- Новая версия GitHub Actions ещё не запускалась: публикация запрещена.
  Исторические PostgreSQL probes с обязательным exact GitHub CI окружением
  локально не запускались и не обходились подделкой CI-переменных.
- Реальный Resend, DNS, sender verification, TLS к провайдеру и inbox delivery
  не проверены. Accepted не является доказательством доставки.
- `npm audit --omit=dev` на неизменённых зависимостях сообщает **3 production
  alerts: next critical, sharp high, source-map-js high**. Это отдельный release
  gate; exploitability конкретных функций этим отчётом не устанавливается.
  Автоматические dependency upgrades/audit fix не выполнялись.
- Модель консервативная at-most-once attempt: падение после start commit может
  потерять письмо. Повторный HTTP запрещён даже если оно фактически не ушло.
- OFF, завершившийся после authorization commit, не отменяет внешний запрос.
- Исторические неподтверждённые email не становятся подтверждёнными автоматически.
  Их отдельная verification/activation политика и доставка вне этой интеграции
  не объявляются завершёнными.
- AES keyring в runtime одноактивный: ротацию нужно выполнять после drain/expiry
  старых заданий по runbook, иначе они безопасно откажут в расшифровке.

## Что осталось и требует отдельного согласования

1. Review локального diff, затем отдельно разрешённые commit/push/PR/merge.
2. Проверка и устранение dependency advisories перед live/public выпуском.
3. Контролируемый release и применение миграции 0044 на production.
4. Домен, HTTPS и canonical origin; DNS и sender verification в Resend.
5. Send-only API key и отдельный 32-байтный AES key в защищённом серверном
   окружении. Никаких credentials в GitHub CI, браузере, Git или чате.
6. Явное включение runtime-флагов, рестарт worker и generation-CAS включение
   PostgreSQL gate. Автоматического включения нет.
7. Отдельно согласованная реальная отправка в контролируемый ящик, подтверждение
   доставки, погашение кода и проверка старых сессий.

Для подключения провайдера не требуется переписывать recovery-код. Полный
порядок настройки и выключения: `docs/operations/auth01-integrated-dispatch.md`.

## Изменённые и добавленные файлы

### Сервер и схема

- `src/modules/auth/password-reset-dispatch.ts` — новый интегрированный worker/transport/recovery.
- `src/instrumentation.ts` — явный opt-in worker.
- `src/modules/auth/password-reset-request-config.ts` — operational readiness.
- `src/modules/auth/password-reset-request-outbox-claim.ts` — запрет legacy finalize после start.
- `src/modules/auth/password-reset-request-outbox-finalize-reserved.ts` — хронология start при finalize.
- `src/app/api/auth/password-reset/request/route.ts` — fail-closed readiness.
- `src/db/schema.ts`.
- `drizzle/0044_auth_password_reset_dispatch_start.sql`.
- `drizzle/meta/_journal.json`.

### Пользовательская часть

- `src/app/forgot-password/ForgotPasswordForm.tsx`.
- `src/app/forgot-password/page.tsx`.
- `src/app/reset-password/page.tsx`.

### Проверки, упаковка и эксплуатация

- `scripts/auth-dispatch-integration.test.ts`.
- `scripts/auth-recovery-browser-server.mjs`.
- `scripts/auth-recovery-browser.mjs`.
- `scripts/auth-recovery-control.mjs`.
- `scripts/auth-email-verification-c2b2-contract.test.mjs`.
- `scripts/auth-email-verification-c2b3-contract.test.mjs`.
- `scripts/auth-r1c2c5-resend-inert-contract.test.mjs`.
- `scripts/auth-registration-c2b4d2c4b3b2-contract.test.mjs`.
- `scripts/auth-registration-c2b4d2c4b3b3b-contract.test.mjs`.
- `.github/workflows/ci.yml`.
- `Dockerfile`.
- `deploy/compose.production.yml`.
- `.dockerignore`.
- `.gitignore`.
- `docs/operations/auth01-integrated-dispatch.md`.
- `docs/operations/auth01-nightshift-report-20261118.md`.

Локальные TAP-логи, 12 снимков интерфейса, browser manifests и dependency audit
сохранены в игнорируемой `.qa/`; они не входят в Docker context. Временные
серверы и обе тестовые PostgreSQL остановлены. Исходный Docker-контейнер БД на
порту 5433 не менялся. Локальный image `comic-diary:auth01-nightshift-local`
сохранён для review, не опубликован.
