#!/usr/bin/python3
"""Install a root-owned exporter and one restricted key for existing user flawden."""
import base64
import os
from pathlib import Path
import pwd
import re
import shutil
import struct
import subprocess
import sys
import tempfile

MARK='comic-diary-windows-pull-v1'
PROGRAM=Path('/usr/local/lib/comic-diary-backup-pull')
RULE=Path('/etc/sudoers.d/comic-diary-backup-pull')


def public_key(text):
    parts=text.strip().split()
    if len(parts)<2 or parts[0]!='ssh-ed25519':
        raise ValueError('Expected Ed25519 public key')
    raw=base64.b64decode(parts[1],validate=True)
    if len(raw)!=51 or raw[:4]!=struct.pack('>I',11) or raw[4:15]!=b'ssh-ed25519' or raw[15:19]!=struct.pack('>I',32):
        raise ValueError('Malformed public key')
    return 'ssh-ed25519 '+parts[1]


def safe(path):
    if any(p.is_symlink() for p in (path,*path.parents)):
        raise ValueError('Linked install path')


def main():
    if os.geteuid()!=0 or len(sys.argv)!=2:
        raise ValueError('Usage: sudo python3 install_server.py public-key-file')
    stage=Path(__file__).resolve().parent
    key_path=Path(sys.argv[1]);safe(key_path)
    key=public_key(key_path.read_text())
    user=pwd.getpwnam('flawden')
    ssh=Path(user.pw_dir)/'.ssh'; authorized=ssh/'authorized_keys'
    for path in (PROGRAM,RULE,ssh,authorized):safe(path)
    if PROGRAM.exists() and not (PROGRAM/'.managed-v1').is_file():
        raise ValueError('Unmanaged program directory')
    rule='# Managed by '+MARK+'\nflawden ALL=(root) NOPASSWD: '+str(PROGRAM/'exporter.py')+'\n'
    if RULE.exists() and '# Managed by '+MARK not in RULE.read_text():
        raise ValueError('Unmanaged sudo rule')
    existing=authorized.read_text() if authorized.exists() else ''
    entry='restrict,command="/usr/bin/python3 '+str(PROGRAM/'ssh_entry.py')+'" '+key+' '+MARK
    for line in existing.splitlines():
        if MARK in line and line!=entry:
            raise ValueError('A different managed key already exists; explicit rotation required')
        if key.split()[1] in line.split() and line!=entry:
            raise ValueError('This key already has different access options')
    for filename in ('exporter.py','ssh_entry.py'):
        source=stage/filename
        if source.is_symlink() or not source.is_file():raise ValueError('Missing/linked source')
        compile(source.read_text(),filename,'exec')
    with tempfile.NamedTemporaryFile('w',prefix='comic-diary-sudo-',delete=False) as f:
        f.write(rule);candidate=Path(f.name)
    try:
        subprocess.run(['/usr/sbin/visudo','-cf',str(candidate)],check=True,stdout=subprocess.DEVNULL)
        backup=Path(tempfile.mkdtemp(prefix='pull-install-',dir='/opt/comic-diary/backups'))
        if PROGRAM.exists():shutil.copytree(PROGRAM,backup/'program')
        if RULE.exists():shutil.copy2(RULE,backup/'sudo-rule')
        if authorized.exists():shutil.copy2(authorized,backup/'authorized_keys')
        PROGRAM.mkdir(mode=0o755,parents=True,exist_ok=True)
        PROGRAM.chmod(0o755);os.chown(PROGRAM,0,0)
        for filename in ('exporter.py','ssh_entry.py'):
            target=PROGRAM/filename
            shutil.copyfile(stage/filename,target);target.chmod(0o755);os.chown(target,0,0)
        (PROGRAM/'.managed-v1').write_text(MARK+'\n')
        shutil.copyfile(candidate,RULE);RULE.chmod(0o440);os.chown(RULE,0,0)
        ssh.mkdir(mode=0o700,exist_ok=True)
        if not authorized.exists() or entry not in existing.splitlines():
            descriptor,temp=tempfile.mkstemp(prefix='.backup-key-',dir=ssh)
            try:
                with os.fdopen(descriptor,'w') as file:
                    file.write(existing.rstrip('\n')+'\n'+entry+'\n')
                os.chown(temp,user.pw_uid,user.pw_gid);os.chmod(temp,0o600)
                os.replace(temp,authorized)
            finally:
                if os.path.exists(temp):os.unlink(temp)
        os.chown(ssh,user.pw_uid,user.pw_gid);ssh.chmod(0o700)
        print('EXPORT_ACCESS=PASS; restricted key installed; existing logins preserved')
        print('INSTALL_BACKUP='+str(backup))
    finally:
        candidate.unlink(missing_ok=True)


if __name__=='__main__':
    os.umask(0o077)
    try:main()
    except Exception:
        print('EXPORT_ACCESS=FAIL; installation stopped; inspect staged files/key or managed targets',file=sys.stderr)
        sys.exit(1)
