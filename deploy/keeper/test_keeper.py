import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import keeper
from configure import match_chat, read_token


class KeeperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.now = dt.datetime(2026,10,24,3,tzinfo=dt.timezone.utc)
        self.name = 'backup-20261024T030000Z-1234abcd'
        folder = self.root/self.name
        folder.mkdir()
        for file in ('database.dump','media.tar.gz','SHA256SUMS'):
            (folder/file).write_text('verified-by-backup-program')
        self.put(folder/'SUCCESS.json', {'managedBy':'comic-diary-backup-v1','completedAt':self.now.isoformat()})
        self.put(self.root/'last-success.json', {'managedBy':'comic-diary-backup-v1','backup':self.name,'completedAt':self.now.isoformat()})
        self.put(self.root/'last-attempt.json', {'result':'PASS','at':self.now.isoformat()})

    def tearDown(self):
        self.temp.cleanup()

    def put(self,path,data):
        path.write_text(json.dumps(data))

    def good(self):
        return keeper.health(self.root,self.now,True)

    def test_new_backup_then_silence(self):
        sent=[]
        state,changed=keeper.process(self.good(),{},self.now,sent.append)
        self.assertTrue(changed)
        self.assertEqual(len(sent),1)
        _,changed=keeper.process(self.good(),state,self.now+dt.timedelta(minutes=15),sent.append)
        self.assertFalse(changed)
        self.assertEqual(len(sent),1)

    def test_error_dedup_reminder_and_recovery(self):
        current=dict(self.good(),problems=['LAST_ATTEMPT'])
        sent=[]
        state,_=keeper.process(current,{},self.now,sent.append)
        _,changed=keeper.process(current,state,self.now+dt.timedelta(hours=5),sent.append)
        self.assertFalse(changed)
        state,changed=keeper.process(current,state,self.now+dt.timedelta(hours=6),sent.append)
        self.assertTrue(changed)
        state,changed=keeper.process(self.good(),state,self.now+dt.timedelta(hours=7),sent.append)
        self.assertTrue(changed)
        self.assertIn('снова в порядке',sent[-1])
        _,changed=keeper.process(self.good(),state,self.now+dt.timedelta(hours=8),sent.append)
        self.assertFalse(changed)

    def test_delivery_failure_does_not_acknowledge(self):
        previous={}
        def fail(text):
            raise RuntimeError('simulated network error with secret URL')
        with self.assertRaises(RuntimeError):
            keeper.process(self.good(),previous,self.now,fail)
        self.assertEqual(previous,{})
        sent=[]
        _,changed=keeper.process(self.good(),previous,self.now,sent.append)
        self.assertTrue(changed)

    def test_stale_future_timer_failure_and_bad_attempt(self):
        later=self.now+dt.timedelta(hours=37)
        value=keeper.health(self.root,later,False)
        self.assertIn('TIMER',value['problems'])
        self.assertIn('STALE',value['problems'])
        self.assertIn('ATTEMPT_STALE',value['problems'])
        self.assertIn('STALE',keeper.health(self.root,self.now-dt.timedelta(minutes=1),True)['problems'])
        self.put(self.root/'last-attempt.json',{'result':'FAIL','at':self.now.isoformat()})
        self.assertIn('LAST_ATTEMPT',self.good()['problems'])

    def test_missing_corrupt_or_linked_payload(self):
        file=self.root/self.name/'database.dump'
        file.unlink()
        self.assertIn('BACKUP_METADATA',self.good()['problems'])
        file.symlink_to(self.root/'last-success.json')
        self.assertIn('BACKUP_METADATA',self.good()['problems'])
        (self.root/'last-attempt.json').write_text('{bad')
        self.assertIn('ATTEMPT_METADATA',self.good()['problems'])

    def test_empty_missing_wrong_marker_and_directory_traversal(self):
        (self.root/self.name/'media.tar.gz').write_bytes(b'')
        self.assertIn('BACKUP_METADATA',self.good()['problems'])
        self.put(self.root/'last-success.json',{'managedBy':'foreign','backup':'../other'})
        self.assertIn('BACKUP_METADATA',self.good()['problems'])

    def test_pairing_only_exact_private_self_message(self):
        def update(text='/start CODE',chat=7,sender=7,kind='private',bot=False):
            return {'message':{'chat':{'id':chat,'type':kind},'from':{'id':sender,'is_bot':bot},'text':text}}
        self.assertEqual(match_chat([update()], 'CODE'),7)
        for wrong in [update('/start OLD'),update(kind='group'),update(sender=8),update(bot=True)]:
            self.assertIsNone(match_chat([wrong],'CODE'))
        with self.assertRaises(ValueError):
            match_chat([update(),update(chat=8,sender=8)],'CODE')

    def test_atomic_state_permissions_and_symlink_refusal(self):
        target=self.root/'state.json'
        keeper.write_json(target,{'managedBy':keeper.MANAGED})
        self.assertEqual(target.stat().st_mode & 0o777,0o600)
        target.unlink();target.symlink_to(self.root/'last-success.json')
        with self.assertRaises(ValueError):
            keeper.write_json(target,{})

    def test_no_token_or_private_data_in_messages(self):
        for problems in [[],['LAST_ATTEMPT'],['STALE'],['BACKUP_METADATA','TIMER']]:
            current=dict(self.good(),problems=problems)
            message,_=keeper.notification(current,{},self.now)
            self.assertNotIn('token',message)
            self.assertNotIn('/opt/',message)
            self.assertNotIn('1234abcd',message)

    def test_lightweight_monitor_does_not_read_archive_bytes(self):
        original=keeper.read_json
        def json_only(path,*args,**kwargs):
            self.assertTrue(str(path).endswith('.json'))
            return original(path,*args,**kwargs)
        with patch.object(keeper,'read_json',side_effect=json_only):
            self.assertFalse(self.good()['problems'])


class TerminalTests(unittest.TestCase):
    def test_token_input_refuses_noninteractive_stdin(self):
        with patch('configure.sys.stdin.isatty', return_value=False), patch('configure.getpass.getpass') as prompt:
            with self.assertRaises(ValueError):
                read_token()
            prompt.assert_not_called()

    def test_hidden_input_in_real_controlling_terminal(self):
        import errno
        import os
        import pty
        import select
        import time
        secret = b'test-only-token-DO-NOT-ECHO'
        pid, descriptor = pty.fork()
        if pid == 0:
            try:
                value = read_token()
                print('HIDDEN_INPUT_OK' if value.encode() == secret else 'BAD_INPUT', flush=True)
                os._exit(0)
            except Exception:
                os._exit(2)
        output = b''
        supplied = False
        deadline = time.monotonic()+5
        try:
            while time.monotonic() < deadline:
                if not select.select([descriptor],[],[],0.1)[0]:
                    continue
                try:
                    chunk = os.read(descriptor,4096)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                output += chunk
                if not supplied and b': ' in output:
                    os.write(descriptor,secret+b'\n')
                    supplied = True
            if not supplied or b'HIDDEN_INPUT_OK' not in output:
                os.kill(pid,9)
            _, status = os.waitpid(pid,0)
            self.assertEqual(os.waitstatus_to_exitcode(status),0)
            self.assertIn(b'HIDDEN_INPUT_OK',output)
            self.assertNotIn(secret,output)
        finally:
            os.close(descriptor)


if __name__=='__main__':
    unittest.main()
