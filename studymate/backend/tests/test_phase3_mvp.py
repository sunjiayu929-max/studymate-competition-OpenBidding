import unittest
from unittest.mock import patch

from app.api.voice import voice_status


class Phase3VoiceStatusTests(unittest.IsolatedAsyncioTestCase):
    async def test_voice_status_never_contacts_external_service(self):
        with (
            patch("app.api.voice.settings.XFYUN_APP_ID", ""),
            patch("app.api.voice.settings.XFYUN_API_KEY", ""),
            patch("app.api.voice.settings.XFYUN_API_SECRET", ""),
            patch("app.api.voice.settings.QWEN_API_KEY", ""),
            patch("app.api.voice.settings.COSYVOICE_API_KEYS", ""),
            patch("app.api.voice.settings.TTS_ENGINE", "cosyvoice"),
        ):
            result = await voice_status()

        self.assertFalse(result["asr_configured"])
        self.assertFalse(result["tts_configured"])
        self.assertEqual(result["permission_policy"], "user_gesture_only")


if __name__ == "__main__":
    unittest.main()
