"""No Docker/root needed: validate backup lifecycle, checksums and retention isolation."""
import contextlib
import datetime as dt
import fcntl
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('diary_backup', Path(__file__).with_name('backup.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeBackup(module.Backup):
    fail = None

    def __init__(self, root, **kwargs):
        super().__init__(root=root, **kwargs)
        self.calls = []

    def command(self, args, output=None, input_file=None):
        self.calls.append(args)
        if args[1:2] == ['compose']:
            return (('a' if args[-1] == 'db' else 'b') * 64).encode()
        if args[1:2] == ['inspect']:
            return b'true' if args[3] == '{{.State.Running}}' else ('sha256:' + 'c' * 64).encode()
        if args[1:3] == ['image', 'inspect']:
            return b'["ghcr.io/example/app@sha256:fake-test-digest"]'
        if 'node' in args:
            return b'/app/data/media'
        if 'pg_dump' in args[-1]:
            if self.fail == 'dump':
                raise subprocess.CalledProcessError(1, args)
            output.write(b'PGDMP-example-bytes')
        elif 'pg_restore' in args:
            if self.fail == 'toc':
                raise subprocess.CalledProcessError(1, args)
            assert input_file.read().startswith(b'PGDMP')
            output.write(b'example table of contents')
        elif args[1] == 'cp':
            folder = Path(args[-1]) / 'covers'
            folder.mkdir()
            (folder / 'cover.png').write_bytes(b'cover-bytes')
            if self.fail == 'link':
                (folder / 'bad').symlink_to('/etc/passwd')
        return b''


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'automatic'
        self.now = dt.datetime(2026, 10, 18, tzinfo=dt.timezone.utc)
        self.backup = FakeBackup(self.root, clock=lambda: self.now, keep=2)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()

    def tearDown(self):
        self.output.__exit__(None, None, None)
        self.temp.cleanup()

    def test_complete_backup_and_status(self):
        folder = self.backup.run()
        module.verify(folder)
        self.assertEqual(json.loads((folder / 'backup.json').read_text())['mediaFiles'], 1)
        self.assertFalse((folder / 'captured-media').exists())
        self.assertFalse(list(self.root.glob('.partial-*')))
        self.backup.status()
        # The only production operations are inspections, dump/list and media copy.
        self.assertFalse(any(args[1] in ['stop', 'rm', 'restart', 'run', 'create'] for args in self.backup.calls))
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o700)

    def test_failure_preserves_previous_success_and_retention(self):
        previous = self.backup.run()
        state = (self.root / 'last-success.json').read_bytes()
        for failure in ('dump', 'toc', 'link'):
            self.backup.fail = failure
            with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                self.backup.run()
            self.assertTrue(previous.is_dir())
            self.assertEqual((self.root / 'last-success.json').read_bytes(), state)
            self.assertFalse(list(self.root.glob('.partial-*')))
            self.assertEqual(json.loads((self.root / 'last-attempt.json').read_text())['result'], 'FAIL')

    def test_retention_only_verified_managed_backups(self):
        first = self.backup.run()
        self.now += dt.timedelta(days=1)
        second = self.backup.run()
        # Protect corrupt and unrelated folders, including names resembling managed ones.
        (first / 'database.dump').write_bytes(b'corrupt')
        foreign = self.root / 'backup-20200101T000000Z-1234abcd'
        foreign.mkdir()
        (foreign / 'SUCCESS.json').write_text('{"managedBy":"other"}')
        manual = self.root / 'manual-backup'
        manual.mkdir()
        outside = self.root.parent / 'outside'
        outside.mkdir()
        linked = self.root / 'backup-20200101T000000Z-2222abcd'
        linked.symlink_to(outside, target_is_directory=True)
        self.now += dt.timedelta(days=1)
        third = self.backup.run()
        self.now += dt.timedelta(days=1)
        fourth = self.backup.run()
        self.assertTrue(first.exists())
        self.assertFalse(second.exists())
        self.assertTrue(third.exists() and fourth.exists())
        self.assertTrue(foreign.exists() and manual.exists() and linked.is_symlink() and outside.exists())

    def test_bad_checksums_fail_status_and_are_not_pruned(self):
        folder = self.backup.run()
        (folder / 'media.tar.gz').write_bytes(b'broken')
        with self.assertRaises(ValueError):
            self.backup.status()

    def test_retention_keeps_latest_even_with_same_timestamp(self):
        folders = [self.backup.run() for _ in range(6)]
        self.assertTrue(folders[-1].exists())
        self.backup.status()
        self.assertEqual(sum(folder.exists() for folder in folders), 2)

    def test_stale_status(self):
        self.backup.run()
        self.now += dt.timedelta(hours=37)
        with self.assertRaises(ValueError):
            self.backup.status()

    def test_no_concurrent_backup(self):
        self.backup.prepare()
        with (self.root / '.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(RuntimeError):
                self.backup.run()
        self.assertFalse(list(self.root.glob('.partial-*')))

    def test_symlink_root_rejected(self):
        self.root.symlink_to(self.root.parent, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.backup.run()


if __name__ == '__main__':
    unittest.main()
