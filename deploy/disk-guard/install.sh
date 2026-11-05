#!/usr/bin/env bash
# Managed by comic-diary-disk-guard-v1
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash deploy/disk-guard/install.sh'; exit 1; }
cd "$(dirname "${BASH_SOURCE[0]}")"
for f in guard.py test_guard.py comic-diary-disk-guard.service comic-diary-disk-guard.timer; do
  [[ -f $f && ! -L $f ]] || { echo "Missing or linked source: $f"; exit 1; }
done
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -p test_guard.py -v
python3 -c "import ast; from pathlib import Path; ast.parse(Path('guard.py').read_text())"
[[ -f /opt/comic-diary/compose.yml ]] || { echo 'Missing production Compose'; exit 1; }
[[ -f /usr/local/lib/comic-diary/keeper/keeper.py ]] || { echo 'Telegram keeper must be installed first'; exit 1; }
python3 - <<'PY'
from pathlib import Path
for name in ('/usr/local/lib/comic-diary','/usr/local/lib/comic-diary/disk-guard',
             '/etc/comic-diary','/var/lib/comic-diary-disk-guard'):
    path = Path(name)
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise SystemExit('Linked install path: '+name)
folder=Path('/usr/local/lib/comic-diary/disk-guard')
if folder.exists() and not (folder/'.managed-v1').is_file():
    raise SystemExit('Unmanaged disk guard install')
for unit in ('comic-diary-disk-guard.service','comic-diary-disk-guard.timer'):
    path=Path('/etc/systemd/system')/unit
    if path.is_symlink() or (path.exists() and '# Managed by comic-diary-disk-guard-v1' not in path.read_text()):
        raise SystemExit('Unmanaged systemd unit: '+unit)
PY
install -d -m 700 /usr/local/lib/comic-diary/disk-guard /var/lib/comic-diary-disk-guard
install -m 600 guard.py /usr/local/lib/comic-diary/disk-guard/guard.py
printf '%s\n' 'comic-diary-disk-guard-v1' > /usr/local/lib/comic-diary/disk-guard/.managed-v1
install -m 644 comic-diary-disk-guard.service comic-diary-disk-guard.timer /etc/systemd/system/
if [[ ! -e /etc/comic-diary/disk-guard.json ]]; then
  install -d -m 700 /etc/comic-diary
  printf '{"managedBy":"comic-diary-disk-guard-v1","autoPruneEnabled":false}\n' > /etc/comic-diary/disk-guard.json
  chmod 600 /etc/comic-diary/disk-guard.json
fi
python3 /usr/local/lib/comic-diary/disk-guard/guard.py --check
python3 /usr/local/lib/comic-diary/disk-guard/guard.py --dry-run
systemd-analyze verify /etc/systemd/system/comic-diary-disk-guard.service /etc/systemd/system/comic-diary-disk-guard.timer
systemctl daemon-reload
systemctl enable --now comic-diary-disk-guard.timer
systemctl is-active --quiet comic-diary-disk-guard.timer
echo 'BR01=INSTALLED; monitoring active; AUTO_PRUNE=OFF until explicitly enabled.'
echo 'Run --test-alert to verify Telegram delivery; --dry-run to review image retention.'
