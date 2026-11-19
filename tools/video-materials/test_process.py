import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from audit import quiet_intervals
from process import (COUNTER_RECT, FILES, GAIN_DB, RAMP_SAMPLES, audio_filter,
                     validate_input, video_filter)


class MaterialPlanTests(unittest.TestCase):
    def test_all_four_clips_have_explicit_video_plans(self):
        self.assertEqual(len(FILES), 4)
        for i in range(4):
            self.assertIn("[v]", video_filter(i))
            self.assertIn("setsar=320/321", video_filter(i))
        for i in [-1, 4]:
            with self.assertRaises(ValueError):
                video_filter(i)

    def test_body_subtitles_are_outside_counter_rect(self):
        x, y, w, h = COUNTER_RECT
        self.assertLessEqual(y+h, 404)
        self.assertLessEqual(x, 108)
        self.assertGreaterEqual(x+w, 204)
        for i in [1, 2]:
            self.assertIn("delogo", video_filter(i))
            self.assertNotIn("fade=", video_filter(i))

    def test_opening_uses_source_without_added_title(self):
        filters = video_filter(0)
        self.assertEqual(filters,
                         "[0:v]delogo=x=100:y=324:w=112:h=80:enable='gte(t,42.04)',"
                         "fade=t=in:st=0:d=0.24,setsar=320/321[v]")
        for forbidden in ("[1:v]", "overlay", "drawtext", "trim=", "setpts="):
            self.assertNotIn(forbidden, filters)

    def test_outro_keeps_attribution_and_uses_only_tail_fade(self):
        self.assertNotIn("delogo", video_filter(3))
        self.assertIn("st=76.36:d=0.36", video_filter(3))

    def test_audio_has_no_speed_or_length_change(self):
        self.assertEqual(GAIN_DB, -2)
        self.assertEqual(RAMP_SAMPLES, 221)
        for samples in [1864548, 3252816, 3432744, 3385689]:
            filters = audio_filter(samples)
            self.assertIn(f"end_sample={samples}", filters)
            self.assertIn(f"ss={samples-221}:ns=221", filters)
            self.assertNotIn("silenceremove", filters)
            self.assertNotIn("atempo", filters)
        for samples in [0, 1, 442]:
            with self.assertRaises(ValueError):
                audio_filter(samples)

    def test_quiet_check_does_not_cancel_out_of_phase_stereo(self):
        samples = np.tile([.2, -.2], (4410, 1)).astype(np.float32)
        self.assertEqual(quiet_intervals(samples, -40), [])
        self.assertEqual(quiet_intervals(samples*0, -40), [[0, .1]])

    def test_body_counter_repair_is_unchanged(self):
        expected = "[0:v]delogo=x=100:y=324:w=112:h=80,setsar=320/321[v]"
        self.assertEqual(video_filter(1), expected)
        self.assertEqual(video_filter(2), expected)

    def test_unreviewed_source_is_rejected(self):
        manifest = {"program": {"sequence": [
            {"file": f, "repeat": 48 if i == 1 else 1} for i, f in enumerate(FILES)
        ]}}
        import json
        with patch.object(Path, "read_text", return_value=json.dumps(manifest)), \
                patch("process.sha256", return_value="not-the-reviewed-hash"):
            with self.assertRaisesRegex(ValueError, "Unreviewed input"):
                validate_input(Path("/unused"))


if __name__ == "__main__":
    unittest.main()
