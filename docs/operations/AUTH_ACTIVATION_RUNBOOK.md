# AUTH-01: регистрация и подтверждение email

## Статус на 19.11.2026

Resend Verified, API-ключ подготовлен на VPS, реальная интеграция и доставка ещё не проверены.
Это сведения владельца: dracoteka.com подтверждён, DNS отправки настроен, ключ
хранится на VPS lab в /etc/comic-diary/resend-api-key (root:root, 600), ещё не передан
контейнеру. Разработка не читает этот файл или другие копии ключа. Тесты используют
только синтетические значения и mock HTTP. Реальная отправка остаётся OFF.

## Реализованный путь

POST /api/auth/register: canonical Origin, bounded JSON (4096 байт), shared PG
rate limit (10 регистраций/повторных запросов вместе на IP за 15 минут), валидация
email/пароля. CONTROL FOR SHARE -> USER FOR UPDATE -> TOKEN -> OUTBOX. Аккаунт,
хеш кода и AEAD письмо создаются одним commit; ошибка очереди откатывает аккаунт.
Ни код, ни пароль, ни секрет, ни mailbox не возвращаются API. Все существующие
адреса получают тот же 202 {ok:true,activationRequired:true}; без cookie.
Аккаунт не перезаписывается и не реактивируется. Код живёт 30 минут.

POST /api/auth/activate/request принимает только email. Тот же общий IP limiter,
не менее 60 секунд между выдачами, максимум 5 выдач за скользящий час под USER lock.
Для неизвестного/подтверждённого/отключённого адреса тот же 202, без создания аккаунта.
Новый код отзывает прежние и expires только READY письма; IN_FLIGHT/terminal не
перезапускаются. Это новое явное действие пользователя, не повтор старого HTTP.

Worker: claim -> fence -> reservation -> private committed start -> один Resend
POST -> accepted/rejected/uncertain. Используются существующие issuer, AEAD,
preflight, sender и Resend wire contract. Новая миграция 0046 добавляет start marker
и CHECK; 0044 и вся прежняя история неизменны. Финализация требует start и
reservation в locked snapshot и SQL UPDATE. Claim/reservation сами не дают права
записать результат провайдера. PostgreSQL и HTTP не являются общей транзакцией.

CONTROL shared locks совместимы для разных аккаунтов; оператор берёт UPDATE.
Порядок CONTROL -> USER -> TOKEN -> OUTBOX; HTTP выполняется после commit без locks.
Нет глобального lock на время HTTP. Claim/fence отдельно используют USER -> TOKEN
-> OUTBOX без последующего захвата CONTROL, поэтому обратного порядка нет.
OFF, commit которого предшествует start, блокирует start. OFF после start не
отзывает уже разрешённую попытку; её результат можно зафиксировать после OFF.
Таймаут HTTP 10 секунд, максимум 4096 байт ответа, redirect/retry отсутствуют,
Idempotency-Key равен сохранённому случайному ключу issuance без преобразований.
Accepted означает принятие провайдером, а не доставку в почтовый ящик.

Abandoned timeout: 5 минут от claimedAt при dispatchStartedAt IS NULL, иначе
5 минут от dispatchStartedAt. Один и тот же предикат действует в advisory SELECT
и условном UPDATE после coordinated locks; свежий start не считается старым claim.
Recovery переводит в terminal uncertain, никогда в READY. Crash после claim,
reservation или committed start может потерять письмо даже до HTTP. Поздний
worker не получает второй start. Результат потерянного ответа не угадывается.
Приостановленный handoff старше 15 секунд не выполняет HTTP. Это не exactly-once
доставка: выбран at-most-once, после сбоя нужен явный запрос нового кода.

/activate принимает код в теле POST, без query/fragment, требует новый пароль,
однократно подтверждает email и меняет Argon2id hash, отзывает сессии и старые
verification/reset токены. Автоматического входа нет. Вход обычной формой с новым
паролем. «Забыли пароль» использует прежнюю независимую recovery цепочку.

## Независимые server-only настройки, default OFF

