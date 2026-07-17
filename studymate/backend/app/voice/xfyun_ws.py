"""讯飞开放平台 WebSocket 鉴权工具

ASR（语音听写流式版 IAT）和 TTS（在线语音合成）共用同一套鉴权协议：
- HMAC-SHA256(signature_origin, APISecret) → base64
- 把 api_key/algorithm/headers/signature 拼成 authorization_origin
- 再 base64 整体 → 作为 query 参数挂到 wss URL

参考：https://www.xfyun.cn/doc/asr/voicedictation/API.html
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timezone
from email.utils import format_datetime
from urllib.parse import urlencode, urlparse


def build_xfyun_ws_url(url: str, api_key: str, api_secret: str) -> str:
    """给讯飞 WS URL 拼上鉴权参数。

    Args:
        url: 形如 'wss://iat-api.xfyun.cn/v2/iat' 或 'wss://tts-api.xfyun.cn/v2/tts'
        api_key: 讯飞应用 APIKey
        api_secret: 讯飞应用 APISecret

    Returns:
        带 authorization/date/host 三个 query 参数的完整 wss URL，5 分钟内有效
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path = parsed.path or "/"

    now = datetime.now(timezone.utc)
    date_str = format_datetime(now, usegmt=True)

    signature_origin = (
        f"host: {host}\n"
        f"date: {date_str}\n"
        f"GET {path} HTTP/1.1"
    )
    signature_sha = hmac.new(
        api_secret.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    signature = base64.b64encode(signature_sha).decode("utf-8")

    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")

    query = urlencode({
        "authorization": authorization,
        "date": date_str,
        "host": host,
    })
    return f"{url}?{query}"
