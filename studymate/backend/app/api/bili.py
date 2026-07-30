"""哔哩哔哩讲解视频推荐（可视讲解 Agent 的外部资源）。

设计：自产动画/黑板讲解之外，再聚合 B 站真人讲解视频，互补。
- 后端调 B 站搜索 API（需 WBI 签名 + buvid cookie），拿前 N 个视频卡片。
- **任何失败都兜底**：返回 search_url（B 站搜索页深链），前端退回「去 B 站搜」按钮，
  永不开天窗。符合「当场必出」原则。
- 结果按关键词缓存（默认 30 分钟），减少对 B 站的请求、避免云服务器 IP 被风控限频。
- 只做「外链推荐」：跳转到 bilibili.com，不嵌入播放、不长期缓存其封面。
"""
from __future__ import annotations

import asyncio
import hashlib
import re
import time
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import safe_offline_enabled

router = APIRouter(prefix="/bili", tags=["bili"])

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {"User-Agent": _UA, "Referer": "https://www.bilibili.com/"}

# WBI 混淆密钥重排表
_MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52,
]

# —— 简单内存缓存 ——
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 1800  # 30 分钟
_WBI_KEYS: dict[str, object] = {"img": "", "sub": "", "ts": 0.0}
_WBI_TTL = 3600 * 6  # wbi key 半天换一次，缓存 6 小时


class VideosRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=80)
    limit: int = Field(default=6, ge=1, le=12)
    concept_title: str | None = Field(default=None, max_length=80)
    course_name: str | None = Field(default=None, max_length=80)


_COURSE_ANCHORS: dict[str, tuple[str, ...]] = {
    "机器学习": ("机器学习", "人工智能", "算法"),
    "数据结构与算法": ("数据结构", "算法", "408"),
    "操作系统": ("操作系统", "linux", "408"),
    "计算机网络": ("计算机网络", "网络协议", "408"),
    "计算机组成原理": ("计算机组成原理", "计组", "cpu", "408"),
}
_TECH_TERMS = (
    "cpu", "取指", "译码", "执行", "指令周期", "流水线", "cache", "缓存", "直接映射", "组相联", "全相联", "中断", "总线",
    "梯度下降", "反向传播", "神经网络", "决策树", "随机森林", "支持向量机", "机器学习",
    "快速排序", "归并排序", "二叉树", "哈希表", "动态规划", "图遍历", "最短路径", "数据结构",
    "进程", "线程", "死锁", "调度", "虚拟内存", "页面置换", "文件系统", "操作系统",
    "tcp", "udp", "三次握手", "四次挥手", "拥塞控制", "路由", "dns", "网络协议",
)
_OFF_TOPIC_TERMS = (
    "宝可梦", "脑叶公司", "王者荣耀", "原神", "我的世界", "指令方块",
    "游戏", "攻略", "道具",
)


def _search_url(keyword: str) -> str:
    return f"https://search.bilibili.com/all?keyword={quote(keyword)}"


def _mixin_key(img: str, sub: str) -> str:
    raw = img + sub
    return "".join(raw[i] for i in _MIXIN_TAB if i < len(raw))[:32]


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").replace("&quot;", '"').strip()


