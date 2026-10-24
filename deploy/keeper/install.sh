#!/usr/bin/env bash
# Managed by comic-diary-keeper-v1
set -Eeuo pipefail
umask 077
was_active=false
restore_monitor_on_error() {
  code=$?
  if [[ $code -ne 0 && $was_active == true ]]; then
    systemctl daemon-reload || true
    systemctl start comic-diary-keeper.timer || true
    echo 'INSTALL=FAIL; previously active monitor timer restart requested; inspect journal.' >&2
  fi
  exit "$code"
}
trap restore_monitor_on_error EXIT
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash install.sh'; exit 1; }
stage=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$stage"
for file in keeper.py configure.py test_keeper.py comic-diary-keeper.service comic-diary-keeper.timer; do
  [[ -f $file && ! -L $file ]] || { echo "Missing/linked source: $file"; exit 1; }
done
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -p test_keeper.py -v
python3 - <<'PY'
from pathlib import Path
for name in ('keeper.py','configure.py'):
    compile(Path(name).read_text(),name,'exec')
for name in ('/usr/local/lib/comic-diary','/usr/local/lib/comic-diary/keeper','/etc/comic-diary','/var/lib/comic-diary-keeper'):
    path=Path(name)
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise SystemExit('Linked install parent: '+name)
for name in ('/etc/systemd/system/comic-diary-keeper.service','/etc/systemd/system/comic-diary-keeper.timer'):
    path=Path(name)
    if path.is_symlink() or (path.exists() and '# Managed by comic-diary-keeper-v1' not in path.read_text()):
        raise SystemExit('Unmanaged existing unit: '+name)
folder=Path('/usr/local/lib/comic-diary/keeper')
if folder.exists() and not (folder/'.managed-v1').is_file():
    raise SystemExit('Unmanaged existing keeper directory')
PY
backup=$(mktemp -d /opt/comic-diary/backups/keeper-install-XXXXXXXX)
for target in /usr/local/lib/comic-diary/keeper /etc/systemd/system/comic-diary-keeper.service /etc/systemd/system/comic-diary-keeper.timer; do
  if [[ -e $target ]]; then cp -a --parents "$target" "$backup/"; fi
done
printf 'INSTALL_BACKUP=%s\n' "$backup"
# Serialize against any previous managed monitor during configuration/reinstall.
if systemctl is-active --quiet comic-diary-keeper.timer; then was_active=true; systemctl stop comic-diary-keeper.timer; fi
if systemctl is-active --quiet comic-diary-keeper.service; then systemctl stop comic-diary-keeper.service; fi
install -d -m 700 /usr/local/lib/comic-diary/keeper /var/lib/comic-diary-keeper
install -m 600 keeper.py configure.py /usr/local/lib/comic-diary/keeper/
printf '%s\n' 'comic-diary-keeper-v1' > /usr/local/lib/comic-diary/keeper/.managed-v1
install -m 644 comic-diary-keeper.service comic-diary-keeper.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/comic-diary-keeper.service /etc/systemd/system/comic-diary-keeper.timer
python3 /usr/local/lib/comic-diary/keeper/configure.py
systemctl daemon-reload
systemctl start comic-diary-keeper.service
systemctl enable --now comic-diary-keeper.timer
systemctl is-active --quiet comic-diary-keeper.timer
systemctl list-timers --all comic-diary-keeper.timer --no-pager
echo 'INSTALL=PASS; Telegram keeper is enabled. Delivery confirmation requires seeing the message in Telegram.'
echo 'OFF_HOST_TRANSFER=NOT_CONFIGURED; Windows pull is a separate step.'
