# AUTH-01 — одноразовый пилот: локальная приёмка

Дата: 2026-11-20. Статус: реализация подготовлена для независимого review.
Production readiness и реальная доставка не заявляются.

## Исходная точка

- HEAD/base: `ca60fb2b25f83ee1b5698c5ae3eb06865806a882`.
- Tree базы: `38620aabf750cf7e4f5a9c7111bb4697cc889f4a`.
- Ветка: `feature/auth-legacy-one-shot-pilot-20261120`.
- Worktree: `C:\Users\Atell\IdeaProjects\comic-diary-auth-legacy-pilot`.
- Новых коммитов нет. Изменения сохранены локально, без staging/push.
- Другие worktree не редактировались. В `comic-diary-auth01` сохранены чужие
  `src/app/globals.css` и `src/modules/library/components/ChapterReadingPanel.tsx`.

## Выбор архитектуры и гарантии

Расширена существующая singleton CONTROL row: дополнительная таблица ввела бы
новый обязательный lock во всю цепочку. Используется прежний dispatcher,
encrypted activation outbox, preflight, fence, reservation, start и finalizer.
Purpose isolation и secure session/password reauthentication не заменены.

Пилот имеет один случайный UUID, фиксированный user 1 и один закреплённый outbox.
Пользователь определяется сервером из сессии; API не принимает user/outbox/purpose.
Пин создаётся атомарно с challenge/outbox. Повторные и параллельные запросы после
пина отклоняются до нового enqueue. Без успешного Argon2 и проверки актуального
hash/сессии под locks выдачи по-прежнему нет.

Claim фильтрует разрешённый ID, user и purpose до LIMIT 16, затем повторно
проверяет locked CONTROL и фактические строки. BeginDispatch повторяет policy
после locks. CAS CONTROL и outbox start выполняются в одной транзакции. Нулевой
результат outbox UPDATE после списания вызывает rollback. HTTP разрешён только
после успешного подтверждения commit. Отказ/неопределённость/потеря подтверждения
не возвращают бюджет. At-most-once означает от нуля до одного POST, а не гарантию
доставки ровно одного письма.

При активном/закрытом пилоте другие pending jobs остаются нетронутыми. Abandoned
recovery ограничен закреплённым job, включая проверку после ожидания CONTROL.
OFF и закрытие не отменяют уже committed start: его outcome штатно фиксируется.
Код погашается существующим защищённым сервисом; пароль и сессии не меняются.

## Locks

- Request: CONTROL UPDATE → USER UPDATE → SESSION UPDATE → TOKEN → OUTBOX.
- Claim: CONTROL SHARE → USER UPDATE → TOKEN UPDATE → OUTBOX UPDATE.
- Start: CONTROL UPDATE → USER UPDATE → TOKEN UPDATE → OUTBOX UPDATE.
- Recovery: CONTROL SHARE → USER UPDATE → TOKEN UPDATE → OUTBOX UPDATE.
- Redeem и finalizer сохраняют прежний порядок подмножества locks.
- Повторная запись CONTROL использует уже удерживаемый UPDATE lock; повышения
  SHARE до UPDATE внутри транзакции нет.
- Оператор arm: activation CONTROL UPDATE → recovery CONTROL SHARE → USER UPDATE;
  очереди проверяются чтением при выключенном intake и gates. Close берёт только
  activation CONTROL UPDATE. Эти команды не запускают transport и не меняют gate.

Гонка close/start проверена двумя независимыми PostgreSQL соединениями с
подтверждением фактического ожидания lock через pg_stat_activity. Worker после
ожидания видит committed closure и выполняет ноль HTTP.

## Migration review

Номер 0048 был свободен. Добавлены шесть nullable полей, CHECK формы состояния,
write-once UPDATE trigger, journal entry и связанный Drizzle snapshot. Исторические
миграции не изменены. Установка ничего не включает и не меняет user/session/token.
Отсутствие FK у outbox pin намеренное: удаление job не должно стирать tombstone.
Обычные UPDATE enabled/generation остаются допустимыми после arm/consume/close.
Нельзя обнулить/подменить уже заданные identity, pin, used или closed timestamp.

Изолированный upgrade-тест создаёт БД с миграциями до 0047, добавляет синтетические
данные, применяет текущий штатный Drizzle migrator, сравнивает старые строки и
первые 48 journal records, проверяет 49 итоговых записей, replay, schema columns,
CHECK и trigger. Существующий purpose migration test расширен только в ожидаемом
числе применённых миграций: используется длина journal, остальные проверки сохранены.

## Изменённые файлы

