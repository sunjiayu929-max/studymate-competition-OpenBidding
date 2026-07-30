from __future__ import annotations

import asyncio
import unittest
from collections import defaultdict
from unittest.mock import AsyncMock, patch

from app.api import voice
from app.api.voice import TtsRequest, tts
from app.voice.speech_text import prepare_tts_text


class VoiceSpeechTextTests(unittest.TestCase):
    def test_math_markdown_is_converted_to_speakable_text(self):
        spoken = prepare_tts_text(
            "更新公式：$\\theta \\leftarrow \\theta - \\eta \\cdot "
            "\\nabla_\\theta J(\\theta)$；其中 **η** 是学习率。"
        )

        self.assertIn("西塔 更新为 西塔", spoken)
        self.assertIn("伊塔 乘以 J 关于西塔的梯度", spoken)
        self.assertNotIn("\\", spoken)
        self.assertNotIn("$", spoken)
        self.assertNotIn("*", spoken)

    def test_unicode_math_is_converted_to_speakable_text(self):
        spoken = prepare_tts_text("θ ← θ − η · ∇θJ(θ)，并检查 x² ≤ 1。")

        self.assertIn("西塔 更新为 西塔 减去 伊塔 乘以 J 关于西塔的梯度", spoken)
        self.assertIn("x 的平方 小于等于 1", spoken)
        self.assertIn("小于等于", spoken)


class VoiceTtsRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_tts_engine_receives_normalized_math_text(self):
        synthesize = AsyncMock(return_value=b"fixture-mp3")
        with (
            patch("app.api.voice.safe_offline_enabled", return_value=False),
            patch("app.api.voice._cosyvoice_enabled", return_value=True),
            patch("app.api.voice._tts_cosyvoice", synthesize),
        ):
            response = await tts(TtsRequest(text="θ ← θ − η · ∇θJ(θ)"))

        request = synthesize.await_args.args[0]
        self.assertIn(
            "西塔 更新为 西塔 减去 伊塔 乘以 J 关于西塔的梯度",
            request.text,
        )
        self.assertEqual(response.body, b"fixture-mp3")
        self.assertEqual(response.media_type, "audio/mpeg")


class CosyVoiceDispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        voice._cosyvoice_dispatchers.clear()

    async def asyncTearDown(self):
        voice._cosyvoice_dispatchers.clear()

    async def test_each_key_is_single_concurrency_while_keys_run_in_parallel(self):
        active_by_key: dict[str, int] = defaultdict(int)
        max_by_key: dict[str, int] = defaultdict(int)
        active_total = 0
        max_total = 0

        async def fake_once(_req, api_key, _voice):
            nonlocal active_total, max_total
            active_by_key[api_key] += 1
            active_total += 1
            max_by_key[api_key] = max(max_by_key[api_key], active_by_key[api_key])
            max_total = max(max_total, active_total)
            await asyncio.sleep(0.02)
            active_by_key[api_key] -= 1
            active_total -= 1
            return f"audio-{api_key}".encode()

        with (
            patch("app.api.voice._dashscope_keys", return_value=["fixture-a", "fixture-b"]),
            patch("app.api.voice._cosyvoice_once", side_effect=fake_once),
        ):
            results = await asyncio.gather(*(
                voice._tts_cosyvoice(TtsRequest(text=f"第 {index} 句"))
                for index in range(6)
            ))

        self.assertEqual(len(results), 6)
        self.assertEqual(dict(max_by_key), {"fixture-a": 1, "fixture-b": 1})
        self.assertEqual(max_total, 2)

    async def test_rate_limit_rotates_to_another_key_before_reusing_one(self):
        calls: list[str] = []

        async def fake_once(_req, api_key, _voice):
            calls.append(api_key)
            if len(calls) == 1:
                raise voice._RateLimited("fixture qps")
            return b"fixture-audio"

        with (
            patch("app.api.voice._dashscope_keys", return_value=["fixture-a", "fixture-b"]),
            patch("app.api.voice._cosyvoice_once", side_effect=fake_once),
        ):
            result = await voice._tts_cosyvoice(TtsRequest(text="限流换 key"))

        self.assertEqual(result, b"fixture-audio")
        self.assertEqual(len(calls), 2)
        self.assertNotEqual(calls[0], calls[1])


if __name__ == "__main__":
    unittest.main()
