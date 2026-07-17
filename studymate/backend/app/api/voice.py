"""讯飞语音 API

- POST /api/voice/asr-url：返回前端直连 ASR 用的带签名 ws_url（5 分钟有效）+ app_id
- POST /api/voice/tts：后端代理 TTS，调讯飞 WS 拼 mp3 二进制返回
- GET  /api/voice/voices：列可用发音人（前端 VoiceSelector 用）

ASR 走前端直连：浏览器拿到 ws_url 后用 WebSocket + AudioWorklet 录音直连讯飞 IAT
端点，避免后端中转音频流（延迟更低 + 后端无状态）。APISecret 始终留在后端。

TTS 走后端代理：浏览器收 mp3 二进制后用 <audio> 播放即可，避免前端实现 WS 协议。
"""
from __future__ import annotations

import asyncio
import base64
import json
import random
import uuid

import websockets
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.voice.xfyun_ws import build_xfyun_ws_url

router = APIRouter(prefix="/voice", tags=["voice"])

ASR_URL = "wss://iat-api.xfyun.cn/v2/iat"
TTS_URL = "wss://tts-api.xfyun.cn/v2/tts"
DASHSCOPE_WS = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"

# ===== 在线语音合成（默认）发音人，前端 store/voice.ts 同步这份清单 =====
VOICES = [
    {"id": "xiaoyan", "label": "晓燕", "tone": "亲和女声", "gender": "female"},
    {"id": "aisjiuxu", "label": "九旭", "tone": "沉稳男声", "gender": "male"},
    {"id": "aisxping", "label": "小萍", "tone": "活力女声", "gender": "female"},
    {"id": "aisjinger", "label": "婧儿", "tone": "成熟女声", "gender": "female"},
]
VALID_VOICES = {v["id"] for v in VOICES}
DEFAULT_VOICE = "xiaoyan"

# ===== 超拟人语音合成发音人（音质更高，需控制台授权；vcn 名按实际授权调整）=====
ORAL_VOICES = [
    {"id": "x4_lingxiaoxuan_oral", "label": "聆小璇", "tone": "亲和女声", "gender": "female"},
    {"id": "x4_lingfeihao_oral", "label": "聆飞皓", "tone": "沉稳男声", "gender": "male"},
    {"id": "x4_lingxiaoqi_oral", "label": "聆小琪", "tone": "活力女声", "gender": "female"},
]


def _oral_enabled() -> bool:
    """是否启用超拟人合成：模式为 oral 且填了服务地址。"""
    return settings.XFYUN_TTS_MODE.strip().lower() == "oral" and bool(settings.XFYUN_ORAL_TTS_URL.strip())


# ===== 阿里 CosyVoice 发音人（音色更自然，复用 DashScope key）=====
COSYVOICE_VOICES = [
    {"id": "longxiaochun", "label": "龙小淳", "tone": "亲和女声", "gender": "female"},
    {"id": "longxiaoxia", "label": "龙小夏", "tone": "温柔女声", "gender": "female"},
    {"id": "longwan", "label": "龙婉", "tone": "知性女声", "gender": "female"},
    {"id": "longcheng", "label": "龙橙", "tone": "沉稳男声", "gender": "male"},
    {"id": "longhua", "label": "龙华", "tone": "标准男声", "gender": "male"},
]
COSYVOICE_VALID = {v["id"] for v in COSYVOICE_VOICES}


def _cosyvoice_enabled() -> bool:
    """是否启用 CosyVoice：总引擎为 cosyvoice 且有 DashScope(QWEN) key。"""
    return settings.TTS_ENGINE.strip().lower() == "cosyvoice" and bool(settings.QWEN_API_KEY.strip())


def _xfyun_creds() -> tuple[str, str, str]:
    app_id = settings.XFYUN_APP_ID.strip()
    api_key = settings.XFYUN_API_KEY.strip()
    api_secret = settings.XFYUN_API_SECRET.strip()
    if not (app_id and api_key and api_secret):
        raise HTTPException(
            status_code=503,
            detail="讯飞语音未配置：在 .env 设 XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET",
        )
    return app_id, api_key, api_secret


# ===== 发音人列表 =====


@router.get("/voices")
async def list_voices():
    if _cosyvoice_enabled():
        return {"voices": COSYVOICE_VOICES, "default": settings.COSYVOICE_VOICE, "mode": "cosyvoice"}
    if _oral_enabled():
        return {"voices": ORAL_VOICES, "default": settings.XFYUN_ORAL_VOICE, "mode": "oral"}
    return {"voices": VOICES, "default": DEFAULT_VOICE, "mode": "online"}


# ===== ASR：返回带签名 ws_url 给前端直连 =====


class AsrUrlResponse(BaseModel):
    ws_url: str
    app_id: str


@router.post("/asr-url", response_model=AsrUrlResponse)
async def asr_url():
    app_id, api_key, api_secret = _xfyun_creds()
    return AsrUrlResponse(
        ws_url=build_xfyun_ws_url(ASR_URL, api_key, api_secret),
        app_id=app_id,
    )


