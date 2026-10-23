#!/usr/bin/env bash
# Read-only production check: no service starts, restores, or configuration changes.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash CHECK_COMIC_DIARY_RELEASE_STATUS.sh'; exit 1; }
python3 - <<'PY'
import datetime as dt
from decimal import Decimal
import json
import math
from pathlib import Path
import re
import subprocess
import sys


def monotonic_microseconds(value):
    """systemctl prints service timestamps as integers, timer times as spans."""
    text = str(value).strip()
    if re.fullmatch(r'[0-9]+', text):
        return int(text)
    units = {'w': 604800000000, 'd': 86400000000, 'h': 3600000000,
             'min': 60000000, 's': 1000000, 'ms': 1000, 'us': 1, 'µs': 1}
    total = Decimal(0)
    position = 0
    previous_scale = None
    matches = list(re.finditer(r'([0-9]+(?:\.[0-9]+)?)(min|ms|us|µs|w|d|h|s)', text))
    if not matches:
        raise ValueError('Unavailable monotonic timestamp')
    for match in matches:
        if text[position:match.start()].strip():
            raise ValueError('Invalid monotonic span')
        scale = units[match[2]]
        if previous_scale is not None and scale >= previous_scale:
            raise ValueError('Unexpected monotonic unit order')
        previous_scale = scale
        total += Decimal(match[1]) * scale
        position = match.end()
    if text[position:].strip() or total != total.to_integral_value():
        raise ValueError('Invalid monotonic span precision')
    return int(total)


def schedule_evidence(timer, service, uptime_us):
    """Match a timer activation to the most recent completed service invocation."""
    if timer.get('LoadState') != 'loaded' or timer.get('ActiveState') != 'active':
        return False, 'TIMER_NOT_ACTIVE'
    try:
        trigger = monotonic_microseconds(timer.get('LastTriggerUSecMonotonic', 0))
        start = monotonic_microseconds(service.get('ExecMainStartTimestampMonotonic', 0))
        end = monotonic_microseconds(service.get('ExecMainExitTimestampMonotonic', 0))
        exit_status = int(service.get('ExecMainStatus', -1))
    except (ValueError, TypeError):
        return False, 'INVALID_TIMESTAMPS'
    if trigger <= 0 or trigger > uptime_us:
        return False, 'NO_TIMER_TRIGGER_IN_THIS_BOOT'
    if uptime_us - trigger > 36 * 3600 * 1_000_000:
        return False, 'TIMER_TRIGGER_STALE'
    if not 0 <= start - trigger <= 90 * 1_000_000:
        return False, 'SERVICE_NOT_MATCHED_TO_LATEST_TIMER_TRIGGER'
    if not start <= end <= uptime_us or service.get('Result') != 'success' or exit_status != 0:
        return False, 'SERVICE_NOT_COMPLETED_SUCCESSFULLY'
    return True, 'TIMER_TRIGGER_AND_MATCHING_SUCCESSFUL_INVOCATION'


def command(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL, timeout=120, text=True).strip()


def unit(name):
    props = ['LoadState', 'ActiveState', 'SubState', 'Result', 'ExecMainStatus',
             'ExecMainStartTimestampMonotonic', 'ExecMainExitTimestampMonotonic',
             'LastTriggerUSecMonotonic', 'NextElapseUSecRealtime']
    output = command(['systemctl', 'show', name, '--no-pager', '--property=' + ','.join(props)])
    return dict(line.split('=', 1) for line in output.splitlines() if '=' in line)


def main():
    failed = False
    print('CHECKED_AT=' + dt.datetime.now(dt.timezone.utc).isoformat())
    for service in ('db', 'app'):
        identifier = command(['docker', 'compose', '-f', '/opt/comic-diary/compose.yml', 'ps', '-q', service])
        running = bool(re.fullmatch('[a-f0-9]{12,64}', identifier)) and command(
            ['docker', 'inspect', '--format', '{{.State.Running}}', identifier]) == 'true'
        print('SERVICE_' + service + '=' + ('PASS' if running else 'FAIL'))
        failed |= not running
    timer = unit('comic-diary-backup.timer')
    service = unit('comic-diary-backup.service')
    enabled = command(['systemctl', 'is-enabled', 'comic-diary-backup.timer']) == 'enabled'
    print('BACKUP_TIMER_ENABLED=' + ('PASS' if enabled else 'FAIL'))
    failed |= not enabled
    print('NEXT_BACKUP=' + timer.get('NextElapseUSecRealtime', 'UNKNOWN'))
    uptime = float(Path('/proc/uptime').read_text().split()[0])
    if not math.isfinite(uptime) or uptime < 0:
        raise ValueError('Invalid uptime')
    matched, reason = schedule_evidence(timer, service, int(uptime * 1_000_000))
    print('SCHEDULED_RUN_EVIDENCE=' + ('PASS' if matched else 'REVIEW') + '; ' + reason)
    failed |= not matched
    program = Path('/usr/local/lib/comic-diary/backup.py')
    root = Path('/opt/comic-diary/backups/automatic')
    if program.is_symlink() or not program.is_file() or root.is_symlink() or not root.is_dir():
        raise ValueError('Backup program/root missing or linked')
    # Existing installed status command verifies every payload hash and 36h freshness.
    result = subprocess.run([sys.executable, str(program), '--status'], timeout=600, check=False)
    failed |= result.returncode != 0
    attempt_path = root / 'last-attempt.json'
    if attempt_path.is_symlink():
        raise ValueError('Linked attempt metadata')
    attempt = json.loads(attempt_path.read_text())
    last_ok = attempt.get('result') == 'PASS'
    stamp = dt.datetime.fromisoformat(attempt['at'])
    age = dt.datetime.now(dt.timezone.utc) - stamp
    last_ok &= dt.timedelta(0) <= age <= dt.timedelta(hours=36)
    print('LAST_ATTEMPT=' + ('PASS' if last_ok else 'FAIL'))
    print('LAST_ATTEMPT_AT=' + stamp.isoformat())
    failed |= not last_ok
    usage = __import__('shutil').disk_usage(root)
    print('BACKUP_DISK_FREE_BYTES=' + str(usage.free))
    print('OFF_HOST_AUTOMATION=NOT_VERIFIED_BY_THIS_CHECK')
    print('ALERT_DELIVERY=NOT_VERIFIED_BY_THIS_CHECK')
    print('RESTORE_DRILL=NOT_RUN_BY_THIS_CHECK')
    print('RESULT=' + ('FAIL; review failed or unmatched operational evidence' if failed else 'PASS; services, scheduled invocation and verified fresh backup'))
    return int(failed)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('RESULT=FAIL; operational check could not collect complete evidence', file=sys.stderr)
        sys.exit(1)
PY
