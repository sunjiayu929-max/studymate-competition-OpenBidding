"""安全、带缓存地访问人才呀公开课程和岗位目录。

集成只读取公开目录元数据。课程检索只发送清洗后的技术主题或课程名称，
不会发送用户标识、画像数据、对话历史或认证信息。
"""
from __future__ import annotations

import asyncio
import html
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import safe_offline_enabled


PROVIDER = "讯飞人才呀"
COURSE_PLATFORM_URL = "http://rencaiya.vip/college/allcourse"
CAREER_PLATFORM_URL = "http://rencaiya.vip/college/postcourse"
_BASE_URL = "http://rencaiya.vip/api/"
_HEADERS = {
    "User-Agent": "StudyMate/1.0 (+https://matropic.cn)",
    "Referer": COURSE_PLATFORM_URL,
}
_COURSE_TTL = 30 * 60
_JOB_TTL = 6 * 60 * 60
_STALE_TTL = 24 * 60 * 60

COURSE_ALIASES: dict[str, tuple[str, ...]] = {
    "机器学习": ("机器学习", "人工智能"),
    "数据结构与算法": ("数据结构", "算法"),
    "操作系统": ("操作系统", "Linux"),
    "计算机网络": ("通信", "网络"),
    "计算机组成原理": ("计算机硬件", "硬件"),
}

_DIFFICULTY = {
    "0": "新手",
    "1": "初级",
    "2": "中级",
    "3": "高级",
}

_COURSE_FALLBACKS: dict[str, list[dict[str, Any]]] = {
    "机器学习": [
        {"course_id": 1, "title": "机器学习基础", "summary": "从基础概念、常用算法到实践应用建立机器学习知识框架。", "difficulty": "初级"},
        {"course_id": 164, "title": "iFlyCode学习应用", "summary": "了解讯飞智能编程工具及其在学习和开发中的使用方式。", "difficulty": "初级"},
        {"course_id": 153, "title": "1+X 人工智能数据处理（中级）", "summary": "围绕人工智能数据处理与工程实践强化职业能力。", "difficulty": "中级"},
    ],
    "数据结构与算法": [
        {"course_id": 10, "title": "数据结构与算法", "summary": "学习数据的组织、存储和处理方法，并用于解决实际问题。", "difficulty": "初级"},
    ],
    "操作系统": [
        {"course_id": 75, "title": "Linux操作系统", "summary": "学习 Linux 操作系统基础、命令和系统管理。", "difficulty": "初级"},
        {"course_id": 81, "title": "Linux系统高级编程", "summary": "通过系统编程实践理解 Linux 进程、文件与并发机制。", "difficulty": "高级"},
    ],
    "计算机网络": [
        {"course_id": 71, "title": "无线组网通信", "summary": "了解物联网常用无线通信技术及应用开发。", "difficulty": "中级"},
        {"course_id": 165, "title": "WebSocket实时通信", "summary": "通过实时通信案例掌握 WebSocket 的基本应用。", "difficulty": "高级"},
    ],
    "计算机组成原理": [
        {"course_id": 256, "title": "计算机硬件基础", "summary": "认识计算机硬件组成与基础工作原理。", "difficulty": "新手"},
        {"course_id": 76, "title": "零基础入门硬件开发", "summary": "从 C 语言和基础电路出发完成硬件编程入门。", "difficulty": "初级"},
    ],
}

_JOB_FALLBACKS: list[dict[str, Any]] = [
    {"post_id": 1, "title": "运维工程师", "summary": "负责系统部署、监控、故障处理和云平台运维。", "course_count": 12},
    {"post_id": 2, "title": "物联网开发工程师", "summary": "负责嵌入式设备、通信协议和物联网应用开发。", "course_count": 8},
    {"post_id": 3, "title": "智能推荐算法工程师", "summary": "结合用户行为、画像和算法模型建设推荐系统。", "course_count": 9},
    {"post_id": 4, "title": "自然语言处理算法工程师", "summary": "负责自然语言处理模型、算法和应用落地。", "course_count": 7},
    {"post_id": 5, "title": "计算机算法工程师", "summary": "负责算法设计、建模、优化及工程实现。", "course_count": 7},
    {"post_id": 6, "title": "Java开发工程师", "summary": "负责 Java 服务端系统的设计、开发、测试和部署。", "course_count": 8},
    {"post_id": 7, "title": "前端开发工程师", "summary": "负责 Web 与移动端界面、交互和前端工程化。", "course_count": 7},
    {"post_id": 8, "title": "Python应用开发工程师", "summary": "使用 Python 完成应用、自动化和数据相关开发。", "course_count": 6},
    {"post_id": 9, "title": "大数据开发工程师", "summary": "负责数据采集、计算、存储和大数据平台建设。", "course_count": 9},
    {"post_id": 10, "title": "软件测试工程师", "summary": "负责测试设计、自动化、质量保障和问题定位。", "course_count": 7},
    {"post_id": 13, "title": "人工智能算法应用工程师", "summary": "负责人工智能算法在业务场景中的工程化应用。", "course_count": 8},
    {"post_id": 18, "title": "移动应用开发工程师", "summary": "负责移动应用设计、开发、调试和发布。", "course_count": 4},
]

