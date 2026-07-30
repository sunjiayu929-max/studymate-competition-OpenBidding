"""讯飞通用文字识别 smoke 测试 —— 联调用，跑通后再接进 app。

用法（在 backend 目录，清代理 env）：
  env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
    .venv/Scripts/python.exe -m scripts.smoke_ocr [图片路径]

默认拿仓库根的「服务器配置.jpg」当输入。打印讯飞原始响应，便于锁定格式/确认是否开通。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from urllib.parse import urlencode, urlparse

import httpx

from app.core.config import safe_offline_enabled, settings

# 通用文字识别 ability：sf8e6aca1
OCR_URL = "https://api.xf-yun.com/v1/private/sf8e6aca1"


def build_post_auth_url(url: str, api_key: str, api_secret: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path = parsed.path or "/"
    date_str = format_datetime(datetime.now(timezone.utc), usegmt=True)
    signature_origin = f"host: {host}\ndate: {date_str}\nPOST {path} HTTP/1.1"
    signature = base64.b64encode(
        hmac.new(api_secret.encode(), signature_origin.encode(), hashlib.sha256).digest()
    ).decode()
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode()).decode()
    query = urlencode({"authorization": authorization, "date": date_str, "host": host})
    return f"{url}?{query}"


def main() -> None:
    if safe_offline_enabled():
        raise SystemExit("[blocked] 安全离线模式禁止 OCR 连通性测试。")
    img_path = sys.argv[1] if len(sys.argv) > 1 else "../../服务器配置.jpg"
    app_id = settings.XFYUN_APP_ID.strip()
    api_key = settings.XFYUN_API_KEY.strip()
    api_secret = settings.XFYUN_API_SECRET.strip()
    print(
        "credentials="
        f"{'configured' if app_id and api_key and api_secret else 'MISSING'}"
    )
    if not (app_id and api_key and api_secret):
        raise SystemExit("[blocked] OCR 凭据未完整配置，不发起请求。")

    with open(img_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    enc = img_path.rsplit(".", 1)[-1].lower()
    enc = {"jpeg": "jpg"}.get(enc, enc)
    print(f"图片={img_path}  encoding={enc}  base64长度={len(img_b64)}")

    body = {
        "header": {"app_id": app_id, "status": 3},
        "parameter": {
            "sf8e6aca1": {
                "category": "ch_en_public_cloud",
                "result": {"encoding": "utf8", "compress": "raw", "format": "json"},
            }
        },
        "payload": {
            "sf8e6aca1_data_1": {"encoding": enc, "image": img_b64, "status": 3}
        },
    }

    signed_url = build_post_auth_url(OCR_URL, api_key, api_secret)
    with httpx.Client(trust_env=False, timeout=30) as client:
        resp = client.post(signed_url, json=body, headers={"Content-Type": "application/json"})
    print(f"HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception:
        print("非 JSON 响应：", resp.text[:500])
        return

    header = data.get("header", {})
    print("header:", json.dumps(header, ensure_ascii=False))
    if header.get("code") not in (0, None):
        print(">>> 讯飞返回错误码（非 0）。message=", header.get("message"))
        return

    # 解析 payload.result.text（base64 包着一段 JSON）
    text_b64 = data.get("payload", {}).get("result", {}).get("text")
    if not text_b64:
        print("未找到 payload.result.text，完整响应：")
        print(json.dumps(data, ensure_ascii=False)[:1500])
        return
    decoded = base64.b64decode(text_b64).decode("utf-8", errors="replace")
    print("===解码后的识别 JSON（前 1500 字）===")
    print(decoded[:1500])


if __name__ == "__main__":
    main()
