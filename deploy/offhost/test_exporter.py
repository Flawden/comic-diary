import base64
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import exporter
from install_server import public_key


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.name='backup-20261024T031700Z-1234abcd';self.folder=self.root/self.name;self.folder.mkdir()
        for i,name in enumerate(exporter.CORE):
            (self.folder/name).write_bytes(bytes([0,255,i])+b'\nbackup-data\r\n')
        (self.folder/'SHA256SUMS').write_text(''.join(hashlib.sha256((self.folder/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in exporter.CORE))
        (self.folder/'SUCCESS.json').write_text(json.dumps({'managedBy':'comic-diary-backup-v1','completedAt':'2026-10-24T03:17:00+00:00'}))
        (self.root/'last-success.json').write_text(json.dumps({'managedBy':'comic-diary-backup-v1','backup':self.name}))

    def tearDown(self):self.temp.cleanup()

    def test_inventory_and_binary_stream_are_exact_and_read_only(self):
        before={str(p.relative_to(self.root)):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result=exporter.inventory(self.root)
        self.assertEqual(result['latest'],self.name)
        output=io.BytesIO();exporter.stream_backup(self.root,self.name,output);output.seek(0)
        with tarfile.open(fileobj=output) as archive:
            self.assertEqual(archive.getnames(),list(exporter.FILES))
            for item in archive:
                self.assertTrue(item.isfile())
                self.assertEqual(archive.extractfile(item).read(),(self.folder/item.name).read_bytes())
        after={str(p.relative_to(self.root)):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before,after)

    def test_list_never_reads_large_dump_or_media(self):
        read=Path.read_bytes
        def guard(path):
            self.assertNotIn(path.name,exporter.CORE)
            return read(path)
        with patch.object(Path,'read_bytes',guard):
            self.assertEqual(len(exporter.inventory(self.root)['backups']),1)

    def test_command_boundary_refuses_shell_scp_traversal_and_extra_args(self):
        self.assertEqual(exporter.parse_command(['list']),('list',None))
        self.assertEqual(exporter.parse_command(['get',self.name]),('get',self.name))
        for parts in [[],['id'],['sh'],['scp','-f','/etc/passwd'],['list','extra'],['get','../etc/passwd'],['get',self.name,'more'],['list;id']]:
            with self.assertRaises(ValueError):exporter.parse_command(parts)

    def test_latest_missing_or_unmanaged_fails(self):
        (self.folder/'SUCCESS.json').write_text('{}')
        with self.assertRaises(ValueError):exporter.inventory(self.root)

    def test_manifest_duplicates_extra_paths_and_missing_hashes_fail(self):
        original=(self.folder/'SHA256SUMS').read_text()
        for value in [original+original.splitlines()[0]+'\n',original.replace('database.dump','../database.dump'),original.splitlines()[0]+'\n']:
            (self.folder/'SHA256SUMS').write_text(value)
            with self.assertRaises(ValueError):exporter.describe(self.root,self.name)

    def test_linked_backup_or_payload_refused(self):
        file=self.folder/'database.dump';file.unlink();file.symlink_to(self.root/'last-success.json')
        with self.assertRaises(ValueError):exporter.describe(self.root,self.name)
        output=io.BytesIO()
        with self.assertRaises(ValueError):exporter.stream_backup(self.root,self.name,output)
        self.assertEqual(output.getvalue(),b'')

    def test_wire_key_validation_ignores_comment_but_rejects_options(self):
        wire=struct.pack('>I',11)+b'ssh-ed25519'+struct.pack('>I',32)+b'x'*32
        key='ssh-ed25519 '+base64.b64encode(wire).decode()
        self.assertEqual(public_key(key+' PC user comment'),key)
        for value in ['command="sh" '+key,'ssh-rsa xxx','ssh-ed25519 invalid','ssh-ed25519 '+base64.b64encode(b'wrong').decode()]:
            with self.assertRaises(ValueError):public_key(value)

    def test_unknown_manual_directories_are_not_exported(self):
        (self.root/'manual-backup').mkdir()
        self.assertEqual(len(exporter.inventory(self.root)['backups']),1)


if __name__=='__main__':unittest.main()
