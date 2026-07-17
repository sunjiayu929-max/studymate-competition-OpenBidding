"""在线代码运行（C / C++17 / Python）

后端薄薄一层，把请求转发到内网的 Piston 沙箱容器（piston-api:2000）。
- 全程不出公网：piston 在 docker network 内
- 沙箱由 piston 用 isolate 提供，内存/CPU/PID/时间硬隔离
- 这里再做一层：源码长度、stdin 长度、墙钟超时

POST /api/run
{
    "language": "python" | "c" | "cpp",
    "source":   "<code>",
    "stdin":    "可选" ,
    "args":     ["可选", "命令行参数"]
}
→
{
    "stdout":     "",
    "stderr":     "",
    "exit_code":  0,
    "signal":     null,
    "language":   "python",
    "version":    "3.10.0",
    "compile":    {"stdout": "", "stderr": "", "code": 0} | null,
    "duration_ms": 123,
    "mock":       false
}
"""
from __future__ import annotations

import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/run", tags=["run"])

# 前端语言别名 → Piston 官方 language 名 + 版本 + 默认编译参数
# 加新语言时改这里一处，前端 CodeRunner 会跟着拉
LANGS = {
    "python": {
        "language": "python",
        "version": "3.10.0",
        "filename": "main.py",
        "compile_args": [],
    },
    "c": {
        "language": "c",
        "version": "10.2.0",
        "filename": "main.c",
        "compile_args": ["-std=c11", "-O2"],
    },
    "cpp": {
        "language": "c++",
        "version": "10.2.0",
        "filename": "main.cpp",
        "compile_args": ["-std=c++17", "-O2"],
    },
}

MAX_SOURCE_LEN = 50_000     # 50 KB
MAX_STDIN_LEN = 10_000      # 10 KB


class RunRequest(BaseModel):
    language: str = Field(..., description="python / c / cpp")
    source: str = Field(..., min_length=1, max_length=MAX_SOURCE_LEN)
    stdin: str = Field(default="", max_length=MAX_STDIN_LEN)
    args: list[str] = Field(default_factory=list, max_length=16)


class RunStage(BaseModel):
    stdout: str = ""
    stderr: str = ""
    code: int = 0
    signal: Optional[str] = None


class RunResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    signal: Optional[str]
    language: str
    version: str
    compile: Optional[RunStage] = None
    duration_ms: int
    mock: bool = False


@router.get("/languages")
async def list_languages() -> dict:
    """前端 CodeRunner 拉支持的语言列表（带显示名）"""
    return {
        "languages": [
            {"id": "python", "label": "Python 3.10", "compile_args": []},
            {"id": "c", "label": "C (gcc -std=c11)", "compile_args": ["-std=c11", "-O2"]},
            {"id": "cpp", "label": "C++ (g++ -std=c++17)", "compile_args": ["-std=c++17", "-O2"]},
        ]
    }


@router.post("", response_model=RunResponse)
async def run(req: RunRequest) -> RunResponse:
    lang_cfg = LANGS.get(req.language.lower())
    if not lang_cfg:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的语言：{req.language}。支持：{list(LANGS.keys())}",
        )

    piston_url = settings.PISTON_URL.rstrip("/")
    payload = {
        "language": lang_cfg["language"],
        "version": lang_cfg["version"],
        "files": [{"name": lang_cfg["filename"], "content": req.source}],
        "stdin": req.stdin,
        "args": req.args,
        # 编译参数（c/cpp 用，python 忽略）
        "compile_timeout": 10_000,
        "run_timeout": settings.PISTON_TIMEOUT_MS,
        "compile_memory_limit": -1,
        "run_memory_limit": -1,
    }
    if lang_cfg["compile_args"]:
        payload["compile_args"] = lang_cfg["compile_args"]

    started = time.time()
    try:
        # trust_env=False:不读 HTTPS_PROXY 等环境变量。
        # piston 在 docker 内网或 127.0.0.1,本就不该走任何代理;
        # 否则 Clash / 公司代理会把内网请求截胡返回 502。
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            r = await client.post(f"{piston_url}/api/v2/execute", json=payload)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        # Piston 没起 → 返回 mock 友好提示，前端不至于一片红
        return RunResponse(
            stdout="",
            stderr=(
                "(沙箱未启动) 后端连不上 piston-api。请：① 启动 Docker Desktop；"
                "② docker compose up -d piston-api；③ 装运行时 scripts/init-piston.ps1"
                "(Windows) 或 scripts/init-piston.sh"
            ),
            exit_code=-1,
            signal=None,
            language=req.language,
            version=lang_cfg["version"],
            compile=None,
            duration_ms=int((time.time() - started) * 1000),
            mock=True,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Piston 连接失败：{e}")

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Piston 返回 {r.status_code}：{r.text[:300]}",
        )

    data = r.json()
    run_stage = data.get("run") or {}
    compile_stage = data.get("compile")
    return RunResponse(
        stdout=run_stage.get("stdout", ""),
        stderr=run_stage.get("stderr", ""),
        exit_code=run_stage.get("code", 0),
        signal=run_stage.get("signal"),
        language=req.language,
        version=data.get("version", lang_cfg["version"]),
        compile=RunStage(**compile_stage) if compile_stage else None,
        duration_ms=int((time.time() - started) * 1000),
        mock=False,
    )
