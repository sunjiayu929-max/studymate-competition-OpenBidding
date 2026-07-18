#!/usr/bin/env python3
"""检查 StudyMate 工作区目录、文档链接和本地状态是否符合约定。"""

from __future__ import annotations

import os
import re
import subprocess
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "studymate"

ALLOWED_ROOT_ENTRIES = {
    ".git",
    ".gitattributes",
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "docs",
    "studymate",
}

ALLOWED_APP_ENTRIES = {
    ".deploy.env",
    ".deploy.env.example",
    ".env.example",
    ".gitignore",
    "Caddyfile",
    "README.md",
    "backend",
    "backups",
    "data",
    "docker-compose.yml",
    "docs",
    "frontend",
    "logs",
    "scripts",
}

ALLOWED_DOC_ENTRIES = {"README.md", "赛事相关", "参考资料", "项目开发相关", "交付文档"}

ALLOWED_BACKEND_ENTRIES = {
    ".dockerignore",
    ".env",
    ".venv",
    "Dockerfile",
    "README.md",
    "app",
    "backups",
    "requirements.txt",
    "resources",
    "run.py",
    "scripts",
    "studymate.db",
    "tests",
}

ALLOWED_FRONTEND_ENTRIES = {
    ".dockerignore",
    ".gitignore",
    "Dockerfile",
    "README.md",
    "dist",
    "eslint.config.js",
    "index.html",
    "nginx.conf",
    "node_modules",
    "package-lock.json",
    "package.json",
    "public",
    "scripts",
    "src",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
}

REQUIRED_PATHS = {
    ROOT / "README.md",
    ROOT / "CLAUDE.md",
    ROOT / "AGENTS.md",
    ROOT / "docs" / "README.md",
    ROOT / "docs" / "赛事相关",
    ROOT / "docs" / "参考资料",
    ROOT / "docs" / "项目开发相关",
    ROOT / "docs" / "交付文档",
    APP / "README.md",
    APP / "backend" / "README.md",
    APP / "frontend" / "README.md",
    APP / "frontend" / "scripts" / "capture-page.mjs",
    APP / "docs" / "系统架构.md",
    APP / "docs" / "接口说明.md",
    APP / "docs" / "开发与验收指南.md",
    APP / "docs" / "Ubuntu部署指南.md",
    APP / "docs" / "密钥管理指南.md",
    APP / "backend" / "resources" / "seed" / "studymate.db.gz",
}

FORBIDDEN_PATHS = {
    ROOT / "shot.mjs",
    APP / "frontend" / "shot.mjs",
    APP / "docs" / "DEPLOY_UBUNTU.md",
    APP / "docs" / "SECRETS.md",
    ROOT / "docs" / "项目开发相关" / "开发日志_20260517-20260716.md",
    ROOT / "docs" / "项目开发相关" / "历史",
}

SKIP_PARTS = {".git", ".venv", "node_modules", "dist"}


def project_files(pattern: str):
    for path in ROOT.rglob(pattern):
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        yield path


def check_markdown_links(errors: list[str]) -> tuple[int, int]:
    checked = 0
    link_count = 0
    link_pattern = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
    for path in project_files("*.md"):
        checked += 1
        text = path.read_text(encoding="utf-8")
        for match in link_pattern.finditer(text):
            raw = match.group(1).strip()
            if not raw or raw.startswith(("#", "http://", "https://", "mailto:")):
                continue
            link_count += 1
            target = urllib.parse.unquote(raw.split("#", 1)[0].strip("<>"))
            if target and not (path.parent / target).resolve().exists():
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"失效文档链接：{path.relative_to(ROOT)}:{line} -> {raw}")
    return checked, link_count


def check_tracked_local_state(errors: list[str]) -> int:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    tracked = [line for line in result.stdout.splitlines() if line]
    allowed_seed = "studymate/backend/resources/seed/studymate.db.gz"
    for name in tracked:
        lower = name.lower()
        if name in {"studymate/.deploy.env", "studymate/backend/.env"}:
            errors.append(f"真实环境文件不应被 Git 跟踪：{name}")
        if lower.endswith(".log") or "/logs/" in lower or "/backups/" in lower:
            errors.append(f"运行日志或备份不应被 Git 跟踪：{name}")
        if (lower.endswith(".db") or lower.endswith(".db.gz")) and name != allowed_seed:
            errors.append(f"运行数据库不应被 Git 跟踪：{name}")
        if any(part in lower.split("/") for part in {"dist", "node_modules", ".venv"}):
            errors.append(f"生成目录不应被 Git 跟踪：{name}")
    return len(tracked)


def main() -> int:
    errors: list[str] = []

    directory_rules = {
        ROOT: ALLOWED_ROOT_ENTRIES,
        APP: ALLOWED_APP_ENTRIES,
        ROOT / "docs": ALLOWED_DOC_ENTRIES,
        APP / "backend": ALLOWED_BACKEND_ENTRIES,
        APP / "frontend": ALLOWED_FRONTEND_ENTRIES,
    }
    actual_root: set[str] = set()
    for directory, allowed in directory_rules.items():
        actual = {path.name for path in directory.iterdir()}
        if directory == ROOT:
            actual_root = actual
        extra = sorted(actual - allowed)
        if extra:
            errors.append(
                f"{directory.relative_to(ROOT) or Path('.')} 存在未归类项目：{', '.join(extra)}"
            )

    for path in sorted(REQUIRED_PATHS):
        if not path.exists():
            errors.append(f"缺少必需路径：{path.relative_to(ROOT)}")

    for path in sorted(FORBIDDEN_PATHS):
        if path.exists():
            errors.append(f"发现已退役或位置错误的文件：{path.relative_to(ROOT)}")

    agents = ROOT / "AGENTS.md"
    if not agents.is_symlink() or os.readlink(agents) != "CLAUDE.md":
        errors.append("AGENTS.md 必须是指向 CLAUDE.md 的符号链接")

    caches = [
        path.relative_to(ROOT)
        for path in project_files("__pycache__")
        if path.is_dir()
    ]
    bytecode = [path.relative_to(ROOT) for path in project_files("*.pyc")]
    if caches or bytecode:
        items = [str(path) for path in caches + bytecode]
        errors.append(f"工作区存在 Python 缓存：{', '.join(items)}")

    markdown_files, local_links = check_markdown_links(errors)
    tracked_files = check_tracked_local_state(errors)

    print(
        "结构核查："
        f"根目录 {len(actual_root)} 项，Markdown {markdown_files} 个，"
        f"本地链接 {local_links} 条，Git 跟踪文件 {tracked_files} 个"
    )
    if errors:
        print(f"发现 {len(errors)} 个问题：")
        for error in errors:
            print(f"- {error}")
        return 1
    print("结构核查通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
