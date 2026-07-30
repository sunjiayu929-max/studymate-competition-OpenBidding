"""
统一的 LLM 适配层。
所有 Agent / API 都通过 get_llm_client() 拿到客户端，不直接调 openai SDK。
后续切换 provider（DeepSeek → 讯飞星火）只改这一个文件。
"""
from __future__ import annotations

from typing import AsyncIterator, Iterable
from openai import AsyncOpenAI

from app.core.config import require_external_access, safe_offline_enabled, settings


class LLMClient:
    def __init__(self, api_key: str, base_url: str, model: str, provider: str):
        self.provider = provider
        self.model = model
        # 显式 timeout：connect 10s / read 180s（流式生成中段可能长停顿），retry 2 次
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=180.0,
            max_retries=2,
        )

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        **kwargs,
    ) -> AsyncIterator[str]:
        """流式输出，逐 token yield 文本。"""
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            stream=True,
            **kwargs,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        **kwargs,
    ) -> str:
        """非流式，一次返回完整文本。"""
        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            **kwargs,
        )
        return resp.choices[0].message.content or ""

    async def chat_structured(
        self,
        messages: list[dict],
        temperature: float = 0.3,
        **kwargs,
    ) -> str:
        """强制 JSON 输出（依赖模型支持 response_format）。"""
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"},
                **kwargs,
            )
            return resp.choices[0].message.content or "{}"
        except Exception:
            # 模型不支持 json_object 时，退化为普通 chat，提示词里自行约束 JSON
            return await self.chat(messages, temperature=temperature, **kwargs)


_clients: dict[str, LLMClient] = {}


def _provider_conf(provider: str) -> tuple[str, str, str]:
    """(api_key, base_url, model) for given provider."""
    p = provider.lower()
    if p == "spark":
        return settings.SPARK_API_KEY, settings.SPARK_BASE_URL, settings.SPARK_MODEL
    if p == "mimo":
        return settings.MIMO_API_KEY, settings.MIMO_BASE_URL, settings.MIMO_MODEL
    if p == "deepseek":
        return settings.DEEPSEEK_API_KEY, settings.DEEPSEEK_BASE_URL, settings.DEEPSEEK_MODEL
    if p == "qwen":
        return settings.QWEN_API_KEY, settings.QWEN_BASE_URL, settings.QWEN_MODEL
    if p == "qwen-vl":
        # 视觉版：复用 qwen 的 key/base_url，只换模型
        return settings.QWEN_API_KEY, settings.QWEN_BASE_URL, settings.QWEN_VL_MODEL
    raise ValueError(f"unknown LLM provider: {provider}")


def has_llm_key(provider: str | None = None) -> bool:
    """指定 provider 是否配了 key（默认看 LLM_PROVIDER）。"""
    if safe_offline_enabled():
        return False
    p = (provider or settings.LLM_PROVIDER).lower()
    try:
        key, _, _ = _provider_conf(p)
        return bool(key)
    except ValueError:
        return False


def get_llm_client(provider: str | None = None) -> LLMClient:
    """拿 LLM 客户端。显式指定 provider 可以强制走某家（例如 /tutor 强制讯飞）。

    每个 provider 一个单例。
    """
    require_external_access("LLM")
    p = (provider or settings.LLM_PROVIDER).lower()
    if p in _clients:
        return _clients[p]
    api_key, base_url, model = _provider_conf(p)
    _clients[p] = LLMClient(api_key=api_key, base_url=base_url, model=model, provider=p)
    return _clients[p]
