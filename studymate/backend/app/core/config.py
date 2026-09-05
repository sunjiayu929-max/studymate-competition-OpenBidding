from __future__ import annotations

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.offline import install_outbound_network_guard


_TRUE_VALUES = {"1", "true", "yes", "on"}


def _safe_offline_requested() -> bool:
    """只检查进程环境；不能通过读取项目 .env 来决定是否读取项目 .env。"""
    return os.environ.get("STUDYMATE_SAFE_OFFLINE", "").strip().lower() in _TRUE_VALUES


class ExternalAccessDisabledError(RuntimeError):
    """安全离线模式下调用了外部服务入口。"""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 必须由进程环境或安全启动脚本显式开启。开启后 Settings 初始化完全跳过 .env。
    STUDYMATE_SAFE_OFFLINE: bool = False

    LLM_PROVIDER: str = "deepseek"
    TUTOR_DEFAULT_PROVIDER: str = "qwen"

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"

    SPARK_API_KEY: str = ""
    SPARK_BASE_URL: str = "https://spark-api-open.xf-yun.com/v2"
    SPARK_MODEL: str = "x1"

    MIMO_API_KEY: str = ""
    MIMO_BASE_URL: str = "https://api.xiaomimimo.com/v1"
    MIMO_MODEL: str = "mimo-v2-pro"

    # 通义千问 Qwen（阿里云 DashScope OpenAI 兼容模式）
    # 助教 /tutor 专用，与主流程 LLM_PROVIDER 解耦
    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL: str = "qwen3.7-max"
    # 通义千问 VL 视觉版（看图问答）：同一 DashScope key，仅模型不同。
    # 助教对话带图片时自动切到这个模型；纯文字仍走 QWEN_MODEL（省钱）。
    QWEN_VL_MODEL: str = "qwen-vl-max"

    # 混合检索语义分支：走 OpenAI 兼容 embedding 端点（默认复用 Qwen DashScope key）
    EMBEDDING_PROVIDER: str = "qwen"
    EMBEDDING_MODEL: str = "text-embedding-v3"
    EMBEDDING_DIM: int = 1024

    DATABASE_URL: str = "sqlite:///./studymate.db"
    CHROMA_PERSIST_DIR: str = "./data/chroma"
    # 私有知识资料原文件目录。Docker 中与数据库同处 /app/data 持久卷。
    PRIVATE_KNOWLEDGE_DIR: str = "./data/private_knowledge"
    # 当前仓库未绑定 OCR 引擎；保留明确的可插拔状态，避免把扫描 PDF 误报为解析成功。
    PRIVATE_KNOWLEDGE_OCR_MODE: str = "unconfigured"

    # 讯飞语音 ASR + TTS（与星火大模型不同 SKU，需独立开通）
    XFYUN_APP_ID: str = ""
    XFYUN_API_KEY: str = ""
    XFYUN_API_SECRET: str = ""

    # TTS 总引擎：xfyun=讯飞（在线/超拟人）；cosyvoice=阿里 CosyVoice（DashScope，音色更自然，复用 QWEN_API_KEY）
    TTS_ENGINE: str = "xfyun"
    # CosyVoice（复用 QWEN_API_KEY / DashScope；需在 DashScope 控制台开通语音合成）
    COSYVOICE_MODEL: str = "cosyvoice-v3-flash"
    COSYVOICE_VOICE: str = "longxiaochun_v3"
    # CosyVoice 专用 DashScope key 池（逗号分隔，留空则回退用 QWEN_API_KEY）。
    # 多用户高并发时填多个不同账号的 key → 请求/重试自动轮询，聚合 QPS 上限随 key 数翻倍。
    # 例：COSYVOICE_API_KEYS=sk-aaa,sk-bbb
    COSYVOICE_API_KEYS: str = ""

    # 仅供历史视频工具兼容的本地媒体目录；当前岗位可视讲解使用前端脚本播放。
    VIDEO_MEDIA_DIR: str = "./data/video_media"
    VIDEO_REQUEST_TIMEOUT_SECONDS: float = 30.0

    # 讯飞 TTS 子模式：online=在线语音合成(v2/tts)；oral=超拟人语音合成(v1 oral，音质更高)
    # 切超拟人只需把 XFYUN_TTS_MODE 设 oral 并填下面三项（凭据来自讯飞控制台「超拟人合成」服务）
    XFYUN_TTS_MODE: str = "online"
    # 超拟人服务的完整 wss 地址，形如 wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/xxxxxxxx
    # （xxxxxxxx 是控制台给你的服务路由，按实际填）
    XFYUN_ORAL_TTS_URL: str = ""
    # 超拟人默认发音人（如 x4_lingxiaoxuan_oral / x4_lingfeihao_oral，按已授权的填）
    XFYUN_ORAL_VOICE: str = "x4_lingxiaoxuan_oral"

    # Piston 在线代码沙箱（docker-compose 内同 network，默认走 piston-api:2000）
    # 本地裸跑后端时改成 http://127.0.0.1:2000
    PISTON_URL: str = "http://127.0.0.1:2000"
    PISTON_TIMEOUT_MS: int = 10000   # 单次代码运行墙钟超时(需 piston 容器 PISTON_RUN_TIMEOUT 同步放宽)

    APP_PORT: int = 8000
    APP_HOST: str = "0.0.0.0"
    CORS_ORIGINS: str = "http://localhost:5173"

    # 邮箱注册 / 登录（QQ 邮箱使用 smtp.qq.com:465 + SSL）
    SMTP_HOST: str = "smtp.qq.com"
    SMTP_PORT: int = 465
    SMTP_USE_SSL: bool = True
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""  # QQ 邮箱 SMTP 授权码，不是 QQ 密码
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "因材智训"
    EMAIL_CODE_EXPIRE_MINUTES: int = 10
    EMAIL_CODE_RESEND_SECONDS: int = 60
    EMAIL_CODE_MAX_ATTEMPTS: int = 5

    # 正式环境必须设置为随机长字符串，并启用 HTTPS Cookie。
    AUTH_SECRET_KEY: str = ""
    SESSION_EXPIRE_DAYS: int = 7
    SESSION_COOKIE_SECURE: bool = False

    # AI interview is a separately deployed service. These values are only
    # consumed server-side; the frontend never receives the integration key.
    AI_INTERVIEW_PUBLIC_URL: str = ""
    AI_INTERVIEW_SERVICE_SECRET: str = ""
    AI_INTERVIEW_TICKET_TTL_SECONDS: int = 120
    AI_INTERVIEW_SIGNATURE_TTL_SECONDS: int = 300
    AI_INTERVIEW_MAX_ACTIVE_ATTEMPTS: int = 2

    # Independent Hydro OJ integration. The secret is server-only and must
    # match STUDYMATE_SERVICE_SECRET in the OJ service environment.
    OJ_PUBLIC_URL: str = ""
    OJ_SERVICE_SECRET: str = ""
    OJ_TICKET_TTL_SECONDS: int = 120
    OJ_SIGNATURE_TTL_SECONDS: int = 300

    @model_validator(mode="after")
    def disable_external_services_in_safe_offline(self):
        """即使父进程仍带有凭据，安全离线模式也把所有外部能力视为未配置。"""
        if not self.STUDYMATE_SAFE_OFFLINE:
            return self
        for field in (
            "DEEPSEEK_API_KEY",
            "SPARK_API_KEY",
            "MIMO_API_KEY",
            "QWEN_API_KEY",
            "XFYUN_APP_ID",
            "XFYUN_API_KEY",
            "XFYUN_API_SECRET",
            "XFYUN_ORAL_TTS_URL",
            "COSYVOICE_API_KEYS",
            "SMTP_USERNAME",
            "SMTP_PASSWORD",
            "SMTP_FROM_EMAIL",
            "PISTON_URL",
            "AI_INTERVIEW_SERVICE_SECRET",
        ):
            setattr(self, field, "")
        self.PRIVATE_KNOWLEDGE_OCR_MODE = "unconfigured"
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


def safe_offline_enabled() -> bool:
    return bool(settings.STUDYMATE_SAFE_OFFLINE)


def require_external_access(service: str) -> None:
    if safe_offline_enabled():
        raise ExternalAccessDisabledError(f"安全离线模式已禁用外部服务：{service}")


# 关键边界：模式开关只接受进程环境，先决定不读取 .env，再创建 Settings。
# 显式 init 值也保证 .env 中即使误写同名变量，也不能在文件读取之后才“开启”模式。
_SAFE_OFFLINE_FROM_PROCESS = _safe_offline_requested()
settings = Settings(
    STUDYMATE_SAFE_OFFLINE=_SAFE_OFFLINE_FROM_PROCESS,
    _env_file=None if _SAFE_OFFLINE_FROM_PROCESS else ".env",
)
if settings.STUDYMATE_SAFE_OFFLINE:
    install_outbound_network_guard()
