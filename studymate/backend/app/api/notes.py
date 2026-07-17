"""笔记本 API。

5 门课各一本笔记本（按 course_id 隔离），同时支持：
- 手动新建（前端 /notes 页面）
- doc 一键摘录（source=doc，title=主题，content 含引用）
- quiz 错题自动收藏（source=quiz，tags=[课名, topic, "错题"]）
- tutor 答疑摘录（source=tutor，可选联动）

接口：
- GET    /api/notes                列表（course_id / source / q 搜索 / tag 过滤）
- POST   /api/notes                新增
- GET    /api/notes/{id}           详情
- PUT    /api/notes/{id}           更新（任意字段）
- DELETE /api/notes/{id}           删除
- GET    /api/notes/tags           当前 user + 可选 course 的所有标签去重列表
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import Note, Folder


router = APIRouter(prefix="/notes", tags=["notes"])


class NoteIn(BaseModel):
    user_id: int = 1
    course_id: int | None = None
    folder: str = ""  # 用户自定义文件夹；"" = 未分类
    title: str = Field(..., min_length=1, max_length=256)
    content_md: str = ""
    tags: list[str] = Field(default_factory=list)
    source: str = "manual"  # manual / doc / quiz / tutor


class NoteUpdate(BaseModel):
    title: str | None = None
    content_md: str | None = None
    tags: list[str] | None = None
    folder: str | None = None  # 可移动到其他文件夹


def _to_dict(n: Note) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "course_id": n.course_id,
        "folder": n.folder or "",
        "title": n.title,
        "content_md": n.content_md,
        "tags": n.tags or [],
        "source": n.source,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


@router.get("")
async def list_notes(
    user_id: int = 1,
    course_id: int | None = None,
    folder: str | None = None,  # 空字符串可选；不传 → 不过滤；传 __unfiled__ → 只看 folder=""
    source: str | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Note).where(Note.user_id == user_id)
    if course_id is not None:
        stmt = stmt.where(Note.course_id == course_id)
    if folder is not None:
        if folder == "__unfiled__":
            stmt = stmt.where((Note.folder == "") | (Note.folder.is_(None)))
        else:
            stmt = stmt.where(Note.folder == folder)
    if source:
        stmt = stmt.where(Note.source == source)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Note.title.ilike(like), Note.content_md.ilike(like)))
    stmt = stmt.order_by(desc(Note.updated_at))

    rows = (await db.execute(stmt)).scalars().all()

    items = [_to_dict(r) for r in rows]
    # 统计 source / folder 分布给前端做 chip / 树
    from collections import Counter
    src_cnt = Counter(r.source for r in rows)
    return {
        "count": len(items),
        "by_source": {k: v for k, v in src_cnt.items()},
        "items": items,
    }


class FolderIn(BaseModel):
    user_id: int = 1
    name: str = Field(..., min_length=1, max_length=128)


class FolderRename(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=128)


@router.get("/folders")
async def list_folders(
    user_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """返回该用户所有文件夹（含未分类）+ 每个文件夹的笔记数。

    合并两个来源：
    - declared：folders 表显式声明的（允许空文件夹）
    - derived：notes.folder 出现过的值
    """
    note_rows = (await db.execute(
        select(Note.folder).where(Note.user_id == user_id)
    )).all()
    from collections import Counter
    cnt: Counter = Counter()
    for (f,) in note_rows:
        cnt[f or ""] += 1
    total = sum(cnt.values())
    unfiled = cnt.pop("", 0)

    declared_rows = (await db.execute(
        select(Folder.name).where(Folder.user_id == user_id)
    )).all()
    declared = {n for (n,) in declared_rows if n}

    all_names = declared | set(cnt.keys())
    named = [{"name": n, "count": cnt.get(n, 0)} for n in sorted(all_names, key=lambda x: (-cnt.get(x, 0), x))]
    return {
        "total": total,
        "unfiled": unfiled,
        "folders": named,
    }


@router.post("/folders")
async def create_folder(req: FolderIn, db: AsyncSession = Depends(get_db)):
    """创建空文件夹。同名幂等。"""
    name = req.name.strip()[:128]
    if not name:
        raise HTTPException(400, "folder name required")
    exists = (await db.execute(
        select(Folder).where(Folder.user_id == req.user_id, Folder.name == name)
    )).scalar_one_or_none()
    if exists:
        return {"ok": True, "name": name, "created": False}
    db.add(Folder(user_id=req.user_id, name=name))
    await db.commit()
    return {"ok": True, "name": name, "created": True}


@router.put("/folders/{name}")
async def rename_folder(
    name: str,
    req: FolderRename,
    user_id: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """重命名文件夹：同步更新 folders 表 + 所有相关笔记的 folder 字段。"""
    new_name = req.new_name.strip()[:128]
    if not new_name:
        raise HTTPException(400, "new_name required")
    if new_name == name:
        return {"ok": True, "name": new_name, "moved": 0}
    # 不允许覆盖已存在的同名文件夹
    conflict = (await db.execute(
        select(Folder).where(Folder.user_id == user_id, Folder.name == new_name)
    )).scalar_one_or_none()
    if conflict:
        raise HTTPException(409, f"folder '{new_name}' already exists")

    # 更新 Folder 表（若有）
    old = (await db.execute(
        select(Folder).where(Folder.user_id == user_id, Folder.name == name)
    )).scalar_one_or_none()
    if old:
        old.name = new_name
    else:
        # 派生文件夹 → 显式建一条
        db.add(Folder(user_id=user_id, name=new_name))

    # 批量更新相关 notes
    notes = (await db.execute(
        select(Note).where(Note.user_id == user_id, Note.folder == name)
    )).scalars().all()
    for n in notes:
        n.folder = new_name
    await db.commit()
    return {"ok": True, "name": new_name, "moved": len(notes)}


@router.delete("/folders/{name}")
async def delete_folder(
    name: str,
    user_id: int = 1,
    move_to: str = "",  # 默认移到未分类
    db: AsyncSession = Depends(get_db),
):
    """删除文件夹：folders 表清掉，相关笔记 folder 改为 move_to（默认空 = 未分类）。"""
    move_to = (move_to or "").strip()[:128]

    old = (await db.execute(
        select(Folder).where(Folder.user_id == user_id, Folder.name == name)
    )).scalar_one_or_none()
    if old:
        await db.delete(old)

    notes = (await db.execute(
        select(Note).where(Note.user_id == user_id, Note.folder == name)
    )).scalars().all()
    for n in notes:
        n.folder = move_to
    await db.commit()
    return {"ok": True, "name": name, "moved": len(notes), "move_to": move_to}


@router.post("")
async def create_note(req: NoteIn, db: AsyncSession = Depends(get_db)):
    n = Note(
        user_id=req.user_id,
        course_id=req.course_id,
        folder=(req.folder or "").strip()[:128],
        title=req.title.strip()[:256],
        content_md=req.content_md,
        tags=[t.strip()[:32] for t in req.tags if t.strip()][:16],
        source=req.source if req.source in {"manual", "doc", "quiz", "tutor"} else "manual",
    )
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return _to_dict(n)


@router.get("/tags")
async def list_tags(
    user_id: int = 1,
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Note.tags).where(Note.user_id == user_id)
    if course_id is not None:
        stmt = stmt.where(Note.course_id == course_id)
    rows = (await db.execute(stmt)).all()
    seen: dict[str, int] = {}
    for (tags,) in rows:
        for t in (tags or []):
            seen[t] = seen.get(t, 0) + 1
    items = sorted(seen.items(), key=lambda kv: -kv[1])
    return {"count": len(items), "items": [{"name": n, "count": c} for n, c in items]}


@router.get("/{note_id}")
async def get_note(note_id: int, db: AsyncSession = Depends(get_db)):
    n = await db.get(Note, note_id)
    if not n:
        raise HTTPException(404, f"note {note_id} not found")
    return _to_dict(n)


@router.put("/{note_id}")
async def update_note(note_id: int, req: NoteUpdate, db: AsyncSession = Depends(get_db)):
    n = await db.get(Note, note_id)
    if not n:
        raise HTTPException(404, f"note {note_id} not found")
    if req.title is not None:
        n.title = req.title.strip()[:256]
    if req.content_md is not None:
        n.content_md = req.content_md
    if req.tags is not None:
        n.tags = [t.strip()[:32] for t in req.tags if t.strip()][:16]
    if req.folder is not None:
        n.folder = req.folder.strip()[:128]
    await db.commit()
    await db.refresh(n)
    return _to_dict(n)


@router.delete("/{note_id}")
async def delete_note(note_id: int, db: AsyncSession = Depends(get_db)):
    n = await db.get(Note, note_id)
    if not n:
        raise HTTPException(404, f"note {note_id} not found")
    await db.delete(n)
    await db.commit()
    return {"ok": True, "id": note_id}
