"""Resolve generated reading recommendations to verified direct pages.

Only public titles and source names are sent to third-party catalog/search APIs.
No user id, profile, conversation, or authentication data leaves StudyMate.
"""
from __future__ import annotations

import asyncio
import html
import json
import re
import time
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import quote, urlparse
from xml.etree import ElementTree

import httpx

from app.core.config import safe_offline_enabled


_CACHE_TTL = 6 * 60 * 60
_CACHE_LIMIT = 512
_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}

_HEADERS = {
    "User-Agent": "StudyMate/1.0 (https://matropic.cn; mailto:admin@matropic.cn)",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
}
_ARTICLE_TYPES = {
    "journal-article",
    "proceedings-article",
    "book-chapter",
    "report",
    "dissertation",
}
_PREFIX_RE = re.compile(
    r"^(?:图解|详解|浅谈|快速理解|快速入门|入门|教程|学习笔记|笔记|实战|原理|综述)"
    r"[：:\s\-—·]*",
    re.IGNORECASE,
)
_DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$", re.IGNORECASE)
_CSDN_PATH_RE = re.compile(r"^/[^/]+/article/details/\d+/?$")
_JUEJIN_PATH_RE = re.compile(r"^/post/\d+/?$")
_DOUBAN_PATH_RE = re.compile(r"^/subject/\d+/?$")
_TOPIC_STOPWORDS = {
    "岗位", "知识库", "工程师", "开发", "应用", "课程", "教程", "学习", "资料", "内容",
    "什么", "如何", "为什么", "原理", "过程", "介绍", "讲解", "工作",
}


def _clean_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_title(value: Any) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "", _clean_text(value)).lower()


def _title_core(value: str) -> str:
    text = _clean_text(value)
    previous = None
    while text and text != previous:
        previous = text
        text = _PREFIX_RE.sub("", text).strip()
    return text


def _topic_terms(value: str) -> list[str]:
    """提取用于二次验真的主题词，避免仅凭论文标题相似度放行跑题结果。"""
    text = _title_core(_clean_text(value))
    terms: list[str] = []
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#]{2,24}", text):
        token = token.lower()
        if token not in terms:
            terms.append(token)
    for chunk in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        for part in re.split(r"岗位|知识库|工程师|开发|应用|课程|教程|学习|资料|内容|什么|如何|为什么|原理|过程|介绍|讲解|工作|以及|与|和|的|中|从|到|形成|建立|实现|进行", chunk):
            part = part.strip()
            if len(part) >= 2 and part not in _TOPIC_STOPWORDS and part not in terms:
                terms.append(part)
    return list(dict.fromkeys(terms))[:12]


def _topic_relevant(topic: str, candidate: str) -> bool:
    normalized_topic = _normalize_title(_title_core(topic))
    normalized_candidate = _normalize_title(candidate)
    if not normalized_topic or not normalized_candidate:
        return False
    # 长主题完整命中是最可靠的信号；短英文缩写则由词命中判断。
    if len(normalized_topic) >= 4 and normalized_topic in normalized_candidate:
        return True
    terms = _topic_terms(topic)
    if not terms:
        return True
    hits = sum(1 for term in terms if _normalize_title(term) in normalized_candidate)
    required = 1 if len(terms) <= 2 else 2
    return hits >= required


def title_match_score(query: str, candidate: str) -> float:
    left = _normalize_title(query)
    right = _normalize_title(candidate)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    core = _normalize_title(_title_core(query))
    if len(core) >= 4 and core in right:
        return max(0.88, min(0.98, len(core) / max(len(right), 1) + 0.35))
    if min(len(left), len(right)) >= 4 and (left in right or right in left):
        return max(0.86, min(len(left), len(right)) / max(len(left), len(right)))
    return SequenceMatcher(None, left, right).ratio()


def _best_arxiv(xml_text: str, title: str, topic: str = "") -> dict[str, Any] | None:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return None
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    best: tuple[float, str] | None = None
    for entry in root.findall("atom:entry", ns):
        candidate = _clean_text(entry.findtext("atom:title", default="", namespaces=ns))
        score = title_match_score(title, candidate)
        if topic and not _topic_relevant(topic, candidate):
            continue
        direct = ""
        for link in entry.findall("atom:link", ns):
            if link.attrib.get("rel") == "alternate":
                direct = link.attrib.get("href", "")
                break
        parsed = urlparse(direct)
        if parsed.hostname not in {"arxiv.org", "www.arxiv.org"} or not parsed.path.startswith("/abs/"):
            continue
        direct = f"https://arxiv.org{parsed.path}"
        if score >= 0.90 and (best is None or score > best[0]):
            best = (score, direct)
    if best is None:
        return None
    return {"url": best[1], "provider": "arXiv", "label": "打开 arXiv 原文", "score": round(best[0], 3)}


