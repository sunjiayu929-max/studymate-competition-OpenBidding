"""跨 shell 的 StudyMate 安全离线启动器。

示例（PowerShell、cmd、bash 均可）：
  python scripts/run_safe_offline.py \
    --database-path .runtime/studymate-safe.db \
    --private-knowledge-dir .runtime/studymate-private

必须在导入 app 之前设置 STUDYMATE_SAFE_OFFLINE，确保配置层完全跳过项目 .env。
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path


def _runtime_path(value: str, *, label: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="以 0 外联、忽略项目 .env 的安全离线模式启动 StudyMate 后端"
    )
    parser.add_argument(
        "--database-path",
        required=True,
        help="隔离 SQLite 数据库路径（相对路径以当前 backend 目录为基准）",
    )
    parser.add_argument(
        "--private-knowledge-dir",
        required=True,
        help="隔离私有知识原文件目录（相对路径以当前 backend 目录为基准）",
    )
    parser.add_argument("--host", default="127.0.0.1", choices=("127.0.0.1", "::1"))
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--cors-origins",
        default="http://localhost:5173,http://127.0.0.1:5173",
    )
    return parser


def main() -> None:
    args = _parser().parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port 必须在 1..65535 之间")

    database_path = _runtime_path(args.database_path, label="--database-path")
    private_dir = _runtime_path(
        args.private_knowledge_dir,
        label="--private-knowledge-dir",
    )
    database_path.parent.mkdir(parents=True, exist_ok=True)
    private_dir.mkdir(parents=True, exist_ok=True)

    os.environ["STUDYMATE_SAFE_OFFLINE"] = "1"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"
    os.environ["PRIVATE_KNOWLEDGE_DIR"] = str(private_dir)
    os.environ["APP_HOST"] = args.host
    os.environ["APP_PORT"] = str(args.port)
    os.environ["CORS_ORIGINS"] = args.cors_origins

    backend_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_root))

    # Safe runs use an isolated filename, so the normal ``studymate.db`` seed
    # guard intentionally does not apply. Build the complete local catalog
    # before importing the app so its in-memory RAG index starts populated.
    from scripts.bootstrap_knowledge import bootstrap

    asyncio.run(
        bootstrap(
            database_path,
            backend_root / "resources" / "seed" / "studymate.db.gz",
        )
    )

    import uvicorn

    # 使用已导入对象，避免 reload/spawn 创建未继承隔离参数的新进程。
    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
