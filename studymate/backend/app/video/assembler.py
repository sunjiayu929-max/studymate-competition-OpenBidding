"""Download and assemble generated video segments into a private media file."""
from __future__ import annotations

import asyncio
import re
import shutil
import textwrap
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.core.config import ExternalAccessDisabledError, require_external_access, settings


class VideoAssemblyError(RuntimeError):
    """An actionable video download or ffmpeg assembly failure."""


def _media_root() -> Path:
    root = Path(settings.VIDEO_MEDIA_DIR).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    return root


def media_file_path(user_id: int, file_id: str) -> Path:
    """Resolve only UUID-named files below the current user's media directory."""
    if not re.fullmatch(r"[0-9a-f-]{36}", file_id, re.IGNORECASE):
        raise VideoAssemblyError("无效的视频文件标识")
    return _media_root() / str(int(user_id)) / f"{file_id}.mp4"


def media_file_url(user_id: int, file_id: str) -> str:
    return f"/api/media/video/{int(user_id)}/{file_id}"


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds_value, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds_value:02d},{milliseconds:03d}"


def _subtitle_lines(text: str, width: int = 24) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return ""
    return "\n".join(textwrap.wrap(normalized, width=width, break_long_words=True, break_on_hyphens=False))


def _build_srt(subtitle_segments: list[dict]) -> str:
    """Create one subtitle cue per generated segment using its voiceover."""
    entries: list[str] = []
    cursor = 0.0
    for index, segment in enumerate(subtitle_segments, start=1):
        duration = max(0.1, float(segment.get("duration") or 0))
        text = _subtitle_lines(str(segment.get("voiceover") or ""))
        end = cursor + duration
        if text:
            entries.append(
                f"{index}\n{_srt_timestamp(cursor)} --> {_srt_timestamp(end)}\n{text}"
            )
        cursor = end
    return "\n\n".join(entries) + ("\n" if entries else "")


async def _download_segment(client: httpx.AsyncClient, url: str, target: Path) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise VideoAssemblyError("返回了不受支持的视频地址")
    try:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with target.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    output.write(chunk)
    except (httpx.HTTPError, OSError) as exc:
        raise VideoAssemblyError(f"下载视频片段失败：{exc}") from exc


async def assemble_video_segments(
    *,
    user_id: int,
    video_urls: list[str],
    subtitle_segments: list[dict] | None = None,
) -> dict[str, str]:
    """Download clips, burn Chinese subtitles, and concatenate them."""
    if not video_urls:
        raise VideoAssemblyError("没有可供合成的视频片段")
    if not ffmpeg_available():
        return {"status": "unavailable", "message": "当前环境未安装 ffmpeg，已保留各个视频片段"}

    # 外部视频地址属于临时资源；尊重应用的离线保护。
    try:
        require_external_access("下载视频片段")
    except ExternalAccessDisabledError as exc:
        return {"status": "unavailable", "message": str(exc)}

    job_id = uuid.uuid4().hex
    temp_dir = _media_root() / ".tmp" / job_id
    output_id = str(uuid.uuid4())
    output_path = media_file_path(user_id, output_id)
    concat_path = temp_dir / "concat.txt"
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        timeout = httpx.Timeout(settings.VIDEO_REQUEST_TIMEOUT_SECONDS)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            segment_paths: list[Path] = []
            for index, url in enumerate(video_urls, start=1):
                segment_path = temp_dir / f"segment-{index:03d}.mp4"
                await _download_segment(client, url, segment_path)
                segment_paths.append(segment_path)

        concat_path.write_text(
            "".join(
                f"file '{path.resolve().as_posix().replace(chr(39), chr(39) + chr(39) + chr(39))}'\n"
                for path in segment_paths
            ),
            encoding="utf-8",
        )
        subtitle_text = _build_srt(subtitle_segments or [])
        if subtitle_text:
            subtitle_path = temp_dir / "subtitles.srt"
            subtitle_path.write_text(subtitle_text, encoding="utf-8")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg_args = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path.resolve()),
        ]
        if subtitle_text:
            subtitle_filter = (
                f"subtitles=filename='{subtitle_path.resolve().as_posix()}':"
                "force_style='FontName=Noto Sans CJK SC,FontSize=20,"
                "PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,"
                "BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=36'"
            )
            ffmpeg_args.extend([
                "-map", "0:v:0", "-map", "0:a?", "-vf", subtitle_filter,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
            ])
        else:
            ffmpeg_args.extend(["-c", "copy"])
        ffmpeg_args.append(str(output_path.resolve()))
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise VideoAssemblyError(f"视频片段合成失败：{stderr.decode(errors='replace')[-500:]}")
        return {
            "status": "assembled",
            "file_id": output_id,
            "url": media_file_url(user_id, output_id),
        }
    except (OSError, VideoAssemblyError) as exc:
        output_path.unlink(missing_ok=True)
        raise VideoAssemblyError(str(exc)) from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
