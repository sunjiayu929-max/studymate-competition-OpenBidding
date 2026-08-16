"""ReadingAgent —— 拓展阅读推荐。

输出 3-5 条结构化推荐（书/论文/博客/视频/文档），按画像调难度。
- 真实 LLM：chat_structured JSON
- mock 兜底：3 条通用机器学习资料
- 流式：模拟"组装中"文本，让 timeline 有进度感
"""
from __future__ import annotations
import asyncio
import json
import re

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


VALID_TYPES = {"book", "paper", "blog", "video", "doc"}
VALID_DIFFICULTIES = {"入门", "进阶", "深入"}
VALID_LANGS = {"zh", "en"}

_XFYUN_OFFICIAL_DOCS = (
    {
        "keywords": ("语音识别", "语音听写", "语音转文字", "asr", "speech recognition"),
        "title": "讯飞语音听写（流式版）WebAPI 文档",
        "url": "https://www.xfyun.cn/doc/asr/voicedictation/API.html",
        "summary": "讯飞开放平台官方语音识别接口说明与调用示例",
    },
    {
        "keywords": ("语音合成", "文字转语音", "tts", "text to speech"),
        "title": "讯飞在线语音合成 API 文档",
        "url": "https://www.xfyun.cn/doc/tts/online_tts/API.html",
        "summary": "讯飞开放平台官方语音合成接口说明与参数示例",
    },
    {
        "keywords": ("星火", "大模型", "生成式人工智能", "生成式ai", "llm", "prompt", "提示词"),
        "title": "讯飞星火认知大模型 WebSocket API 文档",
        "url": "https://www.xfyun.cn/doc/spark/Web.html",
        "summary": "讯飞开放平台官方大模型接口、鉴权与流式调用说明",
    },
    {
        "keywords": ("ocr", "文字识别", "手写识别", "图像文字"),
        "title": "讯飞手写文字识别 API 文档",
        "url": "https://www.xfyun.cn/doc/words/wordRecg/API.html",
        "summary": "讯飞开放平台官方文字识别接口与请求示例",
    },
)


