# AUTH-01 EMAIL ACTIVATION — отчёт для независимой приёмки

19 ноября 2026. Только локальная разработка, без нового push/merge/deploy.

## База и сохранность

Worktree: C:/Users/Atell/IdeaProjects/comic-diary-activation.
Ветка: codex/email-activation-complete-20261119.
База: a96eadd05597e849d2f22d03f87c27f722c3e88f — опубликованная интеграционная
версия с актуальными Tea/Paper/Night, threaded COMMUNITY, RATE и AUTH.
Коммит реализации: 6b816a15c55e2731613aa2d580199df927666c43.
Последующий коммит содержит только status/этот отчёт; точный review HEAD в manifest.json.
Две исходные правки владельца сохранены в другом worktree comic-diary-auth01:
globals.css +1/-15, ChapterReadingPanel.tsx -1. Другие worktree не изменялись.

## Реализовано и проверено локально

Законченный сценарий: регистрация -> pending USER + hashed challenge + encrypted
outbox в одной транзакции -> worker -> Resend wire/mock HTTP -> одноразовое
подтверждение с заменой пароля -> вход обычной формой. Неподтверждённый аккаунт
не получает сессию; старая сессия отзывается при активации.

Переиспользованы существующие AEAD issuer, USER/TOKEN locks, claim, fence,
reservation, dry-run preflight, sender, Resend wire и redemption. Удалён старый
отдельный путь registerPasswordUser без outbox; эта же функция теперь атомарно
обрабатывает регистрацию и ручной запрос нового кода. Новых альтернативных
архитектур и фиктивных sendAuthorized:true нет.

Добавлены private committed dispatch start и миграция 0046. Финализатор activation
требует fence/reservation/generation/start и в locked snapshot, и в SQL. Исправлены
исторические probes/contracts, ожидавшие разрешения finalization до start.
Отправка единственная; ambiguous/lost response -> terminal uncertain, без retry.
Abandoned возраст берётся от start, если он есть, иначе от claim; UPDATE повторяет
тот же предикат под locks. Уже начатый outcome разрешено записать после OFF.
CONTROL FOR SHARE не сериализует независимые HTTP: отдельный поведенческий тест
проверяет progress второго аккаунта при зависшем первом mock HTTP.

Публичный intake default OFF; default OFF worker/dispatch/operator gate независимы.
ON требует readiness, redemption, worker flag и live ADMIN_SECURITY/session с CAS
и audit. DB gate OFF -> 503 без нового аккаунта/кода; существующий READY сохраняется.
409 email enumeration заменена одинаковым 202. Body ограничивается при чтении
stream, Origin проверяется до body/DB. Shared IP limiter и locked per-account
cooldown/5 issuing codes per hour. Ручной resend не меняет пароль и не повторяет
старый HTTP. Старые коды отзываются; неизвестные/подтверждённые адреса не раскрываются.

## Доказательства

| Проверка | Результат |
|---|---|
| Все найденные src unit tests | 285/285 |
| scripts source contracts/spec tests | 334/334 |
| Новая activation integration, PG17.11 | 33/33 |
| Новая activation integration, PG18.1 | 33/33 |
| Recovery regression, PG17.11 | 59/59 |
| Recovery regression, PG18.1 | 59/59 |
| Пять исторических activation PG17 probes | PASS |
| Registration source contract probe | PASS |
| TypeScript / ESLint | PASS |
| Production build | PASS |
| Docker build + OFF smoke --network none | PASS |
| Browser Edge/Chromium, 3 темы x desktop/mobile | 6/6, zero page errors/overflow |
| npm audit --omit=dev --json | 0 advisories |
| dependency/package-lock diff | отсутствует |

33 integration tests включают атомарный rollback при отказе INSERT outbox,
concurrent registration/dispatch/redemption, literal payload/idempotency, реальный
loopback HTTP mock, lost response/rejection/oversized/malformed response, configuration
matrix, OFF before/after start, отсутствие finalization до start для всех трёх
outcomes, expired/revoked code, sessions revocation, quotas, live ADMIN_SECURITY,
shared-lock throughput и независимую PG transaction с recovery, ожидающей USER lock.
Реального ожидания пяти минут нет: подготовленные timestamps/fixtures соблюдают CHECK.
Все unmocked внешние fetch в integration запрещены.