- AUTH_ACTIVATION_RESEND_CONFIG_READY=true: только проверка полноты/syntax конфигурации.
- RESEND_API_KEY: настоящий ключ подключается исключительно отдельным rollout.
- AUTH_ACTIVATION_FROM_ADDRESS: bare mailbox подтверждённого sender domain.
- AUTH_ACTIVATION_SENDER_DOMAIN: подтверждённый lowercase domain.
- AUTH_ACTIVATION_PUBLIC_ORIGIN: canonical HTTPS origin, точное совпадение с COMIC_DIARY_PUBLIC_ORIGIN.
- AUTH_ACTIVATION_OUTBOX_KEY_ID / AUTH_ACTIVATION_OUTBOX_KEY_BASE64: отдельный стабильный
  AEAD key (32 random bytes, canonical base64), хранить в server secret storage.
  Не терять/не менять ключ при наличии READY; multi-key rotation в этом этапе не реализована.
- REGISTRATION_ACTIVATION_REDEEM_ENABLED=true: разрешить погашение, независимо от request API.
- AUTH_ACTIVATION_SENDER_VERIFIED=true: явное подтверждение оператора после проверки домена.
- AUTH_ACTIVATION_DISPATCH_ENABLED=true: разрешить подготовку dispatch runtime.
- AUTH_ACTIVATION_WORKER_ENABLED=true: запуск worker через instrumentation, раз в 10 секунд,
  до 10 заданий за tick; local busy guard и PostgreSQL claim для разных процессов.
- AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED=true: разрешить ON оператору, само не включает gate.
- PostgreSQL activation_mail_dispatch_control: default OFF, generation CAS, audited ADMIN_SECURITY action.
- REGISTRATION_ENABLED=true: публичные регистрация и повторная выдача. Само не включает worker.

Неполная конфигурация, redemption OFF или worker flag OFF блокируют public API и ON.
Наличие ключа само по себе ничего не запускает. Flags не являются доказательством
здоровья процесса: перед ON оператор проверяет запущенный worker и логи без PII.
При DB gate OFF новые public requests получают 503 и не создают пользователя/код;
существующие READY остаются READY, worker их не claim. Между gate read и claim OFF
может оставить уже захваченное задание IN_FLIGHT; оно будет uncertain по timeout.
/activate может оставаться ON для кодов, выданных до остановки отправки.

## Порядок отдельного rollout (сейчас НЕ выполнялся)

1. Принять review, отдельно согласовать Git integration и production deploy/migration 0046.
2. После backup/schema review применить миграции и код с public registration OFF,
   persisted gate OFF, worker/dispatch OFF; проверить default-OFF smoke.
3. В защищённом окружении подключить существующий ключ и отдельный AEAD key,
   sender mailbox, verified domain и canonical public origin. Секреты не передавать
   в browser env, build args, logs, Git, review ZIP или командную историю.
4. Включить redemption и config readiness; проверить sender/domain и health.
5. Включить sender verified, dispatch и worker при gate OFF. Проверить worker ready,
   отсутствие отправок и возможность штатного погашения.
6. Авторизованный ADMIN_SECURITY читает GET /api/admin/security/activation-dispatch.
   POST того же same-origin endpoint: {enabled:true,expectedGeneration:N,
   confirm:"ENABLE_ACTIVATION_DISPATCH"}. Текущая live session/role проверяются под
   locks; generation conflict требует перечитать status, без автоматического повтора.
7. Только после worker/gate readiness включить REGISTRATION_ENABLED. Отдельно
   согласованный тест на почту владельца: регистрация -> письмо -> activation -> login.
   Зафиксировать отдельно provider acceptance и фактическое получение письма.
8. Recovery включается по собственному AUTH recovery runbook, с тем же существующим
   Resend key при разрешённых scopes и отдельными флагами/DB gate/AEAD key.

Остановка: сначала REGISTRATION_ENABLED=false (прекратить intake); затем same-origin
ADMIN_SECURITY POST {enabled:false,expectedGeneration:N,
confirm:"DISABLE_ACTIVATION_DISPATCH"}. OFF разрешён даже при неполной конфигурации.
Дождаться уже начатых HTTP/финализаций, затем остановить dispatch/worker. Redemption
желательно оставить включённым для уже выданных кодов. Не сбрасывать markers,
attemptCount, terminal states и не отправлять старые uncertain повторно.

## Остаточные границы

Реальная доставка, sender alignment, VPS/container secret handoff, throughput и
production эксплуатация этим review не подтверждены. Persistent gate защищает
разрешение, но не заменяет мониторинг worker. Репликация/backup AEAD key обязательны.
At-most-once сознательно допускает потерю письма; manual reissue ограничен лимитами.