| Файл | Назначение |
|---|---|
| `src/db/schema.ts` | Шесть полей CONTROL и shape CHECK |
| `drizzle/0048_activation_one_shot_pilot.sql` | Аддитивная миграция и immutable trigger |
| `drizzle/meta/0048_snapshot.json` | Новый связанный snapshot |
| `drizzle/meta/_journal.json` | Запись 0048 |
| `src/modules/auth/activation-mail-pilot.ts` | Pure policy issue/dispatch |
| `src/modules/auth/activation-mail-pilot.test.ts` | Проверка политики |
| `src/modules/auth/legacy-email-verification-service.ts` | Эксклюзивный CONTROL и атомарный pin |
| `src/modules/auth/registration-activation-outbox-claim.ts` | Фильтр до LIMIT и locked recheck |
| `src/modules/auth/registration-activation-dispatch.ts` | Atomic budget/start, фильтр recovery |
| `scripts/auth-activation-pilot-control.mjs` | Серверный status/arm/close без reset |
| `scripts/auth-activation-pilot-contract.test.mjs` | SQL/schema/CI/lock contracts |
| `scripts/auth-activation-pilot-migration.test.ts` | Upgrade/replay/совместимость PG17 |
| `scripts/auth-activation-pilot-integration.test.ts` | 21 поведенческий тест |
| `scripts/auth-verification-purpose-pg.test.ts` | Учёт новой аддитивной миграции |
| `Dockerfile` | Включение operator CLI в image, без автозапуска |
| `.github/workflows/ci.yml` | Policy/contracts и оба PG pilot-набора |
| `docs/operations/AUTH_LEGACY_ONE_SHOT_PILOT.md` | Порядок и ограничения операций |
| `docs/operations/AUTH_LEGACY_EMAIL_VERIFICATION_RUNBOOK.md` | Ссылка и обязательный arm-before-enable |
| `docs/operations/PROJECT_STATUS.md` | Локальный checkpoint |
| `docs/operations/AUTH_LEGACY_ONE_SHOT_PILOT_REVIEW_RU.md` | Этот отчёт |

## Результаты

| Проверка | Результат |
|---|---|
| Все src unit и scripts contract tests | 654 PASS, 0 FAIL, 0 SKIP |
| Команды verify из CI | 61 команда, 0 неуспешных |
| PG17 CI-equivalent regression | 30 команд, 0 неуспешных; 243 TAP assertions плюс probes |
| Pilot PG17 | 21/21 PASS |
| Upgrade 0047→0048/replay | PASS в отдельно созданной и удалённой БД |
| Existing activation / legacy / recovery | 33 / 31 / 59 PASS |
| Purpose/v1, RATE, COMMUNITY, fence/reservation/operator probes | PASS в полном PG логе |
| Typecheck / ESLint | PASS |
| Production build / Docker image build | PASS |
| Docker OFF smoke | readiness 200; legacy request/redeem 503 |
| Реальный Resend key в smoke | Отсутствует; worker flags OFF |
| Изменения UI | Нет; browser QA не запускалась |
| Remote GitHub CI | Не запускался: push запрещён |

Тесты используют только синтетические credentials/keys и mock HTTP. PG runner и
OFF app работали в namespace собственного disposable PG17 на Docker internal
network, без внешнего маршрута. Существующая БД `comic-diary-db` не использовалась.
Счётчики TAP в разных наборах пересекаются; суммировать их как уникальные тесты нельзя.

Проверены parallel requests/workers, чужая сессия и недопустимые API поля,
подмена pin, replay, accepted/rejected/uncertain, crash до/после start и после HTTP,
потеря issue/start COMMIT acknowledgement, OFF/ON/generation/env changes,
новый процесс worker, pending jobs перед LIMIT, закрытие/гонка locks, ошибка
enqueue/start write и rollback, сохранность пароля/сессий при redeem.

Во время проверки исправлены две проблемы исключительно test harness: CJS/ESM
импорт отдельного Node-процесса и накопленные rate-limit записи disposable fixture.
После исправления весь набор повторно прошёл. Защитные ожидания не ослаблялись.

## Остаточные риски и условия независимой приёмки

1. NULL pilot ID сохраняет общую историческую семантику. Поэтому arm при всех
   intake/workers/gates OFF обязателен ДО любого включения пилота. Миграция сама
   пилот не активирует. Это надо подтвердить отдельным rollout review.
2. Потеря письма до HTTP или при lost commit ack допустима: одноразовый бюджет
   расходуется необратимо, автоматического повтора нет.
3. Close не открывает general dispatch. Для общего запуска понадобится отдельная
   политика; reset пилота не предусмотрен и не должен применяться вручную.
4. Старый/mixed runtime не знает policy: rollback старого image допустим только
   при полном AUTH OFF и обоих gates OFF. Schema/tombstone сохраняются.
5. Отдельный recovery worker/gate должен оставаться OFF во время пилота. Пилот
   изменяет activation chain, не вводит глобальный контроль другого dispatcher.
6. DB superuser может удалить CONTROL или восстановить старую БД. Гарантия
   не покрывает такие административные вмешательства. В app/CLI reset отсутствует.
7. Эксклюзивный CONTROL сериализует issue/start; допустимо для единичного пилота.
8. PG18, реальная доставка, production permissions/configuration и remote CI этим
   локальным этапом не проверялись. UI не менялся.

Никаких production подключений, SQL, секретов, настоящих писем, AUTH enable,
commit, push, merge или deploy в этом этапе не выполнялось. Следующее действие —
независимый review, не автоматическое продолжение rollout.
