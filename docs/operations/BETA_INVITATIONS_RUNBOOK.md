# Закрытая бета по приглашениям

Публичная регистрация остаётся OFF. Приглашение даёт возможность зарегистрироваться
на привязанный email, а не создаёт готовый аккаунт или роль. Только ADMIN управляет
приглашениями через /admin/invitations; USER/EDITOR запрещены в UI и на сервере.
Существующие verified/legacy аккаунты не изменяются. Recovery не меняется.

## Жизненный цикл

ADMIN указывает email. Создаётся только приглашение на 7 суток, 256-битный секрет
показывается один раз. В БД остаётся domain-separated SHA-256, без сырой ссылки.
Ссылка /register#invite=… не передаёт секрет в URL HTTP-запроса/access log/referer.
Не пересылайте её в общие чаты. Список показывает адрес только ADMIN, статус и срок;
получатель ссылки видит маскированный адрес. После перезагрузки сырой секрет не
восстанавливается. При потере ссылки ADMIN отзывает её и выдаёт новую.

Открытие/проверка ссылки не расходует её. Регистрация с email и собственным паролем
атомарно создаёт pending USER, закрепляет user ID, challenge и encrypted activation
outbox. Вход до подтверждения запрещён. Сохранённый первоначальный пароль сам по
себе не даёт доступ: при подтверждении кода обязательно задаётся окончательный
пароль по существующему pending-activation контракту. Можно использовать тот же.
Автоматического входа после подтверждения нет; пользователь входит обычным способом.

Повтор register после неизвестного commit outcome возвращает acknowledgement того
же аккаунта и не выпускает второе письмо/не меняет пароль. Отдельный resend —
осознанный новый запрос, максимум 5 выпусков за час и интервал 60 секунд. Это новый
challenge/job; старый in_flight/uncertain job не переиспользуется и не повторяется.
Новый код отменяет прежний. UI говорит «запрос принят», а не обещает доставку.

Срок 7 суток действует на создание/продолжение/активацию; код ограничен 30 минутами
и сроком приглашения. Если до конца срока осталось <=60 секунд, постановка письма
откатывается. По истечении срока или отзыве продолжение и активация запрещены.
ADMIN может выдать замену для аккаунта, созданного прежним приглашением: pending ID
переиспользуется, пароль до подтверждения не меняется, почтовые лимиты не сбрасываются.
Обычный исторический pending/legacy/verified аккаунт так не перезаписывается.
После успешной активации приглашение использовано навсегда; отзыв не отключает аккаунт.

Ранее начатый HTTP может завершиться после отзыва/OFF. Отзыв блокирует последующую
активацию, но не отзывает письмо у провайдера. Панель явно предупреждает об этом.
ADMIN creation limit — 100 приглашений/час; операции создания/отзыва аудируются без
секрета в beta_invitation_events. При неизвестном результате создания обновить
список, отозвать лишнюю запись и создать новую; слепого автоматического повтора нет.

## Контракты и блокировки

0051 аддитивна: beta_registration_invitations, beta_invitation_events и nullable
email_verification_tokens.invitation_id. Composite FK связывает invitation/user,
CHECK допускает binding только pending_activation; два триггера сохраняют неизменными
binding, секрет/адрес/срок и необратимые lifecycle markers. Старые INSERT/v1 jobs с NULL
совместимы. Поля старого пилота и его write-once trigger не меняются.

CONTROL → INVITATION → USER → SESSION (только ADMIN) → TOKEN → OUTBOX.
Claim использует CONTROL SHARE, INVITATION SHARE и USER UPDATE. beginDispatch с самого
начала берёт CONTROL UPDATE, затем INVITATION SHARE → USER/TOKEN/OUTBOX UPDATE.
Beta registration/redeem/revoke берут INVITATION UPDATE до USER; SHARE→UPDATE upgrade
не используется. Reserve/fence не запрашивают INVITATION после USER; это маркеры,
не разрешение HTTP. Решающее разрешение — подтверждённый commit beginDispatch.