class ReadingAgent(AgentBase):
    meta = AgentMeta(
        id="reading",
        name="拓展阅读 Agent",
        icon="📚",
        color="sky",
        description="按画像推荐书籍/论文/博客/视频",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "岗位任务")
        profile = context.get("profile", {})
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        persona = course_cfg.persona if course_cfg else f"{course_name}岗位训练助理"
        sources = course_cfg.reading_sources if course_cfg else []

        if not has_llm_key():
            items = self._mock_items(topic, course_name, sources)
        else:
            try:
                items = await self._gen_real(topic, profile, persona, course_name, sources)
                if not items:
                    raise ValueError("empty items")
            except Exception:
                items = self._mock_items(topic, course_name, sources)

        items = self._prefer_verified_sources(topic, items)

        # 模拟流式：吐一段"正在筛选..."文字给 timeline
        msg = f"为你筛选 {len(items)} 份《{topic}》相关材料 →\n"
        for ch in msg:
            await self.emit_delta(emit, ch, kind="text")
            await asyncio.sleep(0.012)

        return {
            "type": "reading",
            "title": f"《{topic}》拓展阅读",
            "items": items,
            "count": len(items),
        }

    async def _gen_real(self, topic: str, profile: dict, persona: str, course_name: str, sources: list[str]) -> list[dict]:
        llm = get_llm_client()
        src_hint = "、".join(sources) if sources else "公开权威教材与文档"
        sys = f"""你是一位{persona}，请依据“{course_name}”岗位知识库，为任务或能力点「{topic}」推荐拓展阅读材料。

输出**严格 JSON**（不要 Markdown 包裹），结构：
{{
  "items": [
    {{
      "title": "推荐资源标题",
      "type": "book|paper|blog|video|doc 之一",
      "lang": "zh|en（该资源本身的语言：中文资源 zh，英文资源 en）",
      "url": "仅官方文档可给 HTTPS 原文链接；论文、书籍、博客和视频一律留空字符串",
      "source": "出处/作者/平台",
      "difficulty": "入门|进阶|深入 之一",
      "summary": "30字内说明为什么推荐这份（关联画像）"
    }}
  ]
}}

要求：
1. **数量要足、类型要全（共 8-10 条，宁多勿少，每类多给几条）**：
   - 书籍(book)：**至少 1 本中文 + 1 本英文**（中英文教材都要有）
   - 论文(paper)：**至少 1 篇中文(lang=zh) + 1 篇英文(lang=en)**（中英文论文都要有，可各给 2 篇）
   - 博客(blog)：2-3 篇，**以中文为主**（如 CSDN / 掘金 / 知乎 / 博客园 等知名平台）
   - 文档(doc) / 视频(video)：各 1 条左右作补充
2. **优先来自“{course_name}”岗位知识库关联的经典材料**：{src_hint}
3. **根据学生画像调难度**：knowledge_base 低 → 多入门资料；高 → 多论文/进阶博客
4. **薄弱点优先**：weak_points 里的主题，对应的资料要排前面
5. **资源偏好**：preference.reading 高就多推阅读类，video 高就多推视频
6. **不要给论文/书籍/博客/视频的 url**：系统会按用户选定主题生成稳定搜索入口；这些类型一律留空字符串。只有可信官方文档(doc)可填写 HTTPS 原文链接
7. **不要虚构热度或身份**：未经过平台验证时，不要在 title / source / summary 中声称“高赞回答”“热门文章”“官方视频”或具体作者身份

**语言要求（必须严格遵守）**：
- lang 必须如实标注资源本身语言：中文资源 zh，英文资源 en（书籍同样要标：中文书 zh，英文书 en）
- 英文资源 title 用英文原名（如书 "Pattern Recognition and Machine Learning"、论文 "Attention Is All You Need"）；中文资源 title 用中文
- source / summary 一律用**简体中文**（即使是英文书/英文论文，推荐理由也必须用中文）
- difficulty 必须是「入门 / 进阶 / 深入」三选一
- 即使输入主题是英文（如 "K-Means"），summary 等说明文字也必须用简体中文

学生画像参考：{json.dumps(profile, ensure_ascii=False)}
"""
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": f"主题：{topic}"}]
        raw = await llm.chat_structured(messages=msgs, temperature=0.5)
        data = json.loads(raw)
        items = data.get("items", [])
        return [self._normalize(it) for it in items if isinstance(it, dict)][:12]

    @staticmethod
    def _verified_xfyun_items(topic: str) -> list[dict]:
        normalized = re.sub(r"\s+", " ", (topic or "").strip().lower())
        if not normalized:
            return []
        return [
            {
                "title": resource["title"],
                "type": "doc",
                "lang": "zh",
                "url": resource["url"],
                "source": "讯飞开放平台",
                "difficulty": "进阶",
                "summary": resource["summary"],
            }
            for resource in _XFYUN_OFFICIAL_DOCS
            if any(keyword in normalized for keyword in resource["keywords"])
        ]

    @classmethod
    def _prefer_verified_sources(cls, topic: str, items: list[dict]) -> list[dict]:
        """稳定官方原文排在模型推荐之前，并按 URL/标题去重。"""
        combined = [*cls._verified_xfyun_items(topic), *items]
        preferred: list[dict] = []
        seen: set[str] = set()
        for item in combined:
            url = str(item.get("url") or "").strip().lower()
            title = re.sub(r"\s+", "", str(item.get("title") or "")).lower()
            key = f"url:{url}" if url else f"title:{title}"
            if not title or key in seen:
                continue
            seen.add(key)
            preferred.append(item)
        return preferred[:12]

    @staticmethod
    def _guess_lang(title: str, given) -> str:
        """lang 缺省/非法时按标题猜：字母里 ASCII 占比高 → 英文，否则中文。"""
        if given in VALID_LANGS:
            return given
        letters = [c for c in title if c.isalpha()]
        if letters and sum(1 for c in letters if c.isascii()) / len(letters) > 0.7:
            return "en"
        return "zh"

    @staticmethod
    def _normalize(it: dict) -> dict:
        t = it.get("type", "blog")
        if t not in VALID_TYPES:
            t = "blog"
        d = it.get("difficulty", "进阶")
        if d not in VALID_DIFFICULTIES:
            d = "进阶"
        title = str(it.get("title", ""))[:80]
        # 论文/书籍/博客/视频一律走前端确定性搜索；仅保留 HTTPS 官方文档候选。
        candidate_url = str(it.get("url") or "").strip()
        url = candidate_url[:500] if t == "doc" and candidate_url.startswith("https://") else ""
        return {
            "title": title,
            "type": t,
            "lang": ReadingAgent._guess_lang(title, it.get("lang")),
            "url": url,
            "source": str(it.get("source", ""))[:40],
            "difficulty": d,
            "summary": str(it.get("summary", ""))[:60],
        }

    def _mock_items(self, topic: str, course_name: str = "机器学习", sources: list[str] | None = None) -> list[dict]:
        # 优先用 cfg.reading_sources 的前两个，凑 4 条；缺少时用通用兜底
        srcs = sources or []
        primary = srcs[0] if srcs else f"《{course_name}》教材"
        secondary = srcs[1] if len(srcs) >= 2 else "经典在线文档"
        return [
            {
                "title": f"{primary} —《{topic}》章节",
                "type": "book", "lang": "zh", "url": "",
                "source": primary, "difficulty": "入门",
                "summary": f"{course_name}经典中文教材，适合打基础",
            },
            {
                "title": f"Foundations of {topic}",
                "type": "book", "lang": "en", "url": "",
                "source": "经典英文教材", "difficulty": "进阶",
                "summary": "英文原版教材，系统、严谨、可查权威定义",
            },
            {
                "title": f"{topic} 研究综述",
                "type": "paper", "lang": "zh", "url": "",
                "source": "中文核心期刊", "difficulty": "进阶",
                "summary": "中文综述，快速建立全局认识",
            },
            {
                "title": f"A Survey on {topic}",
                "type": "paper", "lang": "en", "url": "",
                "source": "arXiv", "difficulty": "深入",
                "summary": "英文经典综述，了解前沿与原始定义",
            },
            {
                "title": f"图解 {topic}",
                "type": "blog", "lang": "zh", "url": "",
                "source": "CSDN", "difficulty": "进阶",
                "summary": "可视化讲解，直觉理解神器",
            },
            {
                "title": f"{topic} 入门笔记",
                "type": "blog", "lang": "zh", "url": "",
                "source": "知乎专栏", "difficulty": "入门",
                "summary": "通俗中文博客，从零开始讲清楚",
            },
            {
                "title": f"{secondary} - {topic}",
                "type": "doc", "lang": "zh", "url": "",
                "source": secondary, "difficulty": "进阶",
                "summary": "权威文档/API 参考，含实战示例",
            },
            {
                "title": f"B 站精讲 - {topic}",
                "type": "video", "lang": "zh", "url": "",
                "source": "B 站", "difficulty": "入门",
                "summary": "高质量讲解视频，配合教材一起看",
            },
        ]