def _best_crossref(body: dict[str, Any], title: str, topic: str = "") -> dict[str, Any] | None:
    best: tuple[float, str] | None = None
    for item in ((body.get("message") or {}).get("items") or []):
        if not isinstance(item, dict) or item.get("type") not in _ARTICLE_TYPES:
            continue
        candidate_titles = item.get("title") or []
        candidate = _clean_text(candidate_titles[0] if candidate_titles else "")
        doi = str(item.get("DOI") or "").strip()
        score = title_match_score(title, candidate)
        if score < 0.94 or not _DOI_RE.match(doi) or (topic and not _topic_relevant(topic, candidate)):
            continue
        direct = f"https://doi.org/{quote(doi, safe='/:;().-_')}"
        if best is None or score > best[0]:
            best = (score, direct)
    if best is None:
        return None
    return {"url": best[1], "provider": "Crossref DOI", "label": "打开 DOI 原文", "score": round(best[0], 3)}


def _best_douban(page: str, title: str, topic: str = "") -> dict[str, Any] | None:
    match = re.search(r"window\.__DATA__\s*=\s*", page)
    if not match:
        return None
    try:
        payload, _ = json.JSONDecoder().raw_decode(page[match.end():])
        items = payload.get("items") or []
    except (TypeError, ValueError):
        return None

    best: tuple[float, str] | None = None
    for item in items:
        if not isinstance(item, dict):
            continue
        direct = str(item.get("url") or "").strip()
        parsed = urlparse(direct)
        score = title_match_score(title, str(item.get("title") or ""))
        if parsed.hostname != "book.douban.com" or not _DOUBAN_PATH_RE.match(parsed.path) or score < 0.90 or (topic and not _topic_relevant(topic, str(item.get("title") or ""))):
            continue
        clean_url = f"https://book.douban.com{parsed.path}"
        if best is None or score > best[0]:
            best = (score, clean_url)
    if best is None:
        return None
    return {"url": best[1], "provider": "豆瓣图书", "label": "打开图书详情", "score": round(best[0], 3)}


def _best_csdn(body: dict[str, Any], title: str, topic: str = "") -> dict[str, Any] | None:
    best: tuple[float, str] | None = None
    for item in body.get("result_vos") or []:
        if not isinstance(item, dict):
            continue
        direct = str(item.get("url") or "").strip()
        parsed = urlparse(direct)
        candidate = str(item.get("title") or "")
        score = title_match_score(title, candidate)
        if parsed.hostname != "blog.csdn.net" or not _CSDN_PATH_RE.match(parsed.path) or score < 0.82 or (topic and not _topic_relevant(topic, candidate)):
            continue
        clean_url = f"https://blog.csdn.net{parsed.path.rstrip('/')}"
        if best is None or score > best[0]:
            best = (score, clean_url)
    if best is None:
        return None
    return {"url": best[1], "provider": "CSDN", "label": "打开博客原文", "score": round(best[0], 3)}


def _best_juejin(body: dict[str, Any], title: str, topic: str = "") -> dict[str, Any] | None:
    best: tuple[float, str] | None = None
    for result in body.get("data") or []:
        model = result.get("result_model") if isinstance(result, dict) else None
        if not isinstance(model, dict):
            continue
        article_id = str(model.get("article_id") or "").strip()
        candidate = str((model.get("article_info") or {}).get("title") or "")
        direct = f"https://juejin.cn/post/{article_id}"
        parsed = urlparse(direct)
        score = title_match_score(title, candidate)
        if not article_id.isdigit() or parsed.hostname != "juejin.cn" or not _JUEJIN_PATH_RE.match(parsed.path) or score < 0.82 or (topic and not _topic_relevant(topic, candidate)):
            continue
        if best is None or score > best[0]:
            best = (score, direct)
    if best is None:
        return None
    return {"url": best[1], "provider": "掘金", "label": "打开博客原文", "score": round(best[0], 3)}


