"""Check that manual/stale/failed invocations cannot establish timer evidence."""
from pathlib import Path
import unittest

source = (Path(__file__).parents[1] / 'scripts/CHECK_COMIC_DIARY_RELEASE_STATUS.sh').read_text()
namespace = {'__name__': 'release_status_test'}
exec(compile(source.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0], 'release_status', 'exec'), namespace)
evaluate = namespace['schedule_evidence']


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.timer = dict(LoadState='loaded', ActiveState='active', LastTriggerUSecMonotonic=100_000_000)
        self.service = dict(ExecMainStartTimestampMonotonic=101_000_000,
                            ExecMainExitTimestampMonotonic=110_000_000, Result='success', ExecMainStatus=0)

    def test_matched_completed_run(self):
        self.assertTrue(evaluate(self.timer, self.service, 200_000_000)[0])

    def test_manual_run_without_trigger(self):
        self.timer['LastTriggerUSecMonotonic'] = 0
        self.assertFalse(evaluate(self.timer, self.service, 200_000_000)[0])

    def test_later_manual_run_is_not_timer_proof(self):
        self.service['ExecMainStartTimestampMonotonic'] = 300_000_000
        self.service['ExecMainExitTimestampMonotonic'] = 310_000_000
        self.assertFalse(evaluate(self.timer, self.service, 400_000_000)[0])

    def test_inactive_stale_failed_or_running(self):
        for field, value in [('ActiveState', 'inactive'), ('LastTriggerUSecMonotonic', -1)]:
            timer = dict(self.timer, **{field: value})
            self.assertFalse(evaluate(timer, self.service, 200_000_000)[0])
        self.assertFalse(evaluate(self.timer, self.service, 37 * 3600 * 1_000_000)[0])
        for field, value in [('Result', 'exit-code'), ('ExecMainStatus', 1),
                             ('ExecMainExitTimestampMonotonic', 0), ('ExecMainStatus', 'bad')]:
            self.assertFalse(evaluate(self.timer, dict(self.service, **{field: value}), 200_000_000)[0])

    def test_future_or_prior_boot_values(self):
        self.assertFalse(evaluate(self.timer, self.service, 90_000_000)[0])
        self.service['ExecMainStartTimestampMonotonic'] = 99_000_000
        self.assertFalse(evaluate(self.timer, self.service, 200_000_000)[0])
