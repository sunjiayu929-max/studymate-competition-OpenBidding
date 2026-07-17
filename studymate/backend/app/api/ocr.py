"""拍照识题：图片 → Qwen-VL 视觉模型 → 提取一个学习主题。

为什么用 qwen-vl 而非讯飞 OCR：讯飞 OCR 是独立 SKU，本账号未授权
（实测 code 11201 licc failed）。而 qwen-vl（DashScope，复用 QWEN_API_KEY）
本就接好（见 tutor.py / profile_agent.py），既能识字又能直接理解题意输出
干净主题，公式/手写更稳，且全栈国产。前端 compressImage 已把图压到 ~768px。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.llm import get_llm_client, has_llm_key

router = APIRouter(prefix="/ocr", tags=["ocr"])

_TOPIC_PROMPT = (
    "你是学习助手的「拍照识题」模块。用户拍了一张照片（可能是题目、课本、笔记或板书）。"
    "请仔细看图，提炼出其中最核心的【一个学习主题或知识点】，用来驱动后续的学习资料生成。"
    "要求：只输出主题本身，简洁准确，不超过 20 字；不要解释、不要标点收尾、不要任何前缀。"
    "若图中是一道题，输出这道题考查的知识点；若是概念定义，直接输出概念名。"
)


class OcrTopicRequest(BaseModel):
    # data URL 或纯 base64；前端 compressImage 产出 data:image/jpeg;base64,...
    image: str


class OcrTopicResponse(BaseModel):
    topic: str


_TEXT_PROMPT = (
    "你是「拍照识字」模块。请把这张图片里的文字**完整、忠实地**转写为纯文本，"
    "用于插入用户的笔记。要求：保留原有换行与分段；公式用通俗的纯文本数学记号转写"
    "（如 a^2、sqrt(x)、∑），不要用 LaTeX 反斜杠；只输出转写内容本身，"
    "不要任何解释、标题或「以下是识别结果」之类的前缀。若图中没有文字，输出空。"
)


class OcrTextRequest(BaseModel):
    image: str


class OcrTextResponse(BaseModel):
    text: str


async def _vl_recognize(image: str, prompt: str, temperature: float) -> str:
    """图片 + 提示词 → qwen-vl，返回原始文本。统一做凭据校验与异常包装。"""
    image = (image or "").strip()
    if not image:
        raise HTTPException(status_code=400, detail="缺少图片")
    if not has_llm_key("qwen-vl"):
        raise HTTPException(status_code=503, detail="视觉识图未配置：在 .env 设 QWEN_API_KEY")

    # qwen-vl 接受 data URL；前端传纯 base64 时补默认前缀
    url = image if image.startswith("data:") else f"data:image/jpeg;base64,{image}"
    llm = get_llm_client("qwen-vl")
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": url}},
    ]
    try:
        return await llm.chat([{"role": "user", "content": content}], temperature=temperature)
    except Exception as e:  # noqa: BLE001 — 对外统一回 502，细节进日志
        raise HTTPException(status_code=502, detail=f"识图失败：{e}")


@router.post("/topic", response_model=OcrTopicResponse)
async def ocr_topic(req: OcrTopicRequest):
    raw = await _vl_recognize(req.image, _TOPIC_PROMPT, temperature=0.2)
    # 取首行、去掉模型偶尔带的标点收尾，硬截断防啰嗦
    topic = (raw or "").strip().splitlines()[0].strip().strip("。.：:，,、 ")
    if not topic:
        raise HTTPException(status_code=422, detail="未能从图片识别出主题，请换一张更清晰的照片")
    if len(topic) > 40:
        topic = topic[:40]
    return OcrTopicResponse(topic=topic)


@router.post("/text", response_model=OcrTextResponse)
async def ocr_text(req: OcrTextRequest):
    raw = await _vl_recognize(req.image, _TEXT_PROMPT, temperature=0.1)
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="未能从图片识别出文字，请换一张更清晰的照片")
    return OcrTextResponse(text=text)