Новый mode фильтрует только живые invitation-bound pending jobs ДО LIMIT и повторно
проверяет binding, адрес, роль USER, срок и отзыв под блокировками перед start.
Старый pilotAllowsDispatch не ослаблен. Beta работает только при отсутствии пилота
или его закрытии; незавершённый вооружённый пилот никогда не обходится. Старый
legacy pin/UUID/user ID/spent budget не очищается, не списывается и не восстанавливается.
Остальные READY jobs в beta mode не отправляются и не terminalize-ятся при claim.
Неопределённый COMMIT/start, crash/rejected/uncertain не разрешают повтор того же job.

## Production rollout — отдельное согласование включения обязательно

Выпуск кода/0051 разрешён с новыми флагами OFF. Не включать письма вместе с merge.
Текущий серверный Compose НЕ заменять целиком Git-шаблоном: штатный deploy сохраняет
серверный /opt/comic-diary/compose.yml и использует /opt/comic-diary/.env явно.
В Git-шаблоне добавлены default-false mappings двух новых переменных; серверные
mapping/значения нужно подготовить после отдельного согласования, с root:root 600
backup и проверкой config без вывода secrets. Секреты, sender, origins и ключи прежние.

| Настройка | При выпуске кода | После отдельного согласования |
|---|---|---|
| REGISTRATION_ENABLED | false | **false** |
| AUTH_BETA_INVITATION_REGISTRATION_ENABLED | отсутствует/false | true, последним |
| AUTH_BETA_INVITATION_DISPATCH_ENABLED | отсутствует/false | true |
| REGISTRATION_ACTIVATION_REDEEM_ENABLED | прежнее false | true |
| AUTH_ACTIVATION_RESEND_CONFIG_READY | прежнее false | true |
| AUTH_ACTIVATION_SENDER_VERIFIED | прежнее false | true |
| AUTH_ACTIVATION_DISPATCH_ENABLED | прежнее false | true |
| AUTH_ACTIVATION_WORKER_ENABLED | прежнее false | true |
| AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED | прежнее false | true |
| Activation DB gate | OFF generation 2 | ON штатным API с expectedGeneration=2; generation 3 |
| Recovery flags/gate | прежнее состояние | **без изменений** |
| Legacy enabled/request | true/false | **без изменений** |
| Closed pilot + spent budget | сохраняются | **без изменений** |

Сначала свежая status-only проверка SHA, schema/journal 52, queue, pilot и gates,
sender/key presence без значений; затем разрешённая подготовка worker при intake OFF,
штатное включение activation gate, intake последним. Не менять ключи, не сбрасывать
generation и не использовать arm. Нужны здоровые app/readiness и корректный
канонический origin. Существующий recovery остаётся работающим.

Первый реальный тест — только после отдельного разрешения: ADMIN создаёт одну ссылку
для согласованного нового адреса; владелец сам вводит пароль, код и выполняет вход.
Фиксируются только статусы/счётчики, без адреса, ссылки, кода, пароля или payload в отчёте.
Затем проверить ROLE=USER, verified, один bound pending ID и допустимую отправку.

Остановка теста: intake OFF первым, activation gate OFF штатным API с актуальным
generation, worker/dispatch OFF; уже подтверждённые аккаунты/пилот/старые jobs сохранять.
Если произошёл committed start, HTTP ещё может завершиться; никаких повторов вслепую.

## Backup, проверка и откат

До merge: полный PG17/HTTP/mock/browser regression, fresh production backup restore,
0050→0051/replay и previous immutable image на новой схеме. Во время deploy — штатный
pre-migration backup, migrator, app-only update, local/external exact-SHA smoke.
При провале production deploy/HTTPS smoke — диагностика и остановка, без повторного
deploy, ручного rollback или восстановления production БД.

Откат app после отдельного решения не требует down migration: новые таблицы/данные
сохраняются. Предыдущий image не предоставляет invitation UI и не должен включать
публичную регистрацию; новые flags/OFF сохраняются. Незавершённые приглашения не
пытаться активировать старым image. DB rollback не предполагается.
