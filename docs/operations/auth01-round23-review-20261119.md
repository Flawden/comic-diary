# AUTH-01 Round 2.3 — dispatch start / abandoned recovery

Работа выполнена только в `comic-diary-auth01-nightshift`, ветка
`codex/auth01-dispatch-nightshift-20261118`. HEAD остаётся
`96987060cbfe1f12cab2971ec78ab0b2ed8a56d7`. Изменения локальные, без commit,
push, merge, deploy, обновления зависимостей и обращений к Resend.

## Подтверждённая причина

До исправления и advisory SELECT, и UPDATE recovery проверяли только
`claimed_at <= cutoff`. Старый claim мог пройти все guards и получить свежий
committed `dispatch_started_at`: срок claim не является запретом start,
а токен в этот момент ещё действителен. CONTROL-lock сериализует транзакции,
но прежний предикат после ожидания этого lock всё равно считал строку старой.
Поэтому блокировки сами по себе не защищали свежий start от recovery.

На неизменённом dispatcher из принятого Round 2.2 воспроизведены:

- Три A/G-теста: старый claim, свежий committed start, recovery возвращает 1,
  один mock POST, результат `not_recorded` для accepted/rejected/uncertain.
  `evidence/reproduction-before-pg18.tap`: 0 passed / 3 failed.
- Конкурентный случай: start держит CONTROL и ждёт USER; recovery уже выбрал
  старую строку без start и ждёт CONTROL. После освобождения USER start
  фиксируется, но recovery всё равно терминализует строку.
  `evidence/concurrency-before-pg18.tap`: start-first failed, recovery-first passed.

Это реальные независимые PostgreSQL-соединения, не симуляция SQL и не source
contract. Порядок ожидания подтверждается `pg_blocking_pids` в `pg_stat_activity`.
`evidence/dispatcher-before.ts` побайтово совпадает с dispatcher в принятом архиве
Round 2.2; SHA-256 записан в `architecture-preserved.json`. Для повторения до
исправления в отдельной disposable-копии достаточно использовать этот dispatcher
и текущий integration-файл с фильтром `Round 2.3 A/G` либо `Round 2.3 D`.
Не заменять им файлы текущего review worktree.

## Минимальное исправление

В recovery один Drizzle-предикат используется в обоих SQL-запросах:

```sql
state = 'in_flight' AND (
  (dispatch_started_at IS NULL AND claimed_at <= :cutoff)
  OR
  (dispatch_started_at IS NOT NULL AND dispatch_started_at <= :cutoff)
)
```

`:cutoff` фиксируется один раз при вызове: application time минус пять минут.
Граница включительная. SELECT только обнаруживает кандидатов; UPDATE повторно
проверяет состояние и возраст по столбцам текущей строки. Он не использует
значения timestamps из advisory snapshot. После ожидания CONTROL транзакция
start уже зафиксирована, и UPDATE видит свежий start. При ожидании row lock
PostgreSQL также перепроверяет условный UPDATE на актуальной версии строки.

Порядок остаётся CONTROL → USER → TOKEN → OUTBOX (последний lock берёт UPDATE).
Если recovery первым получил CONTROL для старого claim без start, он сохраняет
terminal uncertain; worker затем читает это состояние и не начинает HTTP.
Если start первым зафиксировал свежий marker, recovery пропускает строку.
Старый start по-прежнему терминализуется. Ни один путь не возвращает READY,
не сбрасывает markers или attemptCount и не разрешает повторный HTTP.

## Поведенческие проверки

Добавлено восемь тестов в существующую integration suite:

| Сценарий | Доказательство |
| --- | --- |
| A/G | Старый claim + свежий start не abandoned; accepted/rejected/uncertain штатно фиксируются; следующий dispatch не делает второй POST |
| B/F | Старый claim без start становится terminal uncertain; repeated recovery не меняет строку; HTTP отсутствует |
| C/F | Старый claim + старый start становится terminal uncertain; repeated recovery и следующий worker не повторяют отправку |
| D, start-first | SELECT recovery видит старый claim без start до ожидания CONTROL; UPDATE после ожидания сохраняет свежий start; accepted фиксируется |
| D, recovery-first | Recovery выигрывает CONTROL, terminal uncertain; старый worker не ставит start и не делает HTTP |
| E | После свежего start OFF не мешает финализации; recovery не терминализует свежий start; новые starts заблокированы |

