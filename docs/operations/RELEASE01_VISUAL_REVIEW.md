# RELEASE-01A — визуальная регрессия, 20.11.2026

## Эталон и метод

Эталон — актуальный публичный сервер
https://comic-diary.2-26-67-21.sslip.io/comics/mezolit?from=catalog,
а не прежняя демонстрационная библиотека. Доступ только public GET, без сессии,
production SQL и административных действий. Сняты 9 свежих full-page screenshots:
Tea/Paper/Night, 1440/320/390 px, viewport height 950, один Chromium/Edge и locale.

Для локального сравнения в disposable PostgreSQL скопированы только открытые
метаданные произведения: Мезолит, Чайная территория, GRAPHIC_NOVEL/ONGOING, описание,
девять опубликованных глав и ожидаемый второй том. Из публичного GET взяты реальные
обложка/баннер/семь chapter illustrations и SVG fallback: 10 assets, все HTTP 200.
SHA-256 и URL в reference-data.json и visual-parity/manifest.json. Аккаунты,
прогресс, рейтинги и обсуждения production не читались и не копировались.

Браузер кандидата получает точные reference assets из локального cache через
Playwright route fulfilment; приложение и БД остаются локальными. Поэтому внешний
VK/CDN не делает результат случайным и изображения не подменены демо-картинками.
Оба последних chapter cover не заданы в публичном SSR; проверен штатный fallback.
Перед длинными screenshots браузер действительно прокручивает lazy images в экран
и проверяет загрузку, а не объявляет ошибкой их ещё не запрошенное состояние.

## Одинаковые публичные данные

| Тема | Ширина | Hero сервера, px | Hero кандидата, px | Горизонтальное переполнение |
|---|---:|---:|---:|---:|
| tea | 1440 | 435 | 435 | 0 |
| tea | 320 | 812.672 | 812.672 | 0 |
| tea | 390 | 760.547 | 760.547 | 0 |
| paper | 1440 | 435 | 435 | 0 |
| paper | 320 | 812.672 | 812.672 | 0 |
| paper | 390 | 760.547 | 760.547 | 0 |
| night | 1440 | 435 | 435 | 0 |
| night | 320 | 812.672 | 812.672 | 0 |
| night | 390 | 760.547 | 760.547 | 0 |

Во всех девяти случаях высота совпала точно, допуск теста 2 px не потребовался.
Заголовок, обложка, фон, описание и категории сопоставлены на тех же данных.
Сохранены Cormorant/Onest, тема, ширина, иллюстрации и структура hero/томов/глав.
Есть full-page public comparisons и отдельные hero captures. Пиксельная идентичность
всей страницы не заявляется: ниже hero кандидат добавляет принятые рейтинги и
обсуждения, которых нет на старом production checkpoint.

## Новый функционал в утверждённом оформлении

Отдельные 9 signed-in cases используют ТОЛЬКО синтетических читателей:
прогресс 6/9, личные chapter scores, три участника общественного рейтинга 4,3/5,
корневой комментарий и ответ под ним, обсуждение первой главы. Показатели читаются
из DOM, reply проверяется внутри нужной ветки, отсутствует overflow на всех ширинах.
Desktop chapter row <=150 px с новыми действиями. Есть screenshots hero, всех глав,
реального viewport глав и chapter discussion для каждой темы/ширины. Скриншоты
длинных элементов сохраняют настоящий fixed navigation; viewport captures и
reader bottom-scroll check отдельно проверяют отсутствие перекрытия последней главы.

Дополнительные независимые браузерные матрицы:

- Integrated UI: 45 captures/checks — реальный login, прогресс, catalog,
  административная панель, studio wizard, recovery OFF на 3 темах x 3 ширинах.
- COMMUNITY: 63 role/target cases, 99 negative checks. Спойлер/XSS-as-text,
  авторские изменения/удаление, ответы, жалобы, ADMIN hide/restore/restrict/
  unrestrict/resolve/reject; EDITOR/guest/inactive/foreign Origin блокируются.
- Threading/style: 9 theme/width cases — страницы корней/ответов, поздние ответы,
  перезагрузка, компактные строки, длинные названия.
- Activation: 9 theme/width cases — register -> generic pending -> mock delivery
  -> invalid code -> activation -> обычный secure/httpOnly login. До активации
  auto-session отсутствует; token не попадает в URL. Скриншоты без кодов/паролей.
- Полный существующий reader harness: тома, progress, optional personal ratings,
  отказ/повтор мутации, batch mark/undo, planned chapter restrictions, direct/general
  reading destinations, no-link controls и несколько viewport размеров.

## Точная граница проверки чтения

Текущая версия направляет читать опубликованную главу во внешний источник
(target=_blank, noopener/noreferrer), сохраняет отметки/прогресс/оценки внутри
Дракотеки. Проверен именно этот существующий сценарий и защищённые API. Отдельного
встроенного постраничного image viewer в этой версии нет; его готовность не
приписывается релизу. Авторизация/доступность внешнего VK не гарантируются нашим CI.

## Подтверждённая причина старого CI failure

В baseline 44587303919 и неизменённом локальном reader harness после reload с
#chapters lazy cover находилась top=-2020, bottom=-1831 при viewport 800 и scrollY
2203. За 12 секунд complete=false/naturalWidth=0. SVG самостоятельно возвращал 200.
После настоящей прокрутки: top=183, complete=true, naturalWidth=113. Та же проверка
без ослабления проходит. Исправление добавляет scrollIntoViewIfNeeded перед
существующим complete/naturalWidth assertion; таймаут 12000 не изменён. Это fixture
precondition, не дефект изображения приложения. Before log, diagnostic proof JSON
и after screenshots включены в review package.

## Изоляция diary draft от визуальных фикстур

Следующий CI failure после устранения cover/gate воспроизведён на новой холодной
копии приложения. После ввода noteMatches=true, dirty=true, sameDocument=true.
После визуального SQL/reload setup все три false: документ заменился ещё до
chapter-rating действий. Та же последовательность доказана run 44663715522.
Тест теперь начинает draft-сценарий после независимых визуальных reload-фикстур.
Проверяется реальное React dirty state, затем те же строгие проверки сохранения
черновика при tab switching, failed mutation, chapter rating refresh, failed diary
save, successful save и reload persisted note. Runtime приложения не менялся;
несохранённая заметка не объявляется переживающей намеренный hard reload.

## Границы отчёта

Remote CI и отдельная диагностика несохранённого diary draft фиксируются в итоговом
release report/CI logs. Этот визуальный отчёт не объявляет remote CI зелёным до
получения результата. Секреты, пользовательские сессии production, почта и SQL
production не использовались. В приложении этого release этапа общий редизайн не
выполнялся; визуальные отличия функциональных секций являются принятой интеграцией.