def _normalize_text(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff+#]+", "", value or "").lower()


def _resolve_query(keyword: str, concept_title: str | None) -> str:
    source = (concept_title or keyword).strip()
    normalized = _normalize_text(source)
    if "取指" in normalized or "指令周期" in normalized:
        return "取指 译码 执行"
    cleaned = re.sub(
        r"请|帮我|讲解|解释|介绍|什么是|是什么|为什么|怎么|如何|工作原理|原理|过程",
        " ",
        source,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，。！？?：:")
    return cleaned[:80] or source[:80]


def _core_terms(keyword: str, concept_title: str | None, resolved_query: str) -> list[str]:
    combined = _normalize_text(" ".join(filter(None, (keyword, concept_title or "", resolved_query))))
    terms = [term for term in _TECH_TERMS if _normalize_text(term) in combined]
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#]{1,20}", resolved_query):
        token = token.lower()
        if token not in terms:
            terms.append(token)
    # 固定术语表只能识别“Cache”这类主词，容易丢掉“直接映射”“学习率”
    # 等限定信息。保留完整知识点作为强匹配项；只命中主词时仍可作为相关补充。
    compact = _normalize_text(resolved_query)
    if compact and compact not in {_normalize_text(term) for term in terms}:
        terms.append(compact)
    return list(dict.fromkeys(terms))[:8]


def _relevance_score(video: dict, core_terms: list[str], course_name: str | None) -> tuple[int, int]:
    text = _normalize_text(str(video.get("_search_text") or video.get("title") or ""))
    hits = sum(1 for term in core_terms if _normalize_text(term) in text)
    score = hits * 3
    anchors = _COURSE_ANCHORS.get(course_name or "", ())
    anchor_hits = sum(1 for anchor in anchors if _normalize_text(anchor) in text)
    score += min(anchor_hits, 2) * 2
    if any(_normalize_text(term) in text for term in _OFF_TOPIC_TERMS):
        score -= 8
    return score, hits


def _rank_videos(
    candidates: list[dict],
    core_terms: list[str],
    course_name: str | None,
    limit: int,
) -> list[dict]:
    ranked: list[tuple[int, int, int, dict]] = []
    for video in candidates:
        search_text = _normalize_text(str(video.get("_search_text") or video.get("title") or ""))
        if any(_normalize_text(term) in search_text for term in _OFF_TOPIC_TERMS):
            continue
        score, hits = _relevance_score(video, core_terms, course_name)
        if hits == 0:
            continue
        enough_terms = hits >= min(2, len(core_terms))
        if len(core_terms) == 1:
            enough_terms = hits == 1
        match_level = "exact" if enough_terms else "related"
        # 一个明确的知识词命中就可进入“相关补充”。课程锚点继续参与排序，
        # 但不再是卡片能否显示的硬门槛。
        if score >= 3:
            ranked.append(
                (
                    2 if match_level == "exact" else 1,
                    score,
                    int(video.get("play") or 0),
                    {**video, "match_level": match_level},
                )
            )
    ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return [
        {key: value for key, value in video.items() if not key.startswith("_")}
        for _, _, _, video in ranked[:limit]
    ]


def _candidate_queries(
    resolved_query: str,
    core_terms: list[str],
    concept_title: str | None,
    course_name: str | None,
) -> list[str]:
    anchors = _COURSE_ANCHORS.get(course_name or "", ())
    queries = [resolved_query]
    if anchors:
        queries.append(f"{resolved_query} {anchors[0]}")
    compact = _normalize_text(resolved_query)
    broad_term = next(
        (
            term
            for term in core_terms
            if _normalize_text(term) and _normalize_text(term) != compact
        ),
        "",
    )
    if broad_term:
        # B 站偶尔会对长而精确的短语返回空列表；再搜一次主知识词，
        # 最终仍经过本地相关性与跑题词过滤。
        queries.append(broad_term)
    if concept_title and concept_title != resolved_query:
        queries.append(concept_title)
    return list(dict.fromkeys(query.strip() for query in queries if query.strip()))[:3]


async def _get_wbi_keys(client: httpx.AsyncClient) -> tuple[str, str]:
    now = time.time()
    if _WBI_KEYS["img"] and now - float(_WBI_KEYS["ts"]) < _WBI_TTL:
        return str(_WBI_KEYS["img"]), str(_WBI_KEYS["sub"])
    r = await client.get("https://api.bilibili.com/x/web-interface/nav", headers=_HEADERS)
    data = r.json().get("data", {}) or {}
    wbi = data.get("wbi_img", {}) or {}
    img = (wbi.get("img_url") or "").rsplit("/", 1)[-1].split(".")[0]
    sub = (wbi.get("sub_url") or "").rsplit("/", 1)[-1].split(".")[0]
    if img and sub:
        _WBI_KEYS.update({"img": img, "sub": sub, "ts": now})
    return img, sub


def _sign(params: dict, img: str, sub: str) -> dict:
    mk = _mixin_key(img, sub)
    params = dict(params)
    params["wts"] = int(time.time())
    params = dict(sorted(params.items()))
    # 过滤特殊字符
    clean = {k: "".join(c for c in str(v) if c not in "!'()*") for k, v in params.items()}
    query = urlencode(clean)
    clean["w_rid"] = hashlib.md5((query + mk).encode()).hexdigest()
    return clean


async def _fetch_buvid(client: httpx.AsyncClient) -> str:
    try:
        r = await client.get("https://api.bilibili.com/x/frontend/finger/spi", headers=_HEADERS)
        return r.json().get("data", {}).get("b_3", "") or ""
    except Exception:
        return ""


async def _search(keyword: str, limit: int) -> list[dict]:
    # trust_env=False：忽略系统/Clash 代理，直连 B 站（国内服务，走代理反而失败）
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, trust_env=False) as client:
        buvid = await _fetch_buvid(client)
        if buvid:
            client.cookies.set("buvid3", buvid, domain=".bilibili.com")
        img, sub = await _get_wbi_keys(client)
        if not (img and sub):
            raise RuntimeError("wbi keys unavailable")
        params = _sign(
            {"search_type": "video", "keyword": keyword, "page": 1, "page_size": 20},
            img,
            sub,
        )
        r = await client.get(
            "https://api.bilibili.com/x/web-interface/wbi/search/type",
            params=params,
            headers=_HEADERS,
        )
        body = r.json()
        if body.get("code") != 0:
            raise RuntimeError(f"bili code={body.get('code')} msg={body.get('message')}")
        result = (body.get("data", {}) or {}).get("result", []) or []
        videos: list[dict] = []
        for it in result:
            if it.get("type") != "video" or not it.get("bvid"):
                continue
            pic = it.get("pic") or ""
            if pic.startswith("//"):
                pic = "https:" + pic
            videos.append(
                {
                    "bvid": it["bvid"],
                    "title": _strip_html(it.get("title")),
                    "author": it.get("author") or "",
                    "cover": pic,
                    "play": it.get("play") or 0,
                    "duration": it.get("duration") or "",
                    "url": f"https://www.bilibili.com/video/{it['bvid']}",
                    "_search_text": " ".join(
                        str(it.get(field) or "")
                        for field in ("title", "description", "tag", "author")
                    ),
                }
            )
            if len(videos) >= limit:
                break
        return videos


@router.post("/videos")
async def videos(req: VideosRequest):
    kw = req.keyword.strip()
    concept_title = (req.concept_title or "").strip() or None
    course_name = (req.course_name or "").strip() or None
    resolved_query = _resolve_query(kw, concept_title)
    core_terms = _core_terms(kw, concept_title, resolved_query)
    queries = _candidate_queries(resolved_query, core_terms, concept_title, course_name)

    cache_key = f"{kw}:{concept_title or ''}:{course_name or ''}:{req.limit}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]

    fallback = {
        "ok": False,
        "videos": [],
        "search_url": _search_url(resolved_query),
        "resolved_query": resolved_query,
    }
    if safe_offline_enabled():
        return {**fallback, "source_state": "safe_offline"}
    try:
        batches = await asyncio.gather(*(_search(query, 20) for query in queries), return_exceptions=True)
        candidates: dict[str, dict] = {}
        for batch in batches:
            if isinstance(batch, Exception):
                continue
            for video in batch:
                candidates.setdefault(video["bvid"], video)

        vids = _rank_videos(list(candidates.values()), core_terms, course_name, req.limit)
        payload = {
            "ok": bool(vids),
            "videos": vids,
            "search_url": _search_url(resolved_query),
            "resolved_query": resolved_query,
            "match_level": vids[0]["match_level"] if vids else "fallback",
        }
    except Exception:
        payload = fallback

    # 只缓存成功结果，失败下次重试
    if payload["ok"]:
        _CACHE[cache_key] = (time.time(), payload)
    return payload