_course_cache: dict[str, tuple[float, str, str, list[dict[str, Any]]]] = {}
_job_cache: tuple[float, list[dict[str, Any]]] | None = None

_TOPIC_TERMS = (
    "cpu", "取指", "译码", "执行", "指令周期", "流水线", "cache", "缓存", "直接映射", "组相联", "全相联", "中断", "总线",
    "梯度下降", "反向传播", "神经网络", "决策树", "随机森林", "支持向量机", "机器学习",
    "快速排序", "归并排序", "二叉树", "哈希表", "动态规划", "图遍历", "最短路径", "数据结构",
    "进程", "线程", "死锁", "调度", "虚拟内存", "页面置换", "文件系统", "操作系统",
    "tcp", "udp", "三次握手", "四次挥手", "拥塞控制", "路由", "dns", "网络协议",
)


def _clean_text(value: Any, max_len: int = 280) -> str:
    raw = html.unescape(str(value or ""))
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:max_len]


def _normalize_text(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff+#]+", "", value or "").lower()


def _resolve_topic_query(keyword: str | None, course_name: str) -> str:
    source = (keyword or course_name).strip()[:80]
    cleaned = re.sub(
        r"请|帮我|讲解|解释|介绍|什么是|是什么|为什么|怎么|如何|工作原理|原理|过程",
        " ",
        source,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，。！？?：:")
    return cleaned[:80] or course_name


def _topic_terms(keyword: str, resolved_query: str) -> list[str]:
    combined = _normalize_text(f"{keyword} {resolved_query}")
    terms = [term for term in _TOPIC_TERMS if _normalize_text(term) in combined]
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9+#]{1,20}", resolved_query):
        token = token.lower()
        if token not in terms:
            terms.append(token)
    compact = _normalize_text(resolved_query)
    if compact and compact not in {_normalize_text(term) for term in terms}:
        terms.append(compact)
    return list(dict.fromkeys(terms))[:8]


def _course_match_level(
    item: dict[str, Any],
    terms: list[str],
    resolved_query: str,
    course_name: str,
) -> str:
    title = _normalize_text(item.get("title") or "")
    text = _normalize_text(f"{item.get('title', '')} {item.get('summary', '')}")
    resolved = _normalize_text(resolved_query)
    if resolved and len(resolved) >= 2 and resolved in title:
        return "exact"
    hits = sum(1 for term in terms if _normalize_text(term) in text)
    if hits >= min(2, len(terms)):
        return "exact"
    if hits >= 1:
        return "related"
    aliases = COURSE_ALIASES.get(course_name) or (course_name,)
    if any(_normalize_text(alias) in text for alias in aliases):
        return "course"
    return "fallback"


def _course_affinity_score(
    item: dict[str, Any],
    terms: list[str],
    resolved_query: str,
    course_name: str,
) -> int:
    """在同一匹配层级内优先保留更贴近知识点/课程的结果。"""
    title = _normalize_text(item.get("title") or "")
    text = _normalize_text(f"{item.get('title', '')} {item.get('summary', '')}")
    resolved = _normalize_text(resolved_query)
    score = 0
    if resolved and resolved in title:
        score += 40
    elif resolved and resolved in text:
        score += 20
    for term in terms:
        normalized = _normalize_text(term)
        if not normalized:
            continue
        if normalized in title:
            score += min(len(normalized), 8) * 3
        elif normalized in text:
            score += min(len(normalized), 8)
    for alias in COURSE_ALIASES.get(course_name) or (course_name,):
        normalized = _normalize_text(alias)
        if not normalized:
            continue
        if normalized in title:
            score += min(len(normalized), 8) * 3
        elif normalized in text:
            score += min(len(normalized), 8)
    return score


def _rank_topic_courses(
    items: list[dict[str, Any]],
    terms: list[str],
    resolved_query: str,
    course_name: str,
    limit: int,
) -> tuple[str, list[dict[str, Any]]]:
    """强相关优先，并用少量最接近的同课程结果补位。"""
    rank_value = {"exact": 3, "related": 2, "course": 1, "fallback": 0}
    ranked = [
        (
            _course_match_level(item, terms, resolved_query, course_name),
            _course_affinity_score(item, terms, resolved_query, course_name),
            item,
        )
        for item in items
    ]
    ranked.sort(
        key=lambda row: (
            rank_value[row[0]],
            row[1],
            row[2]["learned_person"],
            row[2]["course_id"],
        ),
        reverse=True,
    )

    direct = [row for row in ranked if row[0] in {"exact", "related"}]
    course_level = [row for row in ranked if row[0] == "course"]
    selected = direct[:limit]
    remaining = limit - len(selected)
    if remaining > 0 and course_level:
        # 课程级结果只取最贴近当前课程名称的一小组，避免把“硬件”搜索下的
        # STM32、边缘推理等热门但偏题内容一并展示。
        best_affinity = course_level[0][1]
        close_course_rows = [row for row in course_level if row[1] >= best_affinity - 4]
        selected.extend(close_course_rows[: min(2, remaining)])

    visible = [{**item, "match_level": level} for level, _, item in selected]
    match_level = selected[0][0] if selected else "fallback"
    return match_level, visible


def _safe_cover(value: Any) -> str:
    raw = str(value or "").strip()
    try:
        parsed = urlparse(raw)
    except ValueError:
        return ""
    if parsed.scheme != "https" or parsed.hostname != "minio.rencaiya.vip":
        return ""
    if parsed.port not in {None, 8443}:
        return ""
    return raw


def _course_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    try:
        course_id = int(raw.get("courseId"))
    except (TypeError, ValueError):
        return None
    title = _clean_text(raw.get("courseName"), 120)
    if not title:
        return None
    teachers = []
    for teacher in raw.get("teachers") or []:
        if isinstance(teacher, dict):
            name = _clean_text(teacher.get("nickName"), 40)
            if name and name not in teachers:
                teachers.append(name)
    return {
        "course_id": course_id,
        "title": title,
        "summary": _clean_text(raw.get("describe") or raw.get("masterAbility")),
        "cover": _safe_cover(raw.get("cover")),
        "difficulty": _DIFFICULTY.get(str(raw.get("difficultyId")), "未标注"),
        "learned_person": max(int(raw.get("learnedPerson") or 0), 0),
        "teachers": teachers[:3],
        "provider": PROVIDER,
        "url": f"http://rencaiya.vip/college/courseinfo/{course_id}",
    }


def _job_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    try:
        post_id = int(raw.get("postId"))
    except (TypeError, ValueError):
        return None
    title = _clean_text(raw.get("postName"), 100)
    if not title:
        return None
    return {
        "post_id": post_id,
        "title": title,
        "summary": _clean_text(raw.get("describe"), 360),
        "responsibilities": _clean_text(raw.get("responsibilities"), 800),
        "requirements": _clean_text(raw.get("requirements"), 1000),
        "course_count": max(int(raw.get("courseNum") or 0), 0),
        "subject_count": max(int(raw.get("subjectNum") or 0), 0),
        "project_count": max(int(raw.get("trainingProjectNum") or 0), 0),
        "learned_person": max(int(raw.get("learnedPerson") or 0), 0),
        "provider": PROVIDER,
        "url": f"http://rencaiya.vip/college/postinfo/{post_id}",
    }


def _fallback_courses(course_name: str, limit: int) -> list[dict[str, Any]]:
    rows = _COURSE_FALLBACKS.get(course_name) or _COURSE_FALLBACKS["机器学习"]
    return [
        {
            **row,
            "cover": "",
            "learned_person": 0,
            "teachers": [],
            "provider": PROVIDER,
            "url": f"http://rencaiya.vip/college/courseinfo/{row['course_id']}",
        }
        for row in rows[:limit]
    ]


def _fallback_jobs() -> list[dict[str, Any]]:
    return [
        {
            **row,
            "responsibilities": "",
            "requirements": "",
            "subject_count": 0,
            "project_count": 0,
            "learned_person": 0,
            "provider": PROVIDER,
            "url": f"http://rencaiya.vip/college/postinfo/{row['post_id']}",
        }
        for row in _JOB_FALLBACKS
    ]


async def _fetch_course_alias(client: httpx.AsyncClient, alias: str) -> list[dict[str, Any]]:
    response = await client.post(
        "sop/course/eduOnlineCourse",
        json={
            "labelId": None,
            "difficultyId": None,
            "isfree": None,
            "courseName": alias,
            "sortBy": "hot",
            "pageNum": 1,
            "pageSize": 8,
        },
    )
    response.raise_for_status()
    body = response.json()
    if body.get("code") != 200:
        raise RuntimeError(f"rencaiya course code={body.get('code')}")
    rows = (body.get("data") or {}).get("courseList") or []
    return [item for row in rows if isinstance(row, dict) and (item := _course_item(row))]


async def get_courses(
    course_name: str,
    limit: int = 6,
    keyword: str | None = None,
) -> tuple[str, str, str, list[dict[str, Any]]]:
    now = time.time()
    resolved_query = _resolve_topic_query(keyword, course_name)
    has_topic = bool((keyword or "").strip())
    if safe_offline_enabled():
        if has_topic:
            return "safe_offline", "fallback", resolved_query, []
        return "safe_offline", "course", resolved_query, _fallback_courses(course_name, limit)
    cache_key = f"{course_name}:{_normalize_text(resolved_query)}"
    cached = _course_cache.get(cache_key)
    if cached and now - cached[0] < _COURSE_TTL:
        return "cache", cached[1], cached[2], cached[3][:limit]

    aliases = COURSE_ALIASES.get(course_name) or (course_name,)
    queries = [resolved_query, *aliases] if has_topic else list(aliases)
    queries = list(dict.fromkeys(query.strip()[:80] for query in queries if query.strip()))
    try:
        async with httpx.AsyncClient(
            base_url=_BASE_URL,
            timeout=4.5,
            follow_redirects=True,
            headers=_HEADERS,
            trust_env=False,
        ) as client:
            results = await asyncio.gather(
                *(_fetch_course_alias(client, query) for query in queries),
                return_exceptions=True,
            )
        had_success = any(not isinstance(result, Exception) for result in results)
        merged: list[dict[str, Any]] = []
        seen: set[int] = set()
        for result in results:
            if isinstance(result, Exception):
                continue
            for item in result:
                if item["course_id"] in seen:
                    continue
                seen.add(item["course_id"])
                merged.append(item)
        if had_success:
            if not has_topic:
                merged.sort(key=lambda item: (item["learned_person"], item["course_id"]), reverse=True)
                match_level = "course" if merged else "fallback"
                visible = merged
            else:
                terms = _topic_terms(keyword or "", resolved_query)
                match_level, visible = _rank_topic_courses(
                    merged,
                    terms,
                    resolved_query,
                    course_name,
                    8,
                )
            _course_cache[cache_key] = (now, match_level, resolved_query, visible)
            return "live", match_level, resolved_query, visible[:limit]
    except Exception:
        pass

    if cached and now - cached[0] < _STALE_TTL:
        return "cache", cached[1], cached[2], cached[3][:limit]
    if has_topic:
        return "fallback", "fallback", resolved_query, []
    return "fallback", "course", resolved_query, _fallback_courses(course_name, limit)


async def get_jobs() -> tuple[str, list[dict[str, Any]]]:
    global _job_cache
    if safe_offline_enabled():
        return "safe_offline", _fallback_jobs()
    now = time.time()
    if _job_cache and now - _job_cache[0] < _JOB_TTL:
        return "cache", _job_cache[1]
    try:
        async with httpx.AsyncClient(
            base_url=_BASE_URL,
            timeout=4.5,
            follow_redirects=True,
            headers=_HEADERS,
            trust_env=False,
        ) as client:
            response = await client.get("sop/post/eduGetHotStycture")
            response.raise_for_status()
            body = response.json()
        if body.get("code") != 200:
            raise RuntimeError(f"rencaiya post code={body.get('code')}")
        items = [
            item
            for raw in body.get("data") or []
            if isinstance(raw, dict) and (item := _job_item(raw))
        ]
        if items:
            _job_cache = (now, items)
            return "live", items
    except Exception:
        pass
    if _job_cache and now - _job_cache[0] < _STALE_TTL:
        return "cache", _job_cache[1]
    return "fallback", _fallback_jobs()
