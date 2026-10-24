#!/usr/bin/python3
"""Restricted read-only export of completed managed backups. Never runs a shell."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile

ROOT = Path('/opt/comic-diary/backups/automatic')
NAME = re.compile(r'backup-\d{8}T\d{6}Z-[0-9a-f]{8}\Z')
CORE = ('database.dump','media.tar.gz','backup.json','media-manifest.json','dump-list.txt')
FILES = CORE + ('SHA256SUMS','SUCCESS.json')


def parse_command(parts):
    if parts == ['list']:
        return 'list', None
    if len(parts) == 2 and parts[0] == 'get' and NAME.fullmatch(parts[1]):
        return 'get', parts[1]
    raise ValueError('Only list or get of a managed backup is permitted')


def small_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024*1024:
        raise ValueError('Invalid metadata file')
    return json.loads(path.read_text())


def describe(root, name):
    if not NAME.fullmatch(name) or root.is_symlink():
        raise ValueError('Invalid backup root/name')
    folder = root/name
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Invalid backup directory')
    marker = small_json(folder/'SUCCESS.json')
    if marker.get('managedBy') != 'comic-diary-backup-v1':
        raise ValueError('Unmanaged backup')
    completed = dt.datetime.fromisoformat(marker['completedAt'])
    if completed.tzinfo is None:
        raise ValueError('Missing timezone')
    manifest = folder/'SHA256SUMS'
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 4096:
        raise ValueError('Invalid checksum manifest')
    hashes = {}
    for line in manifest.read_text().splitlines():
        value, filename = line.split('  ',1)
        if filename not in CORE or filename in hashes or not re.fullmatch('[0-9a-f]{64}',value):
            raise ValueError('Invalid checksum entry')
        hashes[filename] = value
    if set(hashes) != set(CORE):
        raise ValueError('Incomplete manifest')
    files = []
    for filename in FILES:
        path = folder/filename
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size <= 0:
            raise ValueError('Invalid backup file')
        if filename not in CORE:
            if info.st_size > 4096:
                raise ValueError('Oversized metadata')
            hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        files.append(dict(name=filename,size=info.st_size,sha256=hashes[filename]))
    return dict(name=name,completedAt=completed.isoformat(),files=files)


def inventory(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Invalid root')
    pointer = small_json(root/'last-success.json')
    if pointer.get('managedBy') != 'comic-diary-backup-v1' or not NAME.fullmatch(pointer['backup']):
        raise ValueError('Invalid latest pointer')
    backups, skipped = [], 0
    for folder in sorted(root.iterdir()):
        if not NAME.fullmatch(folder.name):
            continue
        try:
            backups.append(describe(root,folder.name))
        except (OSError,ValueError,KeyError,TypeError):
            skipped += 1
    if not any(item['name'] == pointer['backup'] for item in backups):
        raise ValueError('Latest completed backup is not exportable')
    return dict(schemaVersion=1,latest=pointer['backup'],backups=backups,skippedCount=skipped)


def stream_backup(root, name, output):
    describe(root,name)
    # Hold open file descriptors, not the global backup lock. Retention can unlink
    # an old directory without interrupting an already-open transfer or new backups.
    root_fd = os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    streams = []
    try:
        folder_fd = os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root_fd)
        try:
            for filename in FILES:
                fd = os.open(filename,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=folder_fd)
                stream = os.fdopen(fd,'rb')
                streams.append((filename,stream))
                if not stat.S_ISREG(os.fstat(fd).st_mode):
                    raise ValueError('Nonregular export file')
        finally:
            os.close(folder_fd)
        with tarfile.open(fileobj=output,mode='w|',format=tarfile.USTAR_FORMAT) as archive:
            for filename,stream in streams:
                info = os.fstat(stream.fileno())
                member = tarfile.TarInfo(filename)
                member.size=info.st_size; member.mode=0o600; member.mtime=int(info.st_mtime)
                archive.addfile(member,stream)
    finally:
        for _,stream in streams:
            stream.close()
        os.close(root_fd)


def main():
    action,name=parse_command(sys.argv[1:])
    if os.geteuid()!=0:
        raise ValueError('Root export helper required')
    if action=='list':
        print(json.dumps(inventory(ROOT),separators=(',',':')))
    else:
        stream_backup(ROOT,name,sys.stdout.buffer)


if __name__=='__main__':
    try:
        main()
    except Exception:
        print('BACKUP_EXPORT=FAIL; requested completed backup unavailable or request refused',file=sys.stderr)
        sys.exit(1)
