import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import guard


class DiskGuardTests(unittest.TestCase):
    def test_severity_and_thresholds(self):
        gib=1024**3
        self.assertEqual(guard.severity({'percent':40,'free':19*gib}), 'ok')
        self.assertFalse(guard.needs_pruning({'percent':40,'free':19*gib}))
        self.assertTrue(guard.needs_pruning({'percent':75,'free':8*gib}))
        self.assertEqual(guard.severity({'percent':80,'free':6*gib}), 'warning')
        self.assertEqual(guard.severity({'percent':60,'free':4*gib}), 'warning')
        self.assertEqual(guard.severity({'percent':90,'free':6*gib}), 'critical')
        self.assertEqual(guard.severity({'percent':60,'free':1*gib}), 'critical')

    def test_cleanup_preserves_current_and_two_rollback_images(self):
        img=lambda ref, id_, when: {'ref':guard.REPO+':'+ref*40, 'id':'sha256:'+id_*64, 'created':when}
        images=[img('a','1','2026-11-05T01:00:00Z'),
                img('b','2','2026-11-05T02:00:00Z'),
                img('c','3','2026-11-05T03:00:00Z'),
                img('d','4','2026-11-05T04:00:00Z'),
                img('e','5','2026-11-05T05:00:00Z')]
        remove,keep=guard.cleanup_plan(images, 'sha256:'+'3'*64)
        self.assertEqual(remove,[images[1]['ref'], images[0]['ref']])
        self.assertEqual(set(keep),{images[2]['ref'], images[3]['ref'], images[4]['ref']})

    def test_cleanup_protects_aliases_for_current_and_previous(self):
        images=[{'ref':'r:a','id':'sha256:one','created':'2026-11-05T03:00:00Z'},
                {'ref':'r:b','id':'sha256:one','created':'2026-11-05T03:00:00Z'},
                {'ref':'r:c','id':'sha256:two','created':'2026-11-05T02:00:00Z'},
                {'ref':'r:d','id':'sha256:three','created':'2026-11-05T01:00:00Z'},
                {'ref':'r:e','id':'sha256:four','created':'2026-11-04T01:00:00Z'}]
        remove, keep=guard.cleanup_plan(images, 'sha256:one')
        self.assertEqual(remove,['r:e'])
        self.assertEqual(len(keep),4)

    def test_collect_only_owned_sha_tags(self):
        valid='f'*40
        lines=[{'Repository':guard.REPO,'Tag':valid,'Digest':'<none>'},
               {'Repository':guard.REPO,'Tag':'master','Digest':'<none>'},
               {'Repository':'ghcr.io/flawden/other','Tag':valid,'Digest':'<none>'},
               {'Repository':'postgres','Tag':'17-alpine','Digest':'<none>'}]
        calls=[]
        def fake(*args):
            calls.append(args)
            if args[:3] == ('docker','image','ls'):
                return '\n'.join(json.dumps(i) for i in lines)
            return json.dumps({'Id':'sha256:abc','Created':'2026-11-05T01:00:00Z'})
        selected=guard.collect_images(fake)
        self.assertEqual(len(selected),2)
        self.assertEqual(selected[0]['ref'],guard.REPO+':'+valid)
        self.assertEqual(len(calls),3)

    def test_digest_only_images_and_master_pin(self):
        digest='sha256:'+'a'*64
        lines=[{'Repository':guard.REPO,'Tag':'<none>','Digest':digest},
               {'Repository':guard.REPO,'Tag':'master','Digest':'sha256:'+'b'*64},
               {'Repository':'ghcr.io/flawden/other','Tag':'<none>','Digest':digest}]
        def fake(*args):
            if args[:3] == ('docker','image','ls'):
                return '\n'.join(json.dumps(i) for i in lines)
            id_='sha256:master' if (args[3].endswith('master') or 'b'*64 in args[3]) else 'sha256:old'
            return json.dumps({'Id':id_,'Created':'2026-11-01T00:00:00Z'})
        images=guard.collect_images(fake)
        self.assertEqual(len(images),3)
        self.assertTrue(any(i['pinned'] for i in images))
        remove,keep=guard.cleanup_plan(images,'sha256:current', rollback_count=0)
        self.assertEqual(remove,[guard.REPO+'@'+digest])
        self.assertEqual(len(keep),2)

    def test_no_prune_until_explicit_opt_in(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            config=root/'config.json'
            config.write_text(json.dumps({'managedBy':guard.MANAGED,'autoPruneEnabled':False}))
            config.chmod(0o600)
            state=root/'state'; state.mkdir()
            usage={'percent':94,'free':1024**3,'total':32*1024**3,'used':31*1024**3}
            with patch.object(guard,'CONFIG',config), patch.object(guard,'STATE',state), \
                 patch.object(guard,'read_secure',side_effect=lambda path: json.loads(path.read_text())), \
                 patch.object(guard,'disk',return_value=usage), \
                 patch.object(guard,'collect_images',side_effect=AssertionError('Docker must not be inspected')), \
                 patch.object(guard,'telegram_send') as send, patch('sys.argv',['guard.py','--run']), \
                 patch('os.geteuid',return_value=0):
                self.assertEqual(guard.main(),0)
                send.assert_called_once()
                self.assertIn('КРИТИЧЕСКИ',send.call_args[0][0])
                self.assertEqual(json.loads((state/'state.json').read_text())['level'],'critical')

    def test_no_acknowledgement_on_alert_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            config=root/'config.json'
            config.write_text(json.dumps({'managedBy':guard.MANAGED,'autoPruneEnabled':False}))
            config.chmod(0o600)
            state=root/'state'; state.mkdir()
            usage={'percent':85,'free':4*1024**3,'total':32*1024**3,'used':28*1024**3}
            with patch.object(guard,'CONFIG',config), patch.object(guard,'STATE',state), \
                 patch.object(guard,'read_secure',side_effect=lambda path: json.loads(path.read_text())), \
                 patch.object(guard,'disk',return_value=usage), \
                 patch.object(guard,'telegram_send',side_effect=RuntimeError('simulate failure')), \
                 patch('sys.argv',['guard.py','--run']), patch('os.geteuid',return_value=0):
                with self.assertRaises(RuntimeError):
                    guard.main()
                self.assertFalse((state/'state.json').exists())

    def test_opted_in_removes_only_scoped_old_refs(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            config=root/'config.json'
            config.write_text(json.dumps({'managedBy':guard.MANAGED,'autoPruneEnabled':True}))
            config.chmod(0o600)
            state=root/'state'; state.mkdir()
            usage={'percent':77,'free':7*1024**3,'total':32*1024**3,'used':25*1024**3}
            images=[{'ref':guard.REPO+':'+'a'*40,'id':'sha256:old','created':'2026-11-01T01:00:00Z'},
                    {'ref':guard.REPO+':'+'b'*40,'id':'sha256:prior','created':'2026-11-02T01:00:00Z'},
                    {'ref':guard.REPO+':'+'c'*40,'id':'sha256:recent','created':'2026-11-03T01:00:00Z'},
                    {'ref':guard.REPO+':'+'d'*40,'id':'sha256:active','created':'2026-11-04T01:00:00Z'}]
            commands=[]
            class InspectResult:
                returncode=0
            with patch.object(guard,'CONFIG',config), patch.object(guard,'STATE',state), \
                 patch.object(guard,'read_secure',side_effect=lambda path: json.loads(path.read_text())), \
                 patch.object(guard,'disk',return_value=usage), \
                 patch.object(guard,'collect_images',return_value=images), \
                 patch.object(guard,'running_app_id',return_value='sha256:active'), \
                 patch.object(guard,'command',side_effect=lambda *v: commands.append(v)), \
                 patch.object(guard.subprocess,'run',return_value=InspectResult()), \
                 patch('sys.argv',['guard.py','--run']), patch('os.geteuid',return_value=0):
                self.assertEqual(guard.main(),0)
            self.assertEqual(commands,[('docker','image','rm',guard.REPO+':'+'a'*40)])

    def test_failure_to_identify_app_sends_warning_without_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            config=root/'config.json'
            config.write_text(json.dumps({'managedBy':guard.MANAGED,'autoPruneEnabled':True}))
            config.chmod(0o600)
            state=root/'state'; state.mkdir()
            usage={'percent':77,'free':7*1024**3,'total':32*1024**3,'used':25*1024**3}
            with patch.object(guard,'CONFIG',config), patch.object(guard,'STATE',state), \
                 patch.object(guard,'read_secure',side_effect=lambda path: json.loads(path.read_text())), \
                 patch.object(guard,'disk',return_value=usage), \
                 patch.object(guard,'collect_images',return_value=[]), \
                 patch.object(guard,'running_app_id',side_effect=RuntimeError('missing app')), \
                 patch.object(guard,'command',side_effect=AssertionError('should not delete')), \
                 patch.object(guard,'telegram_send') as send, patch('sys.argv',['guard.py','--run']), \
                 patch('os.geteuid',return_value=0):
                self.assertEqual(guard.main(),1)
                self.assertIn('Автоочистка не удалась',send.call_args[0][0])

    def test_alert_dedup_and_recovery(self):
        now=dt.datetime(2026,11,5,7,tzinfo=dt.timezone.utc)
        self.assertTrue(guard.should_notify('warning',{},now))
        state={'level':'warning','sentAt':now.isoformat()}
        self.assertFalse(guard.should_notify('warning',state,now+dt.timedelta(hours=5)))
        self.assertTrue(guard.should_notify('warning',state,now+dt.timedelta(hours=6)))
        self.assertTrue(guard.should_notify('ok',state,now+dt.timedelta(hours=1)))
        self.assertFalse(guard.should_notify('ok',{'level':'ok'},now))


if __name__=='__main__':
    unittest.main()
