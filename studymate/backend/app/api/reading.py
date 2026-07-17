"""Resolve generated reading recommendations to verified direct links."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.integrations.reading_resolver import resolve_reading_items


router = APIRouter(prefix="/reading", tags=["reading"])


class ReadingResolveItem(BaseModel):
    index: int = Field(ge=0, le=50)
    title: str = Field(min_length=1, max_length=160)
    type: Literal["paper", "book", "blog"]
    source: str = Field(default="", max_length=80)
    lang: Literal["zh", "en"] | None = None


class ReadingResolveRequest(BaseModel):
    items: list[ReadingResolveItem] = Field(default_factory=list, max_length=12)


@router.post("/resolve")
async def resolve_reading_links(req: ReadingResolveRequest):
    items = [item.model_dump() for item in req.items]
    resolved = await resolve_reading_items(items)
    return {"count": len(resolved), "items": resolved}
