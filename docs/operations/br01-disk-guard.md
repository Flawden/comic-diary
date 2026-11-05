# BR01 — защита VPS от переполнения диска

**Основание:** инцидент 2026-11-05: `/dev/vda2`, 32 ГБ, занято 100%; PostgreSQL завершился с `No space left on device`, сервис был недоступен при зелёном CI. После ручной очистки неиспользуемых Docker-образов и журналов было свободно ~19 ГБ (40% использования). Эти цифры — снимок на момент инцидента, не гарантия текущего состояния.

## Что включаем

Отдельный `comic-diary-disk-guard.timer` запускает проверку каждые 20 минут. При 80% заполнения **или** менее 5 ГиБ свободного места отправляет предупреждение в уже существующий Telegram-чат «Смотрителя». При 90% **или** менее 2 ГиБ — критическое уведомление. Сообщения при изменении состояния и повтор через 6 часов. При восстановлении нормы — отдельное сообщение. Отправка подтверждается только после ответа Telegram; при ошибке доставки состояние не помечается отправленным.

Опциональная очистка (**изначально выключена**): если занято >=75% либо свободно <8 ГиБ, рассматриваем только `ghcr.io/flawden/comic-diary` с 40-символьными SHA-тегами и/или адресами по `sha256` digest. **Оставляем образ работающего контейнера, локальный образ `master` и два последних других образа по времени создания** для быстрого отката. Не используются `docker system prune`, `docker volume prune`, флаг `--force`, удаление контейнеров, базы, бэкапов или образов других проектов. Если Compose/контейнер приложения недоступны, очистка прекращается, тревога всё равно отправляется.

Важно: это защита **кеша локальных образов**, а не уборщик всех файлов VPS. Если место заняли тома, media, логи, неподписанные/неатрибутированные образы или иные данные — монитор поднимет тревогу, но не удалит их автоматически. Не следует считать, что Docker-образы можно удалить без оценки необходимости отката.

## Проверка в CI

`python3 -m unittest discover -s deploy/disk-guard -p test_guard.py -v` и `bash -n deploy/disk-guard/install.sh`. Нет реального Docker, Telegram или root в CI: это модульные проверки безопасности алгоритма, не полноценное испытание VPS.

## Установка на сервер (выполняется вручную)

После push кода на GitHub скрипты **не появятся автоматически** в `/opt/comic-diary` — production использует immutable Docker image. Поэтому из Termux с локального клона:

```bash
cd ~/comic-diary
ssh lab 'mkdir -p ~/wd-br01-install'
scp deploy/disk-guard/{guard.py,test_guard.py,install.sh,comic-diary-disk-guard.service,comic-diary-disk-guard.timer} lab:~/wd-br01-install/
ssh -tt lab 'sudo bash ~/wd-br01-install/install.sh'
```

Установщик требует уже работающего `/usr/local/lib/comic-diary/keeper/keeper.py`, **не настраивает и не перепривязывает токен**. Запускает тесты, создаёт root-only config/state и systemd timer, но **автоочистку не включает**. При ошибке остановиться, не давать широкой `sudo`-привилегии и не отключать проверки.

## Проверка тревог и плана очистки

```bash
ssh -tt lab 'sudo python3 /usr/local/lib/comic-diary/disk-guard/guard.py --test-alert'
ssh -tt lab 'sudo python3 /usr/local/lib/comic-diary/disk-guard/guard.py --dry-run'
ssh -tt lab 'sudo systemctl start comic-diary-disk-guard.service; sudo systemctl status comic-diary-disk-guard.timer --no-pager; df -h /'
```

**Убедитесь, что тестовое сообщение действительно пришло в Telegram.** Если dry-run показывает неожиданно много образов или нет работающего контейнера, не включайте удаление. При необходимости остановите таймер `sudo systemctl disable --now comic-diary-disk-guard.timer` — это не затронет приложение и БД.

Только после просмотра плана и подтверждения доставки тревоги:

```bash
ssh -tt lab 'sudo python3 /usr/local/lib/comic-diary/disk-guard/guard.py --enable-auto-prune'
```

Отмена автоматической очистки без отключения мониторинга:

```bash
ssh -tt lab 'sudo python3 /usr/local/lib/comic-diary/disk-guard/guard.py --disable-auto-prune'
```

Отладка без раскрытия Telegram-токена:

```bash
ssh -tt lab 'sudo journalctl -u comic-diary-disk-guard.service --since today --no-pager -n 100'
```

Периодические предупреждения лишь уменьшают вероятность повторения аварии, но не заменяют бэкапы, проверку их восстановления, мониторинг PostgreSQL и отдельный post-deploy smoke. Это отдельные пункты BETA READINESS.
