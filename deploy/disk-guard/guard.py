#!/usr/bin/env python3
"""BR01: Comic Diary disk monitor and opt-in, scoped image-retention cleanup.

Never prunes Docker volumes, containers, build cache or unrelated images.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

MANAGED = 'comic-diary-disk-guard-v1'
REPO = 'ghcr.io/flawden/comic-diary'
COMPOSE = '/opt/comic-diary/compose.yml'
KEEPER_LIB = '/usr/local/lib/comic-diary/keeper'
CONFIG = Path('/etc/comic-diary/disk-guard.json')
STATE = Path('/var/lib/comic-diary-disk-guard')
MIN_FREE_PRUNE = 8 * 1024**3
MIN_FREE_WARN = 5 * 1024**3
MIN_FREE_CRITICAL = 2 * 1024**3
SHA_TAG = re.compile(r'[a-f0-9]{40}\Z')
DIGEST = re.compile(r'sha256:[a-f0-9]{64}\Z')


def command(*args):
    cwd = str(Path(COMPOSE).parent) if len(args) >= 2 and args[:2] == ('docker', 'compose') else None
    result = subprocess.run(args, text=True, capture_output=True, timeout=60, check=False, cwd=cwd)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1])
    return result.stdout


def disk(root='/'):
    usage = shutil.disk_usage(root)
    return {'total': usage.total, 'used': usage.used, 'free': usage.free,
            'percent': round(usage.used * 100 / usage.total, 1)}


def severity(usage):
    if usage['percent'] >= 90 or usage['free'] < MIN_FREE_CRITICAL:
        return 'critical'
    if usage['percent'] >= 80 or usage['free'] < MIN_FREE_WARN:
        return 'warning'
    return 'ok'


def needs_pruning(usage):
    return usage['percent'] >= 75 or usage['free'] < MIN_FREE_PRUNE


def collect_images(run=command):
    """Only tagged or digest-addressed application images; never another repo.

    A single image may have a SHA tag AND repository digest. Both references
    need removal before its old layers can become reclaimable.
    """
    records, seen = [], set()
    for line in run('docker', 'image', 'ls', '--digests', '--no-trunc', '--format', '{{json .}}').splitlines():
        item = json.loads(line)
        if item.get('Repository') != REPO:
            continue
        tag, digest = item.get('Tag', ''), item.get('Digest', '')
        refs = []
        if tag == 'master':
            refs.append(REPO + ':master')  # Protect moving pointer; never remove it.
        if SHA_TAG.fullmatch(tag):
            refs.append(REPO + ':' + tag)
        if DIGEST.fullmatch(digest):
            refs.append(REPO + '@' + digest)
        for ref in refs:
            if ref in seen:
                continue
            seen.add(ref)
            data = json.loads(run('docker', 'image', 'inspect', ref, '--format', '{{json .}}'))
            records.append({'ref': ref, 'id': data['Id'], 'created': data['Created'],
                            'pinned': tag == 'master'})
    return records


def running_app_id(run=command):
    """Fail closed if the active production app container cannot be identified."""
    app_ids = run('docker', 'compose', '-f', COMPOSE, 'ps', '-q', 'app').split()
    if len(app_ids) != 1:
        raise RuntimeError('Cannot uniquely identify the production app container')
    details = json.loads(run('docker', 'inspect', app_ids[0], '--format', '{{json .}}'))
    if not details.get('State', {}).get('Running'):
        raise RuntimeError('Production app container is not running')
    image_id = details.get('Image')
    if not isinstance(image_id, str) or not image_id.startswith('sha256:'):
        raise RuntimeError('Cannot identify running production image')
    return image_id


def cleanup_plan(images, active_id, rollback_count=2):
    """Keep current plus newest rollback_count DISTINCT earlier image IDs.

    Never try removing the image associated with a running app, including a
    second commit SHA tag pointing to that image.
    """
    ordered = sorted(images, key=lambda item: (item['created'], item['ref']), reverse=True)
    protected = {active_id} | {image['id'] for image in ordered if image.get('pinned')}
    rollback = []
    for image in ordered:
        if image['id'] not in protected and len(rollback) < rollback_count:
            protected.add(image['id'])
            rollback.append(image['id'])
    return ([image['ref'] for image in ordered if image['id'] not in protected],
            [image['ref'] for image in ordered if image['id'] in protected])


def read_secure(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Missing/linked configuration')
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Unsafe configuration permissions')
    return json.loads(path.read_text(encoding='utf-8'))


def atomic_write(path, value):
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError('Linked state path')
    fd, temp = tempfile.mkstemp(prefix='.disk-guard-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o600)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def notify_message(usage, level, removed=0, failed=False):
    free_gib = usage['free'] / 1024**3
    if level == 'critical':
        prefix = '🚨 КРИТИЧЕСКИ: заканчивается диск VPS'
    elif level == 'warning':
        prefix = '⚠️ Предупреждение: заполняется диск VPS'
    else:
        prefix = '☕ Диск Чайной снова в норме'
    return (f'{prefix}\nЗанято: {usage["percent"]:.1f}% · свободно: {free_gib:.1f} ГиБ.'
            + (f'\nУдалено старых ссылок на образы: {removed}.' if removed else '')
            + ('\nАвтоочистка не удалась; проверьте журнал службы.' if failed else '')
            + '\nПроверьте VPS и состояние PostgreSQL при критической тревоге.')


def should_notify(level, previous, now):
    old = previous.get('level', 'ok')
    if old != level:
        return True
    if level == 'ok':
        return False
    try:
        sent = dt.datetime.fromisoformat(previous['sentAt'])
        return now - sent >= dt.timedelta(hours=6) or now < sent
    except (KeyError, TypeError, ValueError):
        return True


def telegram_send(text):
    # Reuse existing Telegram keeper: no duplicate bot token or plaintext logs.
    sys.path.insert(0, KEEPER_LIB)
    from keeper import MANAGED as KEEPER_MANAGED, CONFIG as TG_CONFIG, read_json, send
    config = read_json(TG_CONFIG, private=True)
    if config.get('managedBy') != KEEPER_MANAGED:
        raise ValueError('Unrecognized Telegram keeper config')
    send(config, text)


def preview(usage, do_list=True):
    print('DISK=%.1f%%; FREE=%.2fGiB' % (usage['percent'], usage['free']/1024**3))
    print('LEVEL='+severity(usage))
    print('PRUNE_THRESHOLD='+('YES' if needs_pruning(usage) else 'NO'))
    if do_list:
        images = collect_images()
        active = running_app_id()
        remove, keep = cleanup_plan(images, active)
        print('KEEP_SHA_IMAGES='+str(len(keep)))
        print('OLD_SHA_TAGS_ELIGIBLE='+str(len(remove)))
        for ref in remove:
            print('ELIGIBLE='+ref)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--dry-run', action='store_true', help='Read-only space and scoped cleanup preview')
    modes.add_argument('--check', action='store_true', help='Read-only space status without Docker calls')
    modes.add_argument('--run', action='store_true', help='Monitor and (if enabled) prune on threshold')
    modes.add_argument('--test-alert', action='store_true', help='Send test alert to existing Telegram keeper chat')
    modes.add_argument('--enable-auto-prune', action='store_true', help='Explicitly opt in to safe auto prune')
    modes.add_argument('--disable-auto-prune', action='store_true', help='Opt out of automatic prune')
    args = parser.parse_args()
    if args.check:
        preview(disk(), False)
        return 0
    if args.dry_run:
        preview(disk())
        return 0
    if os.geteuid() != 0:
        raise ValueError('Root required')
    if args.test_alert:
        telegram_send('☕ BR01: тест тревоги о свободном месте доставлен. Действий с Docker не выполнялось.')
        print('ALERT=TEST_SENT')
        return 0
    if args.enable_auto_prune or args.disable_auto_prune:
        config = read_secure(CONFIG)
        if config.get('managedBy') != MANAGED:
            raise ValueError('Unrecognized configuration')
        config['autoPruneEnabled'] = bool(args.enable_auto_prune)
        atomic_write(CONFIG, config)
        print('AUTO_PRUNE='+('ENABLED' if args.enable_auto_prune else 'DISABLED'))
        return 0
    config = read_secure(CONFIG)
    if config.get('managedBy') != MANAGED or type(config.get('autoPruneEnabled')) is not bool:
        raise ValueError('Invalid disk guard configuration')
    if STATE.is_symlink() or not STATE.is_dir():
        raise ValueError('Missing/linked state directory')
    lock_fd = os.open(STATE/'.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('GUARD=SKIPPED; previous run still active')
            return 0
        before = disk()
        count = 0
        prune_failed = False
        if config['autoPruneEnabled'] and needs_pruning(before):
            try:
                # Fail closed before deletion when Docker, Compose or app is unavailable.
                images = collect_images()
                active = running_app_id()
                remove, keep = cleanup_plan(images, active)
                print('IMAGE_RETENTION=active+2_previous; PROTECTED_REFS='+str(len(keep)))
                for ref in remove:
                    # Removing one reference may drop another alias. Check before rmi.
                    exists = subprocess.run(['docker', 'image', 'inspect', ref],
                        text=True, capture_output=True, timeout=30, check=False)
                    if exists.returncode == 0:
                        command('docker', 'image', 'rm', ref)  # No --force, volumes or prune.
                        count += 1
            except Exception:
                # Disk warning must still be sent if cleanup could not run.
                prune_failed = True
                print('AUTO_PRUNE=FAILED; no broad fallback cleanup performed')
        after = disk()
        level = severity(after)
        if prune_failed and level == 'ok':
            level = 'warning'
        now = dt.datetime.now(dt.timezone.utc)
        state_path = STATE/'state.json'
        previous = read_secure(state_path) if state_path.exists() else {}
        if previous and previous.get('managedBy') != MANAGED:
            raise ValueError('Unrecognized previous state')
        if should_notify(level, previous, now):
            telegram_send(notify_message(after, level, count, prune_failed))
            atomic_write(state_path, {'managedBy':MANAGED, 'level':level, 'sentAt':now.isoformat()})
            print('ALERT=SENT')
        else:
            print('ALERT=UNCHANGED')
        print('GUARD=%s; LEVEL=%s; FREE=%.2fGiB; REMOVED_REFS=%d' %
              ('FAIL' if prune_failed else 'PASS', level, after['free']/1024**3, count))
        return int(prune_failed)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        sys.exit(main())
    except Exception:
        # Never print exceptions; keeper HTTP errors may contain bot token in URL.
        print('GUARD=FAIL; inspect Docker, configuration, and systemd journal (no secrets printed)', file=sys.stderr)
        sys.exit(1)
