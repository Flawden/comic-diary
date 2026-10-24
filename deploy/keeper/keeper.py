#!/usr/bin/env python3
"""Comic Diary Telegram backup monitor. No database access or backup writes."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import urllib.request

MANAGED = 'comic-diary-keeper-v1'
CONFIG = Path('/etc/comic-diary/telegram.json')
STATE = Path('/var/lib/comic-diary-keeper')
BACKUPS = Path('/opt/comic-diary/backups/automatic')
BACKUP_NAME = re.compile(r'backup-\d{8}T\d{6}Z-[0-9a-f]{8}\Z')


def read_json(path, private=False):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Missing or linked file')
    if private:
        info = path.stat()
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o077:
            raise ValueError('Private config permissions')
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, data):
    if path.parent.is_symlink() or path.is_symlink():
        raise ValueError('Linked state/config')
    descriptor, temporary = tempfile.mkstemp(prefix='.keeper-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def telegram(token, method, payload):
    if not re.fullmatch(r'[0-9]{5,}:[A-Za-z0-9_-]{20,}', token):
        raise ValueError('Invalid token format')
    if method not in ('getMe', 'getWebhookInfo', 'getUpdates', 'sendMessage'):
        raise ValueError('Unsupported method')
    request = urllib.request.Request('https://api.telegram.org/bot'+token+'/'+method,
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    # No redirected token-bearing requests and no inherited proxy configuration.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=35) as response:
        data = response.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise ValueError('API response too large')
    result = json.loads(data)
    if result.get('ok') is not True:
        raise ValueError('Telegram refused request')
    return result['result']


def send(config, text):
    telegram(config['token'], 'sendMessage', {'chat_id': config['chatId'], 'text': text,
             'link_preview_options': {'is_disabled': True}})


def timestamp(value):
    result = dt.datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError('Timezone required')
    return result


def health(root, now, timer_ok):
    problems = []
    backup_id = None
    completed = None
    if not timer_ok:
        problems.append('TIMER')
    try:
        if root.is_symlink() or not root.is_dir():
            raise ValueError('Backup directory')
        success = read_json(root/'last-success.json')
        if success.get('managedBy') != 'comic-diary-backup-v1' or not BACKUP_NAME.fullmatch(success['backup']):
            raise ValueError('Backup identity')
        backup_id = success['backup']
        folder = root/backup_id
        if folder.is_symlink() or not folder.is_dir():
            raise ValueError('Backup folder')
        marker = read_json(folder/'SUCCESS.json')
        if marker.get('managedBy') != 'comic-diary-backup-v1':
            raise ValueError('Completion marker')
        # Lightweight monitoring, not another full checksum scan of every archive.
        for name in ('database.dump', 'media.tar.gz', 'SHA256SUMS'):
            path = folder/name
            if path.is_symlink() or not path.is_file() or path.stat().st_size <= 0:
                raise ValueError('Backup payload missing')
        completed = timestamp(success['completedAt'])
        age = now - completed
        if age < dt.timedelta(0) or age > dt.timedelta(hours=36):
            problems.append('STALE')
    except (OSError, ValueError, KeyError, TypeError):
        problems.append('BACKUP_METADATA')
    try:
        attempt = read_json(root/'last-attempt.json')
        age = now - timestamp(attempt['at'])
        if attempt.get('result') != 'PASS':
            problems.append('LAST_ATTEMPT')
        if not dt.timedelta(0) <= age <= dt.timedelta(hours=36):
            problems.append('ATTEMPT_STALE')
    except (OSError, ValueError, KeyError, TypeError):
        problems.append('ATTEMPT_METADATA')
    return {'problems': sorted(set(problems)), 'backup': backup_id,
            'completedAt': completed.isoformat() if completed else None}


def notification(current, previous, now):
    problems = current['problems']
    fingerprint = hashlib.sha256(','.join(problems).encode()).hexdigest()
    if problems:
        sent = timestamp(previous['sentAt']) if previous.get('sentAt') else None
        if previous.get('fingerprint') != fingerprint or sent is None or now < sent or now-sent >= dt.timedelta(hours=6):
            labels = {'TIMER': 'Таймер бэкапов выключен или недоступен.',
                      'STALE': 'Нет свежей копии за последние 36 часов.',
                      'BACKUP_METADATA': 'Нет корректной завершённой копии или её файлов.',
                      'LAST_ATTEMPT': 'Последняя попытка бэкапа завершилась ошибкой.',
                      'ATTEMPT_STALE': 'Нет свежей успешной попытки бэкапа.',
                      'ATTEMPT_METADATA': 'Не удалось прочитать результат последней попытки.'}
            return ('⚠️ Смотритель чайной · Comic Diary\n'+'\n'.join(labels[p] for p in problems)+
                    '\nПроверьте серверный журнал бэкапов.'), fingerprint
        return None, fingerprint
    if previous.get('problems'):
        return '☕ Смотритель чайной · Бэкапы снова в порядке. Свежая завершённая копия доступна.', fingerprint
    if previous.get('backup') != current['backup']:
        when = timestamp(current['completedAt']).astimezone(dt.timezone(dt.timedelta(hours=3)))
        return '☕ Смотритель чайной · Новая копия Comic Diary готова.\n'+when.strftime('%d.%m.%Y %H:%M')+' МСК.\nКопия пока хранится на VPS.', fingerprint
    return None, fingerprint


def process(current, previous, now, sender):
    text, fingerprint = notification(current, previous, now)
    if text is None:
        # Keep previous sent state so a failed delivery is never acknowledged.
        return previous, False
    sender(text)
    return dict(current, managedBy=MANAGED, fingerprint=fingerprint, sentAt=now.isoformat()), True


def timer_active():
    for action in ('is-active', 'is-enabled'):
        result = subprocess.run(['systemctl', action, 'comic-diary-backup.timer'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, text=True)
        if result.returncode != 0 or result.stdout.strip() != ('active' if action == 'is-active' else 'enabled'):
            return False
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only health check; no Telegram delivery')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Root required')
    now = dt.datetime.now(dt.timezone.utc)
    current = health(BACKUPS, now, timer_active())
    if args.check:
        print('KEEPER_HEALTH='+('FAIL; '+','.join(current['problems']) if current['problems'] else 'PASS'))
        return int(bool(current['problems']))
    if STATE.is_symlink() or not STATE.is_dir():
        raise ValueError('State directory missing or linked')
    config = read_json(CONFIG, private=True)
    if config.get('managedBy') != MANAGED or not isinstance(config.get('chatId'), int) or config['chatId'] <= 0:
        raise ValueError('Unexpected configuration')
    descriptor = os.open(STATE/'.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('KEEPER=SKIPPED; another check is active')
            return 0
        path = STATE/'state.json'
        previous = read_json(path) if path.exists() else {}
        if previous and previous.get('managedBy') != MANAGED:
            raise ValueError('Unrecognized notification state')
        updated, sent = process(current, previous, now, lambda text: send(config, text))
        if sent:
            write_json(path, updated)
        print('KEEPER=PASS; notification='+('SENT' if sent else 'UNCHANGED'))
    return 0


if __name__ == '__main__':
    os.umask(0o077)
    try:
        sys.exit(main())
    except Exception:
        # Never print exception strings: HTTP errors include the token-bearing URL.
        print('KEEPER=FAIL; configuration, filesystem or Telegram delivery check failed', file=sys.stderr)
        sys.exit(1)