Фикстуры состариваются на шесть минут без ожидания часов. При этом согласованно
сохраняются TTL токена, verified epoch, AEAD expiry binding и DB CHECK constraints.
Для C fixture задаёт старые fence/reservation/start с соблюдением их порядка;
старый процесс моделируется как упавший до HTTP. Существующий тест потери
финализации после уже принятого mock POST также остаётся в полном наборе.
Все внешние HTTP запрещены: используются mock transport и локальный mock server.

Сохранены тесты reserved finalizer: все три исхода BLOCKED до start,
финализация после committed start, после OFF и запрет повторной финализации.
Сохранены отрицательные проверки удалённого legacy finalizer.

## Результаты

| Проверка | Результат |
| --- | --- |
| AUTH unit | 199 / 199 |
| Все AUTH contracts | 334 / 334 |
| PostgreSQL 18.1 (Windows disposable) | 59 / 59 |
| PostgreSQL 17.11 (отдельный disposable container) | 59 / 59 |
| Миграции на каждой БД, включая повторный запуск | успешно |
| Typecheck / ESLint / production build | exit 0 |
| git diff --check | успешно; только предупреждения нормализации LF/CRLF |
| CI wiring | YAML разобран; новый contract вызван явно; полная integration suite запускается без name filter |

Новые три source contracts дополняют реальные PG-тесты, а не заменяют их.
Remote GitHub CI не запускался: push запрещён. Исторические CI-only PG probes
локально не запускались с подделкой GITHUB_ACTIONS; их существующее подключение
сохранено. Локальные результаты относятся к полной integrated dispatch suite.
UI не менялся, поэтому новая browser QA не требуется. В архиве предыдущая browser
и audit evidence помечена `previous-round2`; это не новый запуск.

## Файлы и пакет

Отдельный delta Round 2.3: dispatcher, integration tests, новый recovery contract,
CI workflow, active runbook и этот отчёт. `architecture-preserved.json` доказывает
неизменность схемы, 0044, claim/fence/reservation/finalizer, policy, readiness,
CLI ON/OFF и UI относительно принятого Round 2.2. Другие worktree не изменялись.

Архив `.qa/round2.3/AUTH01-NIGHTSHIFT-ROUND23-REVIEW-20261119.zip` содержит
полный снимок исходников и статических ресурсов (включая неизменённые AUTH-модули
и `src/db/index.ts`), manifest с хешами, очищенные TAP/build/static/migration logs,
воспроизведение до исправления, `diff-head.patch` и `diff-round23.patch` относительно
принятого Round 2.2. Исключены env-файлы, node_modules, БД, runtime media,
каталожные входные datasets/snapshots, реальные credentials, пользовательские
данные и сгенерированные письма. Код mail templates и synthetic fixtures включён.

## Остаточные риски и границы

- Terminal uncertain остаётся сознательной ценой at-most-once: возможна потеря
  письма, включая падение до HTTP; автоматического requeue нет.
- После настоящего abandoned timeout поздний provider outcome может уже не
  зафиксироваться. Исправление защищает свежий start, а не отменяет timeout.
- Timestamps и cutoff используют часы приложения. Существенное расхождение часов
  между worker-хостами требует операционного контроля; clock model не менялась.
- PostgreSQL commit и HTTP не являются одной атомарной транзакцией. Provider
  accepted не означает доставку в ящик.
- Известные dependency advisories из Round 2 сохранены в prior audit evidence;
  зависимости не обновлялись. Новых несвязанных дефектов в этом scope не подтверждено.
- Реальная отправка по-прежнему требует домена/DNS, подтверждённого отправителя,
  настоящего защищённого ключа и явного включения всех gates. Она здесь не включалась.

Работа остановлена для независимой приёмки Round 2.3. Следующий раунд не начат.
