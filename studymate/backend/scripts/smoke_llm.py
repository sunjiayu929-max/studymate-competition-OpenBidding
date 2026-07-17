"""快速冒烟：用当前 .env 的 LLM_PROVIDER 跑一句流式问答，确认 key/endpoint/model 都通。

用法（在 ``studymate/backend`` 目录）：
    source .venv/bin/activate
    python scripts/smoke_llm.py

Windows PowerShell 可使用 ``.venv\\Scripts\\python.exe scripts\\smoke_llm.py``。
"""
from __future__ import annotations

import asyncio
import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.llm.client import get_llm_client


async def main() -> None:
    client = get_llm_client()
    print(f"[provider] {client.provider}  [model] {client.model}")
    print(f"[base_url] {client._client.base_url}")
    print("-" * 60)
    messages = [
        {"role": "system", "content": "你是一个机器学习助教，用一句话回答。"},
        {"role": "user", "content": "什么是梯度下降？"},
    ]
    print("[stream]", end=" ", flush=True)
    got_any = False
    async for token in client.chat_stream(messages, temperature=0.3):
        print(token, end="", flush=True)
        got_any = True
    print()
    print("-" * 60)
    if got_any:
        print("[OK] 流式输出正常")
    else:
        print("[FAIL] 没有收到任何 token，检查 key/endpoint/model")


if __name__ == "__main__":
    asyncio.run(main())
