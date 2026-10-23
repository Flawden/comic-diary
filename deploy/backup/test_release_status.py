"""Check that manual/stale/failed invocations cannot establish timer evidence."""
from pathlib import Path
import unittest

source = (Path(__file__).parents[1] / 'scripts/CHECK_COMIC_DIARY_RELEASE_STATUS.sh').read_text()
namespace = {'__name__': 'release_status_test'}
exec(compile(source.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0], 'release_status', 'exec'), namespace)
evaluate = namespace['schedule_evidence']
parse = namespace['monotonic_microseconds']


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

    def test_actual_ubuntu_22_systemctl_values(self):
        self.timer['LastTriggerUSecMonotonic'] = '1d 20h 58min 26.960273s'
        self.service.update(ExecMainStartTimestampMonotonic='161906962014',
                            ExecMainExitTimestampMonotonic='161908035410')
        self.assertEqual(parse(self.timer['LastTriggerUSecMonotonic']), 161906960273)
        self.assertTrue(evaluate(self.timer, self.service, 200_000_000_000)[0])

    def test_span_units_and_microsecond_precision(self):
        self.assertEqual(parse('1w 2d 3h 4min 5s 6ms 7us'),
                         (9 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000000 + 6007)
        self.assertEqual(parse('1.000001s'), 1000001)
        self.assertEqual(parse('7µs'), 7)
        self.assertEqual(parse('0'), 0)

    def test_unavailable_malformed_or_out_of_order_spans_are_rejected(self):
        for value in ['', 'n/a', 'infinity', '-1s', '1s junk', '1s 1min', '1s 2s', '0.0000001s']:
            with self.assertRaises(ValueError):
                parse(value)
        self.timer['LastTriggerUSecMonotonic'] = 'n/a'
        self.assertEqual(evaluate(self.timer, self.service, 200_000_000)[1], 'INVALID_TIMESTAMPS')