async def _resolve_arxiv(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    try:
        response = await client.get(
            # export.arxiv.org 的 HTTP 入口会立即跳转到 HTTPS；从部分双栈网络
            # 直接连接 HTTPS 会卡在不可达的 IPv6 地址，先走该入口可稳定回落到 IPv4。
            "http://export.arxiv.org/api/query",
            params={"search_query": f'ti:"{title}"', "start": 0, "max_results": 5},
        )
        response.raise_for_status()
        return _best_arxiv(response.text, title, topic)
    except Exception:
        return None


async def _resolve_crossref(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    try:
        response = await client.get(
            "https://api.crossref.org/works",
            params={"query.title": title, "rows": 5, "select": "DOI,title,URL,type"},
        )
        response.raise_for_status()
        return _best_crossref(response.json(), title, topic)
    except Exception:
        return None


async def _resolve_paper(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    arxiv, crossref = await asyncio.gather(
        _resolve_arxiv(client, title, topic),
        _resolve_crossref(client, title, topic),
    )
    return arxiv or crossref


async def _resolve_book(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    try:
        response = await client.get(
            "https://search.douban.com/book/subject_search",
            params={"search_text": title},
        )
        response.raise_for_status()
        return _best_douban(response.text, title, topic)
    except Exception:
        return None


async def _resolve_csdn(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    query = _title_core(title) or title
    try:
        response = await client.get(
            "https://so.csdn.net/api/v3/search",
            params={
                "q": query,
                "t": "blog",
                "p": 1,
                "s": 0,
                "tm": 0,
                "lv": -1,
                "ft": 0,
                "platform": "pc",
                "ia": 1,
            },
            headers={"Referer": "https://so.csdn.net/so/search"},
        )
        response.raise_for_status()
        return _best_csdn(response.json(), title, topic)
    except Exception:
        return None


async def _resolve_juejin(client: httpx.AsyncClient, title: str, topic: str = "") -> dict[str, Any] | None:
    query = _title_core(title) or title
    try:
        response = await client.post(
            "https://api.juejin.cn/search_api/v1/search",
            json={"key_word": query, "search_type": 0, "cursor": "0", "limit": 8},
            headers={"Referer": "https://juejin.cn/"},
        )
        response.raise_for_status()
        return _best_juejin(response.json(), title, topic)
    except Exception:
        return None


async def _resolve_blog(client: httpx.AsyncClient, title: str, source: str, topic: str = "") -> dict[str, Any] | None:
    normalized = source.lower()
    if "csdn" in normalized:
        return await _resolve_csdn(client, title, topic)
    if "掘金" in source or "juejin" in normalized:
        return await _resolve_juejin(client, title, topic)
    return None


def _cache_key(item: dict[str, Any], topic: str = "") -> str:
    return ":".join((
        str(item.get("type") or ""),
        str(item.get("lang") or ""),
        _normalize_title(item.get("title")),
        _normalize_title(item.get("source")),
        _normalize_title(topic),
    ))


def _get_cached(key: str) -> tuple[bool, dict[str, Any] | None]:
    cached = _cache.get(key)
    if not cached:
        return False, None
    if time.time() - cached[0] >= _CACHE_TTL:
        _cache.pop(key, None)
        return False, None
    return True, cached[1]


def _set_cached(key: str, value: dict[str, Any] | None) -> None:
    _cache[key] = (time.time(), value)
    if len(_cache) <= _CACHE_LIMIT:
        return
    oldest = sorted(_cache.items(), key=lambda pair: pair[1][0])[: len(_cache) - _CACHE_LIMIT]
    for old_key, _ in oldest:
        _cache.pop(old_key, None)


async def resolve_reading_items(items: list[dict[str, Any]], topic: str = "") -> list[dict[str, Any]]:
    if safe_offline_enabled():
        return []
    semaphore = asyncio.Semaphore(4)
    timeout = httpx.Timeout(6.5, connect=4.0)
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
    async with httpx.AsyncClient(
        transport=transport,
        timeout=timeout,
        follow_redirects=True,
        headers=_HEADERS,
        trust_env=False,
    ) as client:
        async def resolve_one(item: dict[str, Any]) -> dict[str, Any] | None:
            key = _cache_key(item, topic)
            found, cached = _get_cached(key)
            if found:
                return {"index": item["index"], **cached} if cached else None

            async with semaphore:
                kind = item.get("type")
                if kind == "paper":
                    match = await _resolve_paper(client, item["title"], topic)
                elif kind == "book":
                    match = await _resolve_book(client, item["title"], topic)
                elif kind == "blog":
                    match = await _resolve_blog(client, item["title"], item.get("source", ""), topic)
                else:
                    match = None
            _set_cached(key, match)
            return {"index": item["index"], **match} if match else None

        results = await asyncio.gather(*(resolve_one(item) for item in items), return_exceptions=True)
    return [result for result in results if isinstance(result, dict)]
