# AUTH-01 Round 2.2 — удаление legacy finalizer

Worktree: `C:\Users\Atell\IdeaProjects\comic-diary-auth01-nightshift`.
Ветка: `codex/auth01-dispatch-nightshift-20261118`.
HEAD: `96987060cbfe1f12cab2971ec78ab0b2ed8a56d7`, новых коммитов нет.
База сравнения этого раунда: `AUTH01-NIGHTSHIFT-ROUND2-REVIEW-20261119.zip`.
Этот отчёт уточняет исторические заявления Round 1/2 о legacy finalizer.

## Решение

Замечание подтвердилось. Прежняя проверка запрещала только settlement после
start, сохраняя обход до start через claim-only API. Производственных потребителей
`finalizeClaimedPasswordResetMail` не найдено: определение было в claim-модуле,
вызовы — только в интеграционном тесте и трёх CI probes.

Функция **удалена целиком из runtime**, без stub, alias, скрытого экспорта,
compatibility-флага или переноса старой реализации в test helper.
`password-reset-request-outbox-claim.ts` теперь предоставляет только получение
claim. В `src/` больше нет даже идентификатора удалённой функции.
Полные результаты поиска до/после включены в evidence.

Интегрированный dispatcher продолжает использовать прежний reserved finalizer,
которому необходимы reservation и committed start. Его реализация в этом раунде
не менялась. Восстановление старых claims как uncertain — отдельная операция
учёта без аргумента provider result, HTTP или requeue; её политика тоже не менялась.

## Изменённые проверки

- C2B2 claim probe больше не ожидает успешную claim-only финализацию. Он проверяет
  отсутствие API для всех трёх классификаций, неизменность строки и сохранение
  эксклюзивного claim. Старые и новые claims не переводятся в терминальное
  provider-состояние только ради исторического теста.
- C2C2 fence probe проверяет отсутствие legacy API и неизменность fenced in_flight
  строки. Прежнее ожидание `true` для uncertain удалено как неверное требование.
- C2C3 reservation probe аналогично не может завершить reserved строку без start.
- Новый claim export contract запрещает возврат legacy имени/экспорта и проверяет
  включение contracts/probes в CI. Fence/reservation contracts усилены.
- Интеграционные тесты отдельно проходят READY -> claim, затем fence, затем
  reservation. На каждой границе start отсутствует; попытки обратиться к
  удалённому API для accepted/rejected/uncertain невозможны, строка не меняется,
  HTTP остаётся равным нулю. Проверка после reservation включает всю требуемую
  цепочку READY -> claim -> fence -> reservation.
- Дополнительный тест проверяет, что после настоящего start/HTTP/commit исхода
  reserved finalizer запрещает повторную финализацию всех трёх классификаций.
- Сохранены проверки Round 2: все три исхода до start BLOCKED; обычные исходы
  после committed start работают; OFF не скрывает результат уже начатой попытки.

Проверка отсутствующего API использует реальный импорт runtime-модуля:
экспорт отсутствует, попытка вызова отсутствующей функции получает TypeError
до доступа к БД. Это не адаптер, возвращающий искусственный `false`.

## Сохранённая архитектура

`evidence/architecture-preserved.json` сравнивает текущие файлы с архивом Round 2.
Полностью неизменны dispatcher, reserved finalizer, fence, reservation, outbox
policy, readiness, operator control, schema и миграция 0044. Тело функции
`claimPendingPasswordResetMailOnce()` также совпадает с Round 2.
Таким образом, lock order, at-most-once, attemptCount, запрет requeue,
Redemption readiness и операторская модель ON/OFF не менялись.

## CI

Три PG probes уже присутствовали в workflow. При проверке обнаружено, что source
contracts C2C2/C2C3 ранее запускались локально, но не были явно подключены к CI.
Теперь Verify явно запускает claim export contract, fence contract и reservation
contract. PostgreSQL job сохраняет все три probes и интеграционную suite целиком.
Новый contract и отдельная проверка разобранного YAML фиксируют эти связи.

Удалённый GitHub CI не запускался: push запрещён. Exact-CI guards исторических
probes не обходились подделкой CI-переменных. Их исходники проверены contracts и
typecheck, а поведение настоящих модулей проверено локальной PostgreSQL suite.

## Результаты Round 2.2

| Проверка | Результат |
| --- | --- |
| Все AUTH unit tests | 199/199 PASS |
| Все AUTH source contracts | 331/331 PASS |
| Интеграция на временной PostgreSQL 18.1 | 51/51 PASS |
| Интеграция на временной PostgreSQL 17.11 | 51/51 PASS |
| Повторное применение миграций | PASS, новых миграций нет |
| Typecheck | PASS |
| Lint | PASS |
| Production Next build | PASS |
| Разбор workflow / подключение обновлённых тестов | PASS |
| git diff --check | PASS |

Полные логи сохранены в evidence. Функциональные проверки используют только
synthetic credentials и mock/loopback HTTP. Настоящих запросов к Resend нет.
Браузерные manifests/screenshots и dependency evidence предыдущего Round 2
сохранены в пакете с явной маркировкой происхождения; они не объявляются новыми
браузерными/audit-прогонами Round 2.2. UI и зависимости в этом раунде не менялись.

## Файлы текущего раунда

1. `src/modules/auth/password-reset-request-outbox-claim.ts` — удаление legacy API.
2. `scripts/auth-r1c2b2-recovery-claim-pg-probe.ts`.
3. `scripts/auth-r1c2c2-recovery-fence-pg-probe.ts`.
4. `scripts/auth-r1c2c3-recovery-reserve-pg-probe.ts`.
5. `scripts/auth-dispatch-integration.test.ts`.
6. `scripts/auth-r1c2b2-recovery-claim-contract.test.mjs` — новый export contract.
7. `scripts/auth-r1c2c2-recovery-fence-contract.test.mjs`.
8. `scripts/auth-r1c2c3-recovery-reserve-contract.test.mjs`.
9. `.github/workflows/ci.yml` — явное включение трёх contracts.
10. `docs/operations/auth01-integrated-dispatch.md` — актуальный runtime API.
11. Этот отчёт.

Пакет содержит отдельный diff относительно Round 2, полный diff относительно
HEAD (включая новые файлы), исходники, статические UI assets, migrations,
manifest с hashes и полные результаты проверок. .env, runtime media, DB dumps,
DB files/rows, node_modules и сгенерированные письма не включаются. Входные
каталожные snapshots исключены как данные, а не AUTH-исходники.

## Оставшиеся риски и границы

- Сохраняется согласованная потеря письма при падении после claim, в том числе
  до HTTP; автоматический requeue не добавлялся.
- Accepted не доказывает inbox delivery; реальная доставка не проверялась.
- Неустранённые dependency advisories из Round 2 остаются отдельным release gate.
  package.json/package-lock.json не изменены, upgrade не выполнялся.
- После локальной проверки требуется независимая приёмка и впоследствии отдельно
  разрешённые публикация/CI/release и контролируемая проверка провайдера.
- Исходные Windows worktrees и две UI-правки не изменялись.

Commit, push, merge, deploy, production SQL, реальные Resend requests и
dependency upgrades не выполнялись. Отправка не включалась. Временные БД и
тестовые процессы остановлены. На этом работа останавливается для приёмки.