# ===== TTS：后端代理 =====


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    voice: str = Field(default=DEFAULT_VOICE)
    speed: int = Field(default=50, ge=0, le=100)
    volume: int = Field(default=50, ge=0, le=100)
    pitch: int = Field(default=50, ge=0, le=100)


@router.post("/tts")
async def tts(req: TtsRequest):
    """TTS 入口：按引擎分发（CosyVoice / 讯飞超拟人 / 讯飞在线）。
    前端无感知——始终 POST /api/voice/tts 拿 mp3，切换只动后端配置。"""
    if _cosyvoice_enabled():
        audio = await _tts_cosyvoice(req)
    elif _oral_enabled():
        audio = await _tts_oral(req)
    else:
        audio = await _tts_online(req)
    if not audio:
        raise HTTPException(status_code=502, detail="TTS 返回空音频")
    return Response(content=audio, media_type="audio/mpeg")


class _RateLimited(Exception):
    """DashScope 返回频率限制（QPS 超限）→ 可退避后换 key 重试。"""


def _is_rate_limit(msg: str) -> bool:
    m = (msg or "").lower()
    return "rate limit" in m or "throttl" in m or "qps" in m or "flow control" in m


def _dashscope_keys() -> list[str]:
    """CosyVoice 用的 DashScope key 池：优先 COSYVOICE_API_KEYS（逗号分隔），否则回退 QWEN_API_KEY。"""
    raw = settings.COSYVOICE_API_KEYS.strip() or settings.QWEN_API_KEY.strip()
    return [k.strip() for k in raw.split(",") if k.strip()]


async def _tts_cosyvoice(req: TtsRequest) -> bytes:
    """阿里 CosyVoice（DashScope WebSocket 流式合成）。

    频率限制(QPS)是按账号(key)算的：遇到 rate limit 时退避并轮换到下一个 key 重试，
    既能扛单账号的瞬时并发(退避重试)，又能在配了多 key 时把负载摊到多个账号(聚合 QPS 翻倍)。
    启用：.env 设 TTS_ENGINE=cosyvoice（需在 DashScope 控制台开通语音合成）。
    """
    keys = _dashscope_keys()
    if not keys:
        raise HTTPException(status_code=503, detail="未配置 DashScope key（COSYVOICE_API_KEYS 或 QWEN_API_KEY）")
    voice = req.voice if req.voice in COSYVOICE_VALID else settings.COSYVOICE_VOICE

    # 起始 key 随机错开 → 多请求并发时天然分散到不同账号，而非都砸第一个
    start = random.randrange(len(keys))
    attempts = max(4, len(keys) + 1)  # 至少 4 次；key 多时保证每个都试过
    last_err = "rate limit"
    for i in range(attempts):
        api_key = keys[(start + i) % len(keys)]
        try:
            return await _cosyvoice_once(req, api_key, voice)
        except _RateLimited as e:
            last_err = str(e)
            # 指数退避 + 抖动；多 key 时下一轮已换号，等待可更短
            await asyncio.sleep(min(2.0, 0.35 * (2**i)) + random.random() * 0.25)
    raise HTTPException(status_code=502, detail=f"CosyVoice 限流重试仍失败：{last_err}")


async def _cosyvoice_once(req: TtsRequest, api_key: str, voice: str) -> bytes:
    """用单个 key 跑一次完整合成；遇 QPS 限流抛 _RateLimited 交由上层退避换号重试。"""
    task_id = uuid.uuid4().hex
    headers = {"Authorization": f"bearer {api_key}", "X-DashScope-DataInspection": "enable"}

    run_task = {
        "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {
            "task_group": "audio",
            "task": "tts",
            "function": "SpeechSynthesizer",
            "model": settings.COSYVOICE_MODEL,
            "parameters": {"text_type": "PlainText", "voice": voice, "format": "mp3", "sample_rate": 22050},
            "input": {},
        },
    }
    continue_task = {
        "header": {"action": "continue-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {"input": {"text": req.text}},
    }
    finish_task = {
        "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {"input": {}},
    }

    audio = bytearray()
    try:
        async with websockets.connect(DASHSCOPE_WS, additional_headers=headers, max_size=20 * 1024 * 1024, proxy=None) as ws:
            await ws.send(json.dumps(run_task))
            # 等 task-started 再送文本
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                if isinstance(msg, (bytes, bytearray)):
                    audio.extend(msg)
                    continue
                ev = json.loads(msg)
                name = (ev.get("header") or {}).get("event")
                if name == "task-started":
                    break
                if name == "task-failed":
                    msg = (ev.get("header") or {}).get("error_message") or ""
                    if _is_rate_limit(msg):
                        raise _RateLimited(msg)
                    raise HTTPException(status_code=502, detail=f"CosyVoice 启动失败：{msg}")
            await ws.send(json.dumps(continue_task))
            await ws.send(json.dumps(finish_task))
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                if isinstance(msg, (bytes, bytearray)):
                    audio.extend(msg)
                    continue
                ev = json.loads(msg)
                name = (ev.get("header") or {}).get("event")
                if name == "task-finished":
                    break
                if name == "task-failed":
                    msg = (ev.get("header") or {}).get("error_message") or ""
                    if _is_rate_limit(msg):
                        raise _RateLimited(msg)
                    raise HTTPException(status_code=502, detail=f"CosyVoice 合成失败：{msg}")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="CosyVoice 响应超时")
    except websockets.exceptions.WebSocketException as e:
        raise HTTPException(status_code=502, detail=f"CosyVoice WS 错误：{e}")

    return bytes(audio)


