"""把 Docker 演示种子库中的课程与 RAG 知识块增量导入本地运行库。

这个脚本只导入全局课程目录和知识块，不复制用户、会话、画像、笔记或
用户生成资源。导入按课程名和知识块稳定键去重，可以安全重复执行。

运行：
    python -m scripts.import_seed_catalog
"""

from __future__ import annotations

import gzip
import os
import sqlite3
import sys
import tempfile
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
LIVE_DB = BACKEND_DIR / "studymate.db"
SEED_GZIP = BACKEND_DIR / "resources" / "seed" / "studymate.db.gz"
IMPORT_VERSION = "seed-catalog-2026.07.29-v1"


def _chunk_key(row: sqlite3.Row) -> tuple[str, str, str, int | None]:
    """优先使用稳定 chroma_id；旧数据则退回到正文、来源和页码组合。"""

    chroma_id = (row["chroma_id"] or "").strip()
    if chroma_id:
        return ("chroma", chroma_id, "", None)
    return (
        "content",
        row["content"],
        row["source"],
        row["page"],
    )


def import_catalog(
    live_db: Path = LIVE_DB,
    seed_gzip: Path = SEED_GZIP,
) -> dict[str, int]:
    if not live_db.exists():
        raise FileNotFoundError(f"本地运行库不存在：{live_db}")
    if not seed_gzip.exists():
        raise FileNotFoundError(f"演示种子库不存在：{seed_gzip}")

    fd, seed_path_text = tempfile.mkstemp(prefix="studymate-seed-", suffix=".db")
    os.close(fd)
    seed_path = Path(seed_path_text)

    try:
        with gzip.open(seed_gzip, "rb") as source, seed_path.open("wb") as target:
            while block := source.read(1024 * 1024):
                target.write(block)

        seed = sqlite3.connect(seed_path)
        live = sqlite3.connect(live_db)
        seed.row_factory = sqlite3.Row
        live.row_factory = sqlite3.Row
        live.execute("PRAGMA foreign_keys = ON")

        inserted_courses = 0
        inserted_chunks = 0
        course_map: dict[int, int] = {}

        try:
            live.execute("BEGIN IMMEDIATE")
            live.execute(
                """
                CREATE TABLE IF NOT EXISTS system_migrations (
                    version VARCHAR(64) PRIMARY KEY,
                    description VARCHAR(512) NOT NULL,
                    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            for course in seed.execute(
                "SELECT id, name, description, created_at FROM courses ORDER BY id"
            ):
                current = live.execute(
                    "SELECT id FROM courses WHERE name = ?",
                    (course["name"],),
                ).fetchone()
                if current:
                    live_course_id = int(current["id"])
                else:
                    cursor = live.execute(
                        """
                        INSERT INTO courses (name, description, created_at)
                        VALUES (?, ?, ?)
                        """,
                        (
                            course["name"],
                            course["description"],
                            course["created_at"],
                        ),
                    )
                    live_course_id = int(cursor.lastrowid)
                    inserted_courses += 1
                course_map[int(course["id"])] = live_course_id

            existing_keys: dict[int, set[tuple[str, str, str, int | None]]] = {}
            for live_course_id in course_map.values():
                rows = live.execute(
                    """
                    SELECT content, source, page, chroma_id
                    FROM knowledge_chunks
                    WHERE course_id = ?
                    """,
                    (live_course_id,),
                )
                existing_keys[live_course_id] = {_chunk_key(row) for row in rows}

            for chunk in seed.execute(
                """
                SELECT course_id, content, source, page, url, meta, chroma_id,
                       embedding, created_at
                FROM knowledge_chunks
                ORDER BY id
                """
            ):
                live_course_id = course_map[int(chunk["course_id"])]
                key = _chunk_key(chunk)
                if key in existing_keys[live_course_id]:
                    continue
                live.execute(
                    """
                    INSERT INTO knowledge_chunks (
                        course_id, content, source, page, url, meta, chroma_id,
                        embedding, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        live_course_id,
                        chunk["content"],
                        chunk["source"],
                        chunk["page"],
                        chunk["url"],
                        chunk["meta"],
                        chunk["chroma_id"],
                        chunk["embedding"],
                        chunk["created_at"],
                    ),
                )
                existing_keys[live_course_id].add(key)
                inserted_chunks += 1

            violations = live.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                raise RuntimeError(f"导入后发现外键错误：{violations[:3]}")
            integrity = live.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"导入后完整性检查失败：{integrity}")
            live.execute(
                """
                INSERT OR IGNORE INTO system_migrations (version, description, applied_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                """,
                (IMPORT_VERSION, "从演示种子增量导入课程目录与知识块"),
            )

            live.commit()
        except Exception:
            live.rollback()
            raise
        finally:
            seed.close()
            live.close()

        return {
            "inserted_courses": inserted_courses,
            "inserted_chunks": inserted_chunks,
        }
    finally:
        seed_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    result = import_catalog()
    print(
        "课程目录导入完成："
        f"新增课程 {result['inserted_courses']} 门，"
        f"新增知识块 {result['inserted_chunks']} 条。"
    )
