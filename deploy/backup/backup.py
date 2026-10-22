#!/usr/bin/env python3
"""Comic Diary managed backup v1. Root-only; reads production data, never restores it."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid

ROOT = Path('/opt/comic-diary/backups/automatic')
COMPOSE = '/opt/comic-diary/compose.yml'
MANAGED_BY = 'comic-diary-backup-v1'
NAME = re.compile(r'backup-\d{8}T\d{6}Z-[0-9a-f]{8}\Z')
FILES = ('database.dump', 'media.tar.gz', 'backup.json', 'media-manifest.json', 'dump-list.txt')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else stream_digest(stream)


def stream_digest(stream):
    sha = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        sha.update(block)
    return sha.hexdigest()


def write_json(path, data):
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write('\n')
        file.flush()
        os.fsync(file.fileno())
    temporary.replace(path)


def verify(folder):
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError('Invalid backup directory')
    checks = folder / 'SHA256SUMS'
    if checks.is_symlink() or not checks.is_file():
        raise ValueError('Missing checksum manifest')
    lines = checks.read_text().splitlines()
    expected = {}
    for line in lines:
        sha, name = line.split('  ', 1)
        if name not in FILES or name in expected or not re.fullmatch('[0-9a-f]{64}', sha):
            raise ValueError('Invalid checksum manifest')
        expected[name] = sha
    if set(expected) != set(FILES):
        raise ValueError('Incomplete checksum manifest')
    for name, sha in expected.items():
        path = folder / name
        if path.is_symlink() or not path.is_file() or digest(path) != sha:
            raise ValueError('Backup checksum mismatch: ' + name)


class Backup:
    def __init__(self, root=ROOT, compose=COMPOSE, keep=14, clock=None):
        self.root = Path(root)
        self.compose = str(compose)
        self.keep = keep
        self.clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))

    def command(self, args, output=None, input_file=None):
        return subprocess.run(args, check=True, stdin=input_file,
                              stdout=output if output is not None else subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=900).stdout

    def capture(self, args):
        return self.command(args).decode().strip()

    def docker_id(self, service):
        identifier = self.capture(['docker', 'compose', '-f', self.compose, 'ps', '-q', service])
        if not re.fullmatch('[a-f0-9]{12,64}', identifier):
            raise ValueError('Expected one running service: ' + service)
        if self.capture(['docker', 'inspect', '--format', '{{.State.Running}}', identifier]) != 'true':
            raise ValueError('Service is not running: ' + service)
        return identifier

    def image(self, identifier):
        image = self.capture(['docker', 'inspect', '--format', '{{.Image}}', identifier])
        if not re.fullmatch('sha256:[a-f0-9]{64}', image):
            raise ValueError('Cannot resolve immutable image')
        refs = json.loads(self.capture(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', image]))
        return {'localImageId': image, 'repositoryDigests': refs or []}

    def prepare(self):
        if self.root.is_symlink():
            raise ValueError('Backup root must not be a symlink')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.root.chmod(0o700)

    def run(self):
        self.prepare()
        descriptor = os.open(self.root / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('Another backup is running') from None
            stage = None
            try:
                stage = Path(tempfile.mkdtemp(prefix='.partial-', dir=self.root))
                folder = self.create(stage)
                stage = None
                write_json(self.root / 'last-success.json', {
                    'managedBy': MANAGED_BY, 'backup': folder.name,
                    'completedAt': self.clock().isoformat(),
                })
                self.prune()
                write_json(self.root / 'last-attempt.json', {'result': 'PASS', 'at': self.clock().isoformat()})
                print('BACKUP=PASS; directory=' + str(folder), flush=True)
                print('OFF_HOST_TRANSFER=NOT_CONFIGURED', flush=True)
                return folder
            except Exception as error:
                # Retain all previous complete backups; remove only this run's staging folder.
                if stage is not None:
                    shutil.rmtree(stage)
                write_json(self.root / 'last-attempt.json', {
                    'result': 'FAIL', 'at': self.clock().isoformat(), 'errorType': type(error).__name__,
                })
                raise

    def create(self, stage):
        print('BACKUP_STAGE=database', flush=True)
        db, app = self.docker_id('db'), self.docker_id('app')
        images = {'database': self.image(db), 'application': self.image(app)}
        media_root = self.capture(['docker', 'exec', app, 'node', '-e',
                                  'process.stdout.write(process.env.MEDIA_ROOT || "")'])
        if media_root != '/app/data/media':
            raise ValueError('Unexpected MEDIA_ROOT')
        with (stage / 'database.dump').open('xb') as output:
            self.command(['docker', 'exec', db, 'sh', '-eu', '-c',
                          'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl'], output=output)
        if not (stage / 'database.dump').stat().st_size:
            raise ValueError('Empty database dump')
        with (stage / 'database.dump').open('rb') as source, (stage / 'dump-list.txt').open('xb') as output:
            self.command(['docker', 'exec', '-i', db, 'pg_restore', '--list'], input_file=source, output=output)

        print('BACKUP_STAGE=media', flush=True)
        captured = stage / 'captured-media'
        captured.mkdir()
        self.command(['docker', 'cp', app + ':' + media_root + '/.', str(captured)])
        manifest = {}
        with tarfile.open(stage / 'media.tar.gz', 'w:gz') as archive:
            for path in sorted(captured.rglob('*')):
                if path.is_symlink() or not (path.is_file() or path.is_dir()):
                    raise ValueError('Links/special media files are unsupported')
                if path.is_file():
                    name = path.relative_to(captured).as_posix()
                    manifest[name] = digest(path)
                    archive.add(path, arcname=name, recursive=False)
        # Read every archived byte and verify against the capture before committing.
        restored = {}
        with tarfile.open(stage / 'media.tar.gz', 'r:gz') as archive:
            for item in archive:
                if not item.isfile() or item.name in restored:
                    raise ValueError('Invalid media archive')
                with archive.extractfile(item) as stream:
                    restored[item.name] = stream_digest(stream)
        if restored != manifest:
            raise ValueError('Media archive verification failed')
        write_json(stage / 'media-manifest.json', manifest)
        shutil.rmtree(captured)
        write_json(stage / 'backup.json', {
            'managedBy': MANAGED_BY, 'schemaVersion': 1, 'createdAt': self.clock().isoformat(),
            'images': images, 'mediaFiles': len(manifest),
            'scope': 'database and local media; media captured after DB snapshot, not atomic',
            'restoreTest': 'archive readability and SHA-256 only; separate restore drill required',
            'offHostTransfer': 'not configured',
        })
        with (stage / 'SHA256SUMS').open('x', encoding='ascii') as checks:
            for name in FILES:
                checks.write(digest(stage / name) + '  ' + name + '\n')
        verify(stage)
        write_json(stage / 'SUCCESS.json', {'managedBy': MANAGED_BY, 'completedAt': self.clock().isoformat()})
        # Sync payload files before publishing the completed directory name.
        for path in stage.iterdir():
            with path.open('rb') as file:
                os.fsync(file.fileno())
        name = 'backup-' + self.clock().strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        final = self.root / name
        stage.rename(final)
        descriptor = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return final

    def prune(self):
        candidates = []
        for folder in self.root.iterdir():
            if not NAME.fullmatch(folder.name) or folder.is_symlink() or not folder.is_dir():
                continue
            try:
                marker = folder / 'SUCCESS.json'
                if marker.is_symlink():
                    continue
                metadata = json.loads(marker.read_text())
                if metadata.get('managedBy') != MANAGED_BY:
                    continue
                verify(folder)
                completed = dt.datetime.fromisoformat(metadata['completedAt'])
                if completed.tzinfo is None:
                    raise ValueError('Missing timezone')
                candidates.append((completed, folder))
            except (OSError, ValueError, KeyError, TypeError):
                print('RETENTION=SKIPPED_UNVERIFIED; directory=' + folder.name, flush=True)
        latest = json.loads((self.root / 'last-success.json').read_text())['backup']
        candidates.sort(key=lambda item: (item[1].name == latest, item[0], item[1].name), reverse=True)
        for _, folder in candidates[self.keep:]:
            shutil.rmtree(folder)
            print('RETENTION=REMOVED; directory=' + folder.name, flush=True)

    def status(self):
        state = json.loads((self.root / 'last-success.json').read_text())
        if state.get('managedBy') != MANAGED_BY or not NAME.fullmatch(state['backup']):
            raise ValueError('Invalid last-success metadata')
        folder = self.root / state['backup']
        verify(folder)
        age = self.clock() - dt.datetime.fromisoformat(state['completedAt'])
        if not dt.timedelta(0) <= age <= dt.timedelta(hours=36):
            raise ValueError('Last verified backup is older than 36 hours or timestamp is invalid')
        print('BACKUP_STATUS=PASS; latest=' + str(folder), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--status', action='store_true', help='Verify most recent backup and 36-hour freshness')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run as root')
    os.umask(0o077)
    try:
        backup = Backup()
        backup.status() if args.status else backup.run()
    except Exception as error:
        # Log type only: Docker stderr can contain environment-specific details.
        print('BACKUP=FAIL; errorType=' + type(error).__name__ + '; see BACKUP_STAGE above', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