async def _tts_online(req: TtsRequest) -> bytes:
    """在线语音合成 v2/tts（默认）。"""
    app_id, api_key, api_secret = _xfyun_creds()
    voice = req.voice if req.voice in VALID_VOICES else DEFAULT_VOICE
    ws_url = build_xfyun_ws_url(TTS_URL, api_key, api_secret)

    frame = {
        "common": {"app_id": app_id},
        "business": {
            "aue": "lame",  # mp3
            "sfl": 1,
            "vcn": voice,
            "speed": req.speed,
            "volume": req.volume,
            "pitch": req.pitch,
            "tte": "UTF8",
        },
        "data": {
            "status": 2,
            "text": base64.b64encode(req.text.encode("utf-8")).decode("utf-8"),
        },
    }

    audio_chunks: list[bytes] = []
    try:
        async with websockets.connect(ws_url, max_size=20 * 1024 * 1024, proxy=None) as ws:
            await ws.send(json.dumps(frame))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
                resp = json.loads(raw)
                code = resp.get("code")
                if code != 0:
                    raise HTTPException(
                        status_code=502,
                        detail=f"讯飞 TTS 错误 code={code} msg={resp.get('message')}",
                    )
                data = resp.get("data") or {}
                audio_b64 = data.get("audio")
                if audio_b64:
                    audio_chunks.append(base64.b64decode(audio_b64))
                if data.get("status") == 2:
                    break
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="讯飞 TTS 响应超时")
    except websockets.exceptions.WebSocketException as e:
        raise HTTPException(status_code=502, detail=f"讯飞 TTS WS 错误：{e}")

    return b"".join(audio_chunks)


async def _tts_oral(req: TtsRequest) -> bytes:
    """超拟人语音合成（v1 oral 协议，header/parameter/payload 三段式）。

    预埋骨架：默认不启用（XFYUN_TTS_MODE=online）。买好超拟人后在 .env 设：
        XFYUN_TTS_MODE=oral
        XFYUN_ORAL_TTS_URL=wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/xxxxxxxx
        XFYUN_ORAL_VOICE=x4_lingxiaoxuan_oral
    鉴权与 v2 同（HMAC host/date/request-line），复用 build_xfyun_ws_url。
    注意：vcn / sample_rate / 字段名以讯飞控制台「超拟人合成」文档为准，授权不同可能要微调。
    """
    app_id, api_key, api_secret = _xfyun_creds()
    voice = req.voice if req.voice.endswith("_oral") else settings.XFYUN_ORAL_VOICE
    ws_url = build_xfyun_ws_url(settings.XFYUN_ORAL_TTS_URL.strip(), api_key, api_secret)

    frame = {
        "header": {"app_id": app_id, "status": 2},
        "parameter": {
            "tts": {
                "vcn": voice,
                "speed": req.speed,
                "volume": req.volume,
                "pitch": req.pitch,
                "audio": {
                    "encoding": "lame",  # mp3
                    "sample_rate": 24000,
                    "channels": 1,
                    "bit_depth": 16,
                },
            }
        },
        "payload": {
            "text": {
                "encoding": "utf8",
                "compress": "raw",
                "format": "plain",
                "status": 2,
                "seq": 0,
                "text": base64.b64encode(req.text.encode("utf-8")).decode("utf-8"),
            }
        },
    }

    audio_chunks: list[bytes] = []
    try:
        async with websockets.connect(ws_url, max_size=20 * 1024 * 1024, proxy=None) as ws:
            await ws.send(json.dumps(frame))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
                resp = json.loads(raw)
                header = resp.get("header") or {}
                code = header.get("code")
                if code not in (0, None):
                    raise HTTPException(
                        status_code=502,
                        detail=f"讯飞超拟人 TTS 错误 code={code} msg={header.get('message')}",
                    )
                payload = resp.get("payload") or {}
                audio_obj = payload.get("audio") or {}
                audio_b64 = audio_obj.get("audio")
                if audio_b64:
                    audio_chunks.append(base64.b64decode(audio_b64))
                # 结束标志：audio.status 或 header.status 为 2
                if audio_obj.get("status") == 2 or header.get("status") == 2:
                    break
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="讯飞超拟人 TTS 响应超时")
    except websockets.exceptions.WebSocketException as e:
        raise HTTPException(status_code=502, detail=f"讯飞超拟人 TTS WS 错误：{e}")

    return b"".join(audio_chunks)
