"""把 Markdown 与常见数学记号转换成语音合成更容易朗读的中文文本。"""
from __future__ import annotations

import re
import unicodedata

_LATEX_WORDS = {
    "alpha": "阿尔法",
    "beta": "贝塔",
    "gamma": "伽马",
    "delta": "德尔塔",
    "epsilon": "艾普西龙",
    "theta": "西塔",
    "lambda": "拉姆达",
    "mu": "缪",
    "pi": "派",
    "sigma": "西格玛",
    "phi": "斐",
    "omega": "欧米伽",
    "eta": "伊塔",
    "nabla": "梯度",
    "partial": "偏导数",
    "sum": "求和",
    "prod": "连乘",
    "int": "积分",
    "infty": "无穷",
    "cdot": "乘以",
    "times": "乘以",
    "div": "除以",
    "pm": "加减",
    "le": "小于等于",
    "leq": "小于等于",
    "ge": "大于等于",
    "geq": "大于等于",
    "ne": "不等于",
    "neq": "不等于",
    "approx": "约等于",
    "to": "趋近于",
    "rightarrow": "得到",
    "leftarrow": "更新为",
}

_SYMBOL_WORDS = {
    "←": " 更新为 ",
    "→": " 得到 ",
    "⇒": " 推出 ",
    "↔": " 等价于 ",
    "−": " 减去 ",
    "–": " 减去 ",
    "×": " 乘以 ",
    "·": " 乘以 ",
    "÷": " 除以 ",
    "±": " 加减 ",
    "≤": " 小于等于 ",
    "≥": " 大于等于 ",
    "≠": " 不等于 ",
    "≈": " 约等于 ",
    "∞": " 无穷 ",
    "∑": " 求和 ",
    "∏": " 连乘 ",
    "∫": " 积分 ",
    "∂": " 偏导数 ",
    "∇": " 梯度 ",
    "√": " 根号 ",
    "∈": " 属于 ",
    "∉": " 不属于 ",
    "∩": " 交集 ",
    "∪": " 并集 ",
    "θ": " 西塔 ",
    "η": " 伊塔 ",
    "α": " 阿尔法 ",
    "β": " 贝塔 ",
    "γ": " 伽马 ",
    "δ": " 德尔塔 ",
    "ε": " 艾普西龙 ",
    "λ": " 拉姆达 ",
    "μ": " 缪 ",
    "π": " 派 ",
    "σ": " 西格玛 ",
    "φ": " 斐 ",
    "ω": " 欧米伽 ",
    "²": " 的平方 ",
    "³": " 的立方 ",
}


def _replace_latex_structures(text: str) -> str:
    previous = None
    while previous != text:
        previous = text
        text = re.sub(
            r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}",
            r"\1 除以 \2",
            text,
        )
        text = re.sub(r"\\sqrt\s*\{([^{}]+)\}", r"根号 \1", text)
    text = re.sub(r"\^\s*\{?\s*2\s*\}?", " 的平方 ", text)
    text = re.sub(r"\^\s*\{?\s*3\s*\}?", " 的立方 ", text)
    text = re.sub(r"\^\s*\{([^{}]+)\}", r" 的 \1 次方 ", text)
    text = re.sub(r"_\s*\{([^{}]+)\}", r" 下标 \1 ", text)
    return text


def prepare_tts_text(raw: str, max_length: int = 8000) -> str:
    """保留公式含义，同时移除容易让 TTS 拒绝或逐字符乱读的标记。"""
    text = unicodedata.normalize("NFC", raw or "")
    text = re.sub(r"```[\s\S]*?```", " 此处省略代码块。 ", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}(?:#{1,6}|[-*+])\s+", "", text)
    text = text.replace("$$", " ").replace("$", " ")
    text = text.replace(r"\(", " ").replace(r"\)", " ")
    text = text.replace(r"\[", " ").replace(r"\]", " ")

    # 最常见的梯度写法先按语义整体转换，避免朗读成“梯度西塔 J 西塔”。
    text = re.sub(
        r"(?:\\nabla|∇)\s*_?\s*\{?(?:\\theta|θ)\}?\s*([A-Za-z])\s*\(\s*(?:\\theta|θ)\s*\)",
        lambda match: f"{match.group(1)} 关于西塔的梯度",
        text,
    )
    text = _replace_latex_structures(text)
    text = re.sub(
        r"\\(" + "|".join(sorted(_LATEX_WORDS, key=len, reverse=True)) + r")\b",
        lambda match: f" {_LATEX_WORDS[match.group(1)]} ",
        text,
    )
    text = re.sub(r"\\(?:left|right|mathrm|mathbf|text)\b", " ", text)
    text = re.sub(r"\\([A-Za-z]+)", r" \1 ", text)

    for symbol, spoken in _SYMBOL_WORDS.items():
        text = text.replace(symbol, spoken)

    text = re.sub(r"\s*=\s*", " 等于 ", text)
    text = re.sub(r"(?<=\w)\s*\+\s*(?=\w)", " 加 ", text)
    text = re.sub(r"(?<=\w)\s+-\s+(?=\w)", " 减去 ", text)
    text = re.sub(r"(?<=\w)\s*/\s*(?=\w)", " 除以 ", text)
    text = re.sub(r"(?<=\w)\s*\*\s*(?=\w)", " 乘以 ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"[#*_>~|]", " ", text)
    text = re.sub(r"\s+([,，。！？!?;；:：])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length].strip()
