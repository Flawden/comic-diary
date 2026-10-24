#!/usr/bin/python3
"""Forced SSH command; separate key cannot request a shell, SCP or forwarding."""
import os
import shlex
import subprocess
import sys
from exporter import parse_command


def main():
    command=os.environ.get('SSH_ORIGINAL_COMMAND','')
    if len(command)>160:
        raise ValueError('Command too long')
    parts=shlex.split(command)
    parse_command(parts)
    return subprocess.run(['/usr/bin/sudo','-n','/usr/local/lib/comic-diary-backup-pull/exporter.py',*parts],check=False).returncode


if __name__=='__main__':
    try:
        sys.exit(main())
    except Exception:
        print('BACKUP_ACCESS=DENIED; only list and get are available',file=sys.stderr)
        sys.exit(1)
