"""Knowledge-source labels shared by RAG ingestion and API responses."""
from __future__ import annotations

import re


_AI_SOURCE_PREFIX = re.compile(
    r"^\s*AI\s*(?:生成|generated)\s*[·._—\-:：]?\s*",
    flags=re.IGNORECASE,
)


def clean_source_name(value: str | None) -> str:
    """Remove legacy generation markers from labels shown as course knowledge sources."""
    cleaned = _AI_SOURCE_PREFIX.sub("", value or "").strip()
    return cleaned or "课程资料"
