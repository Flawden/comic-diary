# AUTH-01 — подтверждение почты исторического аккаунта

## Границы

База разработки: `f7bf7a8c81134828a82641e2b38ee19fbc555806`.
Это локальная реализация для независимого review. Production rollout и фактическая
доставка этим документом не подтверждены. Настоящий Resend key не читается разработкой.

Исторический активный пользователь (`email_verified_at IS NULL`,
`verification_required_at IS NULL`) сохраняет обычный вход. В профиле он вводит
действующий пароль, получает код на адрес из заблокированной строки USER, затем
вводит код и снова действующий пароль. Пароль, роли, verification_required_at и
сессии при подтверждении не изменяются. Уже забытый пароль нельзя восстановить
одним доказательством владения неподтверждённым историческим email: необходима
отдельная процедура доказательства владения аккаунтом.

## API и защита

- POST `/api/account/email-verification/request`: только `{currentPassword}`,
  общий `202 {ok:true}`, в том числе при cooldown/часовом лимите.
- POST `/api/account/email-verification/redeem`: только `{token,currentPassword}`,
  `200 {ok:true}`. Нет auto-login или Set-Cookie.
- Canonical Origin/Host, JSON и streaming body limit 4096 байт; no-store,
  no-referrer, nosniff. Получатель, userId, purpose и sessionId не принимаются.
- Shared request/redeem PG limiter: 10/user и 20/IP за 15 минут до Argon2.
  Fail-closed при сбое limiter. Выдача: 60 секунд cooldown, максимум 5/час.
- Код: существующие 32 random bytes / canonical base64url, TTL 30 минут.
  Код не помещается в URL, JSON-ответы, логи или browser storage.
- Argon2 проверяется вне транзакции. Под USER FOR UPDATE сравнивается полный
  текущий hash с проверенным snapshot; SESSION перепроверяется по настоящему
  session-token digest, владельцу и expiry. При изменении hash операция отклоняется.
- Выдача: CONTROL -> USER -> SESSION -> TOKEN -> OUTBOX. Погашение:
  USER -> SESSION -> TOKEN -> OUTBOX. Worker: CONTROL -> USER -> TOKEN -> OUTBOX.
  Вызов общего issuer повторно читает уже заблокированный USER той же транзакции.
- Logout/password change сериализуются с операцией. Если verification первым
  получил locks, он может успешно завершиться перед logout/password change.
  Сессия, отозванная раньше проверки под locks, не даёт полномочий.
- Финальные записи проверяют живую сессию и expiry актуальным временем БД.
  Ошибки очереди/шифрования/обновления USER откатывают challenge mutations.
- Код без актуального пароля и действующей сессии не подтверждает аккаунт.

## Общая почтовая цепочка

Миграция 0047 добавляет только purpose в email_verification_tokens. Старые строки
и INSERT без purpose получают pending_activation. CHECK допускает только
pending_activation и legacy_email_verification. Исторические миграции неизменны.

Существующие pending v1 encrypted jobs сохраняют прежний AAD. Новые legacy jobs
используют v2 AAD с purpose. Unknown purpose не получает fallback. Pending
activation остаётся pending-only и заменяет пароль как прежде. Исторический issuer
разрешает только pending и явно записывает pending_activation. Исторический
token-only redemption полностью выведен из эксплуатации: всегда возвращает отказ,
не читает и не изменяет БД при любом purpose и состоянии пользователя. Новые API
от него не зависят. Legacy подтверждается только через сессию и текущий пароль
на обоих шагах; pending — через штатную активацию с новым паролем.

Один activation outbox и worker: claim -> fence -> reservation -> committed start
-> один Resend POST -> accepted/rejected/uncertain. Legacy письмо ведёт только на
`/account`, pending — на `/activate`; sender проверяет соответствие purpose.
Idempotency-Key сохраняется без преобразований. Нет retries/requeue/сброса markers.
Accepted означает принятие провайдером, не доставку. OFF после committed start
не отменяет уже разрешённый HTTP и не запрещает его финализацию.

Abandoned timeout прежний: 5 минут от claimed_at до start, иначе от
dispatch_started_at. Терминализация в uncertain, включая падение до HTTP.
Потеря письма допускается ради at-most-once; новый код выдаётся только явным
действием пользователя с лимитами. Подтверждение кода не зависит от accepted:
потерянный ответ провайдера не отменяет уже полученный пользователем секрет.

