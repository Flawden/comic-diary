#!/usr/bin/env bash
# Managed by comic-diary-backup-v1
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash install.sh'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for file in backup.py test_backup.py comic-diary-backup.service comic-diary-backup.timer; do
  [[ -f $source_dir/$file && ! -L $source_dir/$file ]] || { echo "Missing/linked source: $file"; exit 1; }
done
[[ -f /opt/comic-diary/compose.yml ]] || { echo 'Production Compose is missing'; exit 1; }
command -v python3 >/dev/null
command -v systemctl >/dev/null
command -v systemd-analyze >/dev/null
python3 - "$source_dir/backup.py" <<'PY'
import ast,pathlib,sys
ast.parse(pathlib.Path(sys.argv[1]).read_text())
PY
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$source_dir" -p test_backup.py -v
systemd-analyze calendar '*-*-* 03:15:00 Europe/Moscow' >/dev/null
for path in /usr/local/lib/comic-diary/backup.py /etc/systemd/system/comic-diary-backup.service /etc/systemd/system/comic-diary-backup.timer; do
  [[ ! -L $path ]] || { echo "Refusing linked target: $path"; exit 1; }
  if [[ -e $path ]] && ! grep -q 'comic-diary-backup-v1' "$path"; then
    echo "Refusing unmanaged target: $path"; exit 1
  fi
done
saved=$(mktemp -d /opt/comic-diary/backups/backup-installer-XXXXXXXX)
for path in /usr/local/lib/comic-diary/backup.py /etc/systemd/system/comic-diary-backup.service /etc/systemd/system/comic-diary-backup.timer; do
  if [[ -f $path ]]; then cp -p "$path" "$saved/$(basename "$path")"; fi
done
echo "INSTALL_BACKUP=$saved"
# Stop only this backup timer during installation; never stop the app or DB.
if systemctl is-active --quiet comic-diary-backup.service; then
  echo 'A backup is currently running. Retry after it finishes.'; exit 1
fi
systemctl stop comic-diary-backup.timer 2>/dev/null || true
if systemctl is-active --quiet comic-diary-backup.service; then
  echo 'A backup started during installation. Retry after it finishes.'; exit 1
fi
install -d -m 755 /usr/local/lib/comic-diary
install -m 600 "$source_dir/backup.py" /usr/local/lib/comic-diary/backup.py
install -m 644 "$source_dir/comic-diary-backup.service" /etc/systemd/system/comic-diary-backup.service
install -m 644 "$source_dir/comic-diary-backup.timer" /etc/systemd/system/comic-diary-backup.timer
systemd-analyze verify /etc/systemd/system/comic-diary-backup.service /etc/systemd/system/comic-diary-backup.timer
systemctl daemon-reload
systemctl reset-failed comic-diary-backup.service || true
systemctl start comic-diary-backup.service
python3 /usr/local/lib/comic-diary/backup.py --status
systemctl enable --now comic-diary-backup.timer
systemctl list-timers --all comic-diary-backup.timer --no-pager
echo 'INSTALL=PASS; daily 03:15 Europe/Moscow plus up to 5 minutes; retain 14 verified successful copies'
echo 'OFF_HOST_TRANSFER=NOT_CONFIGURED; this timer stores backups on this server'
