# RELEASE-01A — итоговый отчёт, 20 ноября 2026

## Результат и Git

Единый кандидат содержит принятый Tea/Paper/Night, общественные рейтинги RATE-01,
threaded COMMUNITY-01/модерацию, восстановление пароля и подтверждение регистрации.
Изолированный worktree C:/Users/Atell/IdeaProjects/comic-diary-release01a;
ветка codex/release01a-candidate-20261120. Draft PR #29 в master:
https://github.com/Flawden/comic-diary/pull/29. PR остаётся Draft, merge не выполнялся.

Фактические исходные SHA:
- last observed live/master a5119b2d599fc9d9915e7bfeb71d6ba2b26f5f57;
- опубликованная интеграция a96eadd05597e849d2f22d03f87c27f722c3e88f;
- activation implementation 6b816a15c55e2731613aa2d580199df927666c43;
- принятый activation checkpoint 8b6e78cbea7abcc4930ffc4f01ed61cf06b1afbb;
- проверенный release code 433d4058d21d4f6dfc3725a5ce77ac6d03c2a57a.

a96eadd — предок 8b6e78c, новых изменений в опубликованной интеграции при аудите нет.
Использована прямая ветка от 8b6e78c без merge/cherry-pick. src, drizzle и dependency
manifests кандидата идентичны принятому activation checkpoint. Все бизнес-функции,
миграции и актуальный дизайн унаследованы. Полный final HEAD, история родителей,
три diff (master/integration/release-only), Git blob/SHA-256 и CI exact HEAD — в ZIP.

Все исходные worktree проверены read-only и сохранены. В comic-diary-auth01 по-прежнему
только две исходные пользовательские правки: globals.css +1/-15,
ChapterReadingPanel.tsx -1. Они не перенесены автоматически. Pushed только новая
feature-ветка обычным non-force push; master/test и интеграционная ветка не менялись.

## Исправления RELEASE-01A

1. Reproduced lazy-cover timeout baseline 44587303919: image top=-2020, complete=false,
   naturalWidth=0 после 12 секунд, SVG HTTP 200. Прокрутка -> naturalWidth=113.
   Тест теперь прокручивает lazy image до прежнего строгого load assertion.
   Runtime loading=lazy, timeout, naturalWidth и визуальные assertions не ослаблены.
2. Первый новый CI обнаружил меж-suite leakage: activation test оставлял gate ON,
   historical probe требовал migration default OFF/generation 0. Test after теперь
   восстанавливает исходную строку; 33 теста + unchanged historical gate probe
   последовательно в одной PG17 БД PASS. PG18 отдельно восстановил OFF/generation 42.
   Production operator semantics/generation и состояния outbox не менялись.
3. Далее cold dev visual setup заменял основной документ до draft assertions.
   Локальная свежая копия и CI diagnostic 44663715522 доказали: после fill все
   noteMatches/dirty/sameDocument=true, после visual fixture setup все false.
   Draft scenario выделен ПОСЛЕ независимых reload/SQL fixtures. Проверяется React
   dirty state, затем прежние строгие tab/failure/rating-refresh/save/reload проверки.
   Новый полностью холодный app проходил весь reader harness. Runtime формы не менялся.
4. Next dev автоматически исправил уровень heading в AGENTS (# -> ##), инструкции
   сохранены. Добавлены rollout/visual/release reports. Зависимости не обновлялись.

Intermediate failed CI оставлены в evidence, а не скрыты повторным запуском без
объяснения. Проверки не отключались, результаты не подменялись и assertions не
переписывались под ошибочное приложение. Исправлена изоляция тестовых сценариев.

## Проверки

| Проверка | Результат |
|---|---|
| src unit tests | 285/285 |
| source contract/spec tests | 334/334 |
| PG17.11 activation / recovery / RATE / COMMUNITY | 33 / 59 / 8 / 28, все PASS |
| PG18.1 activation / recovery / RATE / COMMUNITY | 33 / 59 / 8 / 28, все PASS |
| Reading/authorization/export probes | 11 на каждом major, PASS |
| Typecheck / ESLint | PASS |
| Production build / Docker build | PASS |
| Docker OFF smoke, --network none, DB localhost:1 | PASS |
| npm audit --omit=dev --json | 0 production advisories |
| Public visual parity | 9/9, точное совпадение hero heights |
| Synthetic signed-in visual cases | 9/9 |
| Integrated browser checks | 45 |
| COMMUNITY browser cases / negative checks | 63 / 99 |
| Threading / activation browser theme-width cases | 9 / 9 |
| Full existing reader, cold dev | PASS |

Local target guards не ослаблялись в committed tests: точные .qa copies меняют
только CI disposable port для PG17/18 и Chromium executable для Windows QA.
Логи, copies и hashes прилагаются. Проверены реальный login, progress, личные
ratings/notes, batch/undo, export, shared/private authorization, chapter access,
spoilers, threaded replies, moderation, activation single-use/session revocation,
mock transport/uncertain/OFF/concurrency. Реальный Resend исключён.

Полный визуальный отчёт и реальные сравнимые screenshots — RELEASE01_VISUAL_REVIEW.md
и ZIP/visual-comparison.html. В текущей архитектуре чтение глав — переход во внешний
источник с внутренними progress/marks/ratings; отдельного встроенного page viewer
нет. Не приписываем релизу проверку авторизации/доступности внешнего VK.

## Удалённый CI

Зелёный PR run для code SHA 433d405:
https://github.com/Flawden/comic-diary/actions/runs/44664329802.
Соответствующий push run:
https://github.com/Flawden/comic-diary/actions/runs/44664321932.
Final documentation checkpoint и завершённые final exact-SHA CI links/results
записаны в review manifest/ci-results.json и корневом release-report.md архива,
чтобы не создавать самоссылку SHA внутри Git-коммита.

До финала были диагностические failures:
- 44587303919 — исходный cover timeout;
- 44661598610 / 44661644476 — activation gate fixture leakage;
- 44662608869 / 44662612969 — cold document replacement перед draft check;
- 44663715522 / 44663724543 — тот же дефект изоляции с доказательной диагностикой.

Publish/deploy jobs на feature/PR ожидаемо skipped; production workflow не запускался.

## Будущий rollout и риски

RELEASE01_ROLLOUT_PLAN.md — ТОЛЬКО ПЛАН: сверка фактического live SHA/journal,
проверенный dump+restore, недостающие ordered migrations 0031-0046 после сверки
hashes, deployment с AUTH OFF, DNS/TLS dracoteka.com, protected key handoff,
readiness/worker/gate и intake последним, один согласованный owner mail test,
мониторинг и non-destructive rollback. Ничего из этого на production не выполнялось.

Resend Verified, API-ключ подготовлен на VPS, реальная интеграция и доставка ещё не проверены.
Это сведения владельца. Ни VPS-файл, ни Windows-копии ключа не читались/не копировались.
Ключ не подключён, реальная отправка не включена. Provider accepted не равен inbox delivery.

Остаются отдельные gate: независимая приёмка Draft PR, разрешение merge/deploy,
проверка backup restore/migration на production-size copy, HTTPS/public-origin
cutover, защищённое подключение уже существующего ключа/AEAD keys, согласованная
реальная доставка и наблюдение. At-most-once допускает потерю письма при crash;
uncertain не retry/requeue. Readiness flags не заменяют worker monitoring. Внешние
CDN/VK и реальное spam placement этим CI не гарантируются. Production данные и
секреты в review ZIP отсутствуют. После пакета — остановка для независимой приёмки.