## Переключатели, оба default OFF

- `AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED=true`: UI, redemption и eligibility
  legacy dispatch. При OFF READY legacy jobs пропускаются, pending не блокируется.
- `AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED=true`: дополнительно разрешает
  новые письма. OFF сохраняет redemption при включённом основном gate.

Для issuance дополнительно нужны существующие activation sender/origin/key
readiness, worker, dispatch и enabled persisted activation gate с generation > 0.
Публичный REGISTRATION_ENABLED для legacy не требуется. Существующая зависимость
общей activation readiness от REGISTRATION_ACTIVATION_REDEEM_ENABLED сохраняется.
Redemption legacy не зависит от worker/gate: ранее выданные коды можно погасить.
Наличие ключа не включает функцию. Отдельного sender, секрета и dispatcher нет.

Environment gate не является атомарным распределённым kill switch. Для строгого
запрета новых starts используется существующий persisted activation gate, который
затрагивает и pending. Конфигурацию необходимо согласованно доставить всем процессам.
Основной legacy gate ON разрешает отправку уже существующих READY legacy jobs
даже при intake OFF. Перед включением проверить очередь; если такие задания есть,
держать общий persisted gate OFF до их проверки и согласованного запуска.

## Отдельно согласуемый rollout

1. Принять review/CI и проверить backup с восстановлением на отдельной БД.
2. Установить источник серверного `/opt/comic-diary/compose.yml`, env-file и
   invocation deployment gate. Не хранить параметры ручными правками заменяемого
   Compose; не перезаписывать действующий env шаблоном. Полный compose config
   может содержать секреты и не должен попадать в логи/review.
3. При необходимости остановить intake и дренировать общую activation-цепочку.
   Применить 0047 штатным migrator, не выполнять SQL из этого документа вручную.
4. Обновить ВСЕ app/worker процессы с двумя legacy gates OFF. Не backfill users,
   не отзывать сессии. Проверить прежние входы/права пяти аккаунтов оператором.
5. Проверить existing pending tokens/v1 jobs, регистрацию и recovery. Убедиться,
   что ни один старый worker не обслуживает общую очередь.
6. Включить основной legacy gate при intake OFF; проверить canonical HTTPS,
   worker readiness, sender, существующий защищённый ключ и persisted gate.
7. Включить intake. Отдельно разрешить один тест владельца: запрос -> фактическое
   получение -> код+пароль -> неизменность пароля/сессий -> обычный recovery.
8. Раздельно фиксировать provider acceptance, получение письма и redemption;
   мониторить обезличенные ошибки, очередь/uncertain и лимиты, без mailbox/code.

Сведения владельца: Resend для dracoteka.com Verified, API-ключ подготовлен на VPS.
Его подключение и фактическая доставка этим локальным этапом не проверяются.

## Остановка и откат

Сначала request gate OFF; оставить основной gate ON для выданных кодов, если нет
причины блокировать redemption. Для строгой остановки starts выключить общий
persisted gate, дождаться начатых HTTP/финализаций, затем остановить worker.

PostgreSQL автоматически не откатывать. Колонку, CHECK, journal и сохранённые
подтверждения оставить. Не восстанавливать consumed/revoked коды, не отправлять
uncertain повторно, не сбрасывать attemptCount/start/reservation.

Предпочтителен rollback на purpose-aware версию с legacy OFF. Версия до 0047
может делать INSERT благодаря default, но её worker не понимает legacy jobs и
может закрыть READY как expired. Это сознательная граница совместимости,
а не бесшовное продолжение доставки. Не включать legacy с mixed-version worker.
Уже подтверждённый пользователь совместим с прежней verified session policy.

## Приёмка

CI запускает schema/AEAD/purpose/mail unit contracts, upgrade 0046->0047 и replay,
PG17 HTTP/concurrency/fault-injection tests, прежние activation/recovery suites.
Browser fixture запускает production build на loopback, блокирует весь server
provider HTTP, отключает background scheduling, адаптирует canonical ingress
headers и использует только синтетические accounts/keys. Chromium проверяет
реальные request/redeem API и PG в Tea/Paper/Night на 320/390/1440.
Локальные результаты не являются production readiness или проверкой доставки.
