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

from app.courses import COURSES
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
_ROLE_COURSE_ANCHORS: dict[str, tuple[str, ...]] = {
    "FDE 岗位知识库": ("FDE", "前线部署", "现场部署", "交付验收", "需求澄清"),
    "AI Agent 开发工程师 岗位知识库": ("AI Agent", "Agent", "工具调用", "工作流", "评测"),
    "AI Infra 工程师 岗位知识库": ("AI Infra", "训练平台", "推理服务", "资源调度", "监控"),
    "具身智能算法工程师 岗位知识库": ("具身智能", "感知", "运动规划", "控制", "仿真"),
    "大模型安全工程师 岗位知识库": ("大模型安全", "提示注入", "数据泄露", "权限", "红队评测"),
    "大模型应用开发工程师 岗位知识库": ("大模型应用", "RAG", "Agent", "向量检索", "评测"),
    "软件供应链安全工程师（DevSecOps） 岗位知识库": ("DevSecOps", "SSDF", "SBOM", "SLSA", "漏洞响应"),
    "企业 RAG 应用实施工程师 岗位知识库": ("企业 RAG", "切分", "混合检索", "引用", "RAG 评测"),
    "MLOps 工程师 岗位知识库": ("MLOps", "实验追踪", "流水线", "模型注册", "模型漂移"),
    "AI-native 应用前端开发工程师 岗位知识库": ("AI-native", "流式交互", "Agent 界面", "RAG 引用", "端侧推理"),
    "工业互联网架构师 岗位知识库": ("工业互联网", "平台架构", "工业协议", "云边协同", "数据治理"),
    "工业数据工程师 岗位知识库": ("工业数据", "数据采集", "数据清洗", "时序数据", "数据治理"),
    "边缘计算 AI 工程师 岗位知识库": ("边缘计算", "模型压缩", "边缘部署", "性能", "运维"),
    "工业 AI 视觉工程师 岗位知识库": ("工业 AI 视觉", "缺陷数据", "模型训练", "视觉部署", "现场验收"),
    "工业互联网网络集成工程师 岗位知识库": ("工业互联网", "网络规划", "工业协议", "设备接入", "联调"),
    "MES工程师 岗位知识库": ("MES", "生产追溯", "ERP 集成", "OPC UA", "设备数据采集"),
    "多模态大模型算法工程师 岗位知识库": ("多模态大模型", "视觉语言模型", "工业视觉", "模型训练", "评测部署"),
    "工业 AI Agent应用工程师 岗位知识库": ("工业 AI Agent", "工业知识库", "工具调用", "RAG", "评测"),
    "智能制造工程师（软件） 岗位知识库": ("智能制造", "工业软件", "云边协同", "数据集成", "交付验证"),
    "物联网专项开发 岗位知识库": ("工业物联网", "MQTT", "OPC UA", "设备接入", "边缘开发"),
}
_TECH_TERMS = (
    "cpu", "取指", "译码", "执行", "指令周期", "流水线", "cache", "缓存", "直接映射", "组相联", "全相联", "中断", "总线",
    "梯度下降", "反向传播", "神经网络", "决策树", "随机森林", "支持向量机", "机器学习",
    "快速排序", "归并排序", "二叉树", "哈希表", "动态规划", "图遍历", "最短路径", "数据结构",
    "进程", "线程", "死锁", "调度", "虚拟内存", "页面置换", "文件系统", "操作系统",
    "tcp", "udp", "三次握手", "四次挥手", "拥塞控制", "路由", "dns", "网络协议",
    "agent", "工具调用", "工作流", "rag", "向量检索", "提示注入", "数据泄露", "权限", "红队评测",
    "训练平台", "推理服务", "资源调度", "实验追踪", "模型注册", "模型漂移", "sbom", "slsa", "ssdf",
    "工业协议", "云边协同", "时序数据", "模型压缩", "边缘部署", "缺陷数据", "设备接入", "联调",
)
_OFF_TOPIC_TERMS = (
    "宝可梦", "脑叶公司", "王者荣耀", "原神", "我的世界", "指令方块",
    "游戏", "攻略", "道具",
)
_QUERY_FILLER_TERMS = (
    "请帮我", "帮我", "讲解", "解释", "介绍", "什么是", "是什么", "为什么", "怎么", "如何",
    "工作原理", "原理", "过程", "岗位知识库", "用户提供资料", "已导入", "岗位训练", "岗位能力",
)
_GENERIC_TOPIC_TERMS = {"岗位", "知识库", "工程师", "开发", "应用", "课程", "教程", "学习", "资料", "内容"}


