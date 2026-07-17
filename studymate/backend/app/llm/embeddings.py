"""文本向量化（embedding）适配层。

用于混合检索的语义召回分支。设计要点：
- 走 OpenAI 兼容的 embedding 端点（默认通义千问 DashScope `text-embedding-v3`，1024 维）；
- **必须 `encoding_format="float"`**：openai SDK 默认用 base64 + numpy 解码，而本机
  MINGW-W64 numpy 会 segfault（见 rag/engine.py 注释）。float 直接返回 list，绕开 numpy；
- `trust_env=False`：绕过 Clash 把 `ALL_PROXY=socks5://...` 注入导致的 httpx SOCKS 报错
  （与 piston / gen_chunks 同源坑）。
- 没配 key 时 has_embedding_key() 返回 False，调用方应优雅退化为纯 BM25。
"""
from __future__ import annotations

import httpx
from openai import AsyncOpenAI

from app.core.config import settings

_emb_client: AsyncOpenAI | None = None


def _provider_conf() -> tuple[str, str]:
    """(api_key, base_url) for the embedding provider."""
    p = (settings.EMBEDDING_PROVIDER or "qwen").lower()
    if p == "deepseek":
        return settings.DEEPSEEK_API_KEY, settings.DEEPSEEK_BASE_URL
    # 默认 qwen（DashScope 兼容模式有 text-embedding-v3）
    return settings.QWEN_API_KEY, settings.QWEN_BASE_URL


def has_embedding_key() -> bool:
    key, _ = _provider_conf()
    return bool(key)


def _client() -> AsyncOpenAI:
    global _emb_client
    if _emb_client is None:
        key, base = _provider_conf()
        _emb_client = AsyncOpenAI(
            api_key=key,
            base_url=base,
            timeout=30.0,
            max_retries=2,
            http_client=httpx.AsyncClient(trust_env=False, timeout=30.0),
        )
    return _emb_client


async def embed_texts(texts: list[str], batch_size: int = 10) -> list[list[float]]:
    """批量向量化。DashScope text-embedding-v3 单请求上限 10 条，故默认分批 10。"""
    if not texts:
        return []
    cli = _client()
    model = settings.EMBEDDING_MODEL
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        resp = await cli.embeddings.create(
            model=model, input=batch, encoding_format="float"
        )
        # data 顺序与 input 对齐，但保险起见按 index 排
        rows = sorted(resp.data, key=lambda d: d.index)
        out.extend([list(d.embedding) for d in rows])
    return out


async def embed_query(text: str) -> list[float]:
    r = await embed_texts([text])
    return r[0] if r else []