Recovery runtime не менялся. Для PG18 его точная test copy отличается только
разрешённым локальным портом 55491 -> 55522, с тем же disposable user/database.
Пять исторических CI-only PG17 probes запускались из .qa copies, изменён только
порт их exact disposable guard 5432 -> 55524. Исходные CI guards не ослаблены.
В архиве есть copies и SHA-256. PG17 Docker, PG18 отдельный native cluster в этом
worktree; production БД и исходный Docker comic-diary-db не использовались.

Browser проверял latest runtime build: generic pending, invalid-code error, success,
отсутствие авто-сессии, обычный secure/httpOnly login, три темы, 1440/390 px.
Код, email/пароль не присутствуют на review screenshots; synthetic mailbox/TLS key
не включены. Provider traffic подменён mock в тестовом сервере, production entrypoint
не имеет fallback mock transport. Docker OFF smoke использует недоступный localhost:1
и --network none; signup/resend/activation/recovery POST возвращают 503 без БД/писем.

CI workflow явно включает новые readiness/contracts и всю activation PG suite;
сохранены прежние recovery, RATE, COMMUNITY и historical activation probes.
Новый remote CI не запускался (push запрещён). У базовой ветки прежний run
44587303919 имел Verify PASS и database FAIL в отдельном mobile-reader image-load
assertion. Этот незавершённый независимый CI вопрос не выдаётся за исправленный.

Во время разработки исправлялись только целевые fixture/test ошибки: rate-limit
проверка первоначально ожидала лимит 6 вместо существующего 10; browser harness
ожидал /library вместо фактического login redirect /; synthetic start fixture
переведена с Docker SQL now() на тот же application Date clock, чтобы не нарушать
fence CHECK при межпроцессном skew. Проверки не отключались. Первый build без
DATABASE_URL отклонён; итоговый build с адресом disposable БД PASS.

## Требует Git-интеграции

Локальная feature-ветка требует независимой приёмки и отдельного разрешения push/PR/
merge. Ни master, ни опубликованная интеграционная ветка этим этапом не менялись.
Full diff относительно a96eadd и exact source snapshot присутствуют в review ZIP.

## Требует production migration/deploy

Отдельный rollout должен применить 0046 и проверенный код с флагами OFF, настроить
постоянный AEAD key, sender/origin, затем readiness, redemption, worker/dispatch,
ADMIN_SECURITY persisted gate и последним публичный request API. Подробный порядок
ON/OFF и поведение при OFF в AUTH_ACTIVATION_RUNBOOK.md. Ничего из этого не выполнялось.

## Требует реальной доставки

Resend Verified, API-ключ подготовлен на VPS, реальная интеграция и доставка ещё не проверены.
Это предоставленные владельцем сведения о dracoteka.com; домен/ключ повторно не
создавались. Никакой настоящий ключ не читался, не копировался, не выводился и не
подключался. Даже известный владельцу путь Windows не открывался. Понадобятся
защищённое подключение уже существующего ключа и отдельно разрешённая проверка
письма на почту владельца. Accepted от провайдера не считается подтверждением inbox delivery.

## Остаточные риски

1. At-most-once сознательно допускает потерю письма при crash до HTTP или после
   start; автоматического retry/requeue нет. Есть ограниченный manual fresh issuance.
2. Process pause после committed start невозможно атомарно связать с HTTP/PG;
   handoff ограничен 15 секундами, HTTP 10 секундами, abandoned 5 минутами. Это
   не exactly-once delivery. Уже начатый HTTP не отзывается OFF или redemption.
3. Readiness flags не подтверждают health процесса. Нужны operator checks/monitoring.
4. Production delivery, DNS alignment, spam placement и VPS/container handoff не проверены.
5. AEAD key нельзя терять; coordinated multi-key rotation не входит в этот этап.
6. Прежняя mobile-reader CI failure требует отдельного воспроизведения и исправления.

После review package работа останавливается для независимой приёмки.