def _search_url(keyword: str) -> str:
    return f"https://search.bilibili.com/all?keyword={quote(keyword)}"


def _mixin_key(img: str, sub: str) -> str:
    raw = img + sub
    return "".join(raw[i] for i in _MIXIN_TAB if i < len(raw))[:32]


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").replace("&quot;", '"').strip()


def _normalize_text(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff+#]+", "", value or "").lower()


def _clean_topic_text(value: str) -> str:
    text = str(value or "").strip()
    for filler in _QUERY_FILLER_TERMS:
        text = text.replace(filler, " ")
    text = re.sub(r"[：:，。！？?、/|·（）()【】\[\]{}]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _course_anchor_terms(course_name: str | None) -> list[str]:
    """返回岗位检索锚点；未知自建库也能从名称得到最低限度约束。"""
    name = (course_name or "").strip()
    if not name:
        return []
    anchors = list(_ROLE_COURSE_ANCHORS.get(name) or _COURSE_ANCHORS.get(name) or ())
    course_cfg = COURSES.get(name)
    if course_cfg:
        anchors.extend(course_cfg.sample_topics[:4])
        anchors.extend(re.split(r"[/·；;]", course_cfg.syllabus_hint or ""))
    if not anchors:
        anchors.extend(re.findall(r"[a-zA-Z][a-zA-Z0-9+#-]{2,}|[\u4e00-\u9fff]{2,8}", _clean_topic_text(name)))
    result: list[str] = []
    generic = {_normalize_text(item) for item in _GENERIC_TOPIC_TERMS}
    for value in anchors:
        cleaned = _clean_topic_text(value)
        compact = _normalize_text(cleaned)
        if not compact or compact in generic or len(compact) < 2:
            continue
        if cleaned not in result:
            result.append(cleaned)
    return result[:8]


def _resolve_query(keyword: str, concept_title: str | None) -> str:
    source = (concept_title or keyword).strip()
    normalized = _normalize_text(source)
    if "取指" in normalized or "指令周期" in normalized:
        return "取指 译码 执行"
    cleaned = re.sub(
        r"请|帮我|讲解|解释|介绍|什么是|是什么|为什么|怎么|如何|工作原理|原理|过程|岗位知识库|用户提供资料|已导入",
        " ",
        source,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，。！？?：:")
    return cleaned[:80] or source[:80]


def _compose_search_query(topic_query: str, course_name: str | None) -> str:
    """把岗位锚点放进公开搜索地址，打开后仍然是同一岗位主题。"""
    topic = _clean_topic_text(topic_query) or topic_query.strip()
    anchors = _course_anchor_terms(course_name)
    if not anchors:
        return topic[:80]
    normalized_topic = _normalize_text(topic)
    additions = [anchor for anchor in anchors[:2] if _normalize_text(anchor) not in normalized_topic]
    return " ".join([topic, *additions])[:80]


def _core_terms(keyword: str, concept_title: str | None, resolved_query: str) -> list[str]:
    source = " ".join(filter(None, (keyword, concept_title or "", resolved_query)))
    combined = _normalize_text(source)
    terms = [term for term in _TECH_TERMS if _normalize_text(term) in combined]
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#]{2,20}", source):
        token = token.lower()
        if token not in terms:
            terms.append(token)
    # 主题中的中文短语保留为独立命中项，过滤“岗位/工程师”等泛词。
    for chunk in re.findall(r"[\u4e00-\u9fff]{2,}", _clean_topic_text(source)):
        for part in re.split(r"岗位|知识库|工程师|开发|应用|课程|教程|学习|资料|内容|如何|为什么|什么|以及|与|和|的|中|从|到|形成|建立|实现|进行", chunk):
            part = part.strip()
            if len(part) >= 2 and part not in _GENERIC_TOPIC_TERMS and part not in terms:
                terms.append(part)
    return list(dict.fromkeys(terms))[:12]


def _relevance_score(video: dict, core_terms: list[str], course_name: str | None, topic_phrases: list[str]) -> tuple[int, int, int, bool]:
    text = _normalize_text(str(video.get("_search_text") or video.get("title") or ""))
    hits = sum(1 for term in core_terms if _normalize_text(term) in text)
    score = hits * 3
    anchors = _course_anchor_terms(course_name)
    anchor_hits = sum(1 for anchor in anchors if _normalize_text(anchor) in text)
    def exact_phrase(phrase: str) -> bool:
        compact = _normalize_text(phrase)
        min_len = 3 if re.fullmatch(r"[a-z0-9+#]+", compact or "") else 4
        return len(compact) >= min_len and compact in text

    exact = any(exact_phrase(phrase) for phrase in topic_phrases)
    score += min(anchor_hits, 3) * 2 + (5 if exact else 0)
    if any(_normalize_text(term) in text for term in _OFF_TOPIC_TERMS):
        score -= 8
    return score, hits, anchor_hits, exact


def _rank_videos(
    candidates: list[dict],
    core_terms: list[str],
    course_name: str | None,
    topic_phrases: list[str] | int,
    limit: int | None = None,
) -> list[dict]:
    # Keep the pre-topic-phrase helper signature working for internal callers
    # while the endpoint uses phrase-aware ranking.
    legacy_signature = limit is None
    if limit is None:
        if not isinstance(topic_phrases, int):
            raise TypeError("limit is required when topic_phrases is provided")
        limit = topic_phrases
        topic_phrases = []
    ranked: list[tuple[int, int, int, dict]] = []
    for video in candidates:
        search_text = _normalize_text(str(video.get("_search_text") or video.get("title") or ""))
        if any(_normalize_text(term) in search_text for term in _OFF_TOPIC_TERMS):
            continue
        score, hits, anchor_hits, exact = _relevance_score(video, core_terms, course_name, topic_phrases)
        if legacy_signature:
            # Older callers did not provide explicit phrases; preserve their
            # two-term matching semantics without changing endpoint ranking.
            exact = hits >= min(2, len(core_terms))
        anchors = _course_anchor_terms(course_name)
        role_context = bool(course_name and ("岗位知识库" in course_name or course_name not in _COURSE_ANCHORS))
        anchor_ok = not anchors or not role_context or anchor_hits > 0
        if legacy_signature:
            matched_specific_term = any(
                _normalize_text(term) in search_text
                and _normalize_text(term) not in {_normalize_text(item) for item in _GENERIC_TOPIC_TERMS}
                and len(_normalize_text(term)) >= 2
                for term in core_terms
            )
            # Older internal callers allow one explicit knowledge term as a
            # related supplement; the public endpoint keeps the stricter rule.
            enough_terms = anchor_ok and hits >= 1 and (exact or hits >= 2 or matched_specific_term)
            minimum_score = 3
        else:
            # 完整知识点命中，或至少两个主题词命中；单个泛词不再足以入选。
            enough_terms = anchor_ok and ((exact and hits >= 1) or hits >= 2)
            minimum_score = 6
        if enough_terms and score >= minimum_score:
            match_level = "exact" if exact else "related"
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
    anchors = _course_anchor_terms(course_name)
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
        # 长短语搜索偶尔没有结果；保留一个主知识词作为补充检索，
        # 最终仍由本地相关度和跑题词过滤。
        queries.append(broad_term)
    if concept_title and concept_title != resolved_query:
        queries.append(f"{concept_title} {anchors[0]}" if anchors else concept_title)
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
                        for field in ("title", "description", "tag")
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
    topic_query = _resolve_query(kw, concept_title)
    search_query = _compose_search_query(topic_query, course_name)
    core_terms = _core_terms(kw, concept_title, topic_query)
    topic_phrases = [
        _clean_topic_text(value)
        for value in (concept_title, kw, topic_query)
        if value and _clean_topic_text(value)
    ]
    queries = _candidate_queries(topic_query, core_terms, concept_title, course_name)

    cache_key = f"{kw}:{concept_title or ''}:{course_name or ''}:{req.limit}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]

    fallback = {
        "ok": False,
        "videos": [],
        "search_url": _search_url(search_query),
        "resolved_query": search_query,
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

        vids = _rank_videos(list(candidates.values()), core_terms, course_name, topic_phrases, req.limit)
        payload = {
            "ok": bool(vids),
            "videos": vids,
            "search_url": _search_url(search_query),
            "resolved_query": search_query,
            "match_level": vids[0]["match_level"] if vids else "fallback",
        }
    except Exception:
        payload = fallback

    # 只缓存成功结果，失败下次重试
    if payload["ok"]:
        _CACHE[cache_key] = (time.time(), payload)
    return payload
