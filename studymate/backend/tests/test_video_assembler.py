from __future__ import annotations

import unittest

from app.video.assembler import _build_srt, _srt_timestamp


class VideoAssemblerTests(unittest.TestCase):
    def test_srt_timestamps_and_voiceovers_follow_segment_durations(self):
        subtitles = _build_srt([
            {"duration": 4, "voiceover": "先确认输入条件。"},
            {"duration": 6, "voiceover": "再执行核心操作并检查结果。"},
        ])
        self.assertIn("00:00:00,000 --> 00:00:04,000", subtitles)
        self.assertIn("00:00:04,000 --> 00:00:10,000", subtitles)
        self.assertIn("先确认输入条件。", subtitles)
        self.assertIn("再执行核心操作并检查结果。", subtitles)

    def test_srt_timestamp_rounds_to_milliseconds(self):
        self.assertEqual(_srt_timestamp(1.2345), "00:00:01,234")
