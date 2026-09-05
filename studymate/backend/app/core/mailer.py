from email.message import EmailMessage

import aiosmtplib

from app.core.config import require_external_access, settings


async def send_verification_code(email: str, code: str) -> None:
    require_external_access("SMTP")
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        raise RuntimeError("邮件服务未配置，请先在 .env 填写 SMTP 发件账号和授权凭据")

    sender = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    message = EmailMessage()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{sender}>"
    message["To"] = email
    message["Subject"] = "因材智训邮箱验证码"
    message.set_content(
        f"你的验证码是：{code}\n\n"
        f"验证码 {settings.EMAIL_CODE_EXPIRE_MINUTES} 分钟内有效，请勿转发给他人。\n"
        "如果不是你本人操作，请忽略本邮件。"
    )

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        use_tls=settings.SMTP_USE_SSL,
        timeout=15,
    )
