"""安全离线模式的进程级出站网络保险丝。

业务层仍应在创建 provider/client 前显式返回“未配置/不可用”。这里的 socket
保护用于兜住遗漏和未来新增的外联路径；它不影响后端监听入站连接或 SQLite。
"""
from __future__ import annotations

import socket
import ipaddress
from typing import Any


class OfflineNetworkBlockedError(OSError):
    """安全离线模式阻止了出站网络连接。"""


_installed = False
_original_getaddrinfo = socket.getaddrinfo
_original_socket_connect = socket.socket.connect
_original_socket_connect_ex = socket.socket.connect_ex
_original_socket_sendto = socket.socket.sendto


def _blocked(operation: str, target: Any = None) -> OfflineNetworkBlockedError:
    suffix = f"（目标：{target!r}）" if target is not None else ""
    return OfflineNetworkBlockedError(
        f"StudyMate 安全离线模式已阻止出站网络操作 {operation}{suffix}"
    )


def _offline_getaddrinfo(host, *args, **kwargs):
    # 启动监听 127.0.0.1 时仍可能解析本机地址；只允许本机解析，不允许外部 DNS。
    normalized = str(host or "").strip().lower()
    if normalized in {"", "localhost", "127.0.0.1", "::1"}:
        return _original_getaddrinfo(host, *args, **kwargs)
    raise _blocked("getaddrinfo", host)


def _is_loopback_address(address: Any) -> bool:
    if not isinstance(address, tuple) or not address:
        return False
    host = str(address[0] or "").strip().lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _offline_connect(sock: socket.socket, address):
    if sock.family in {socket.AF_INET, socket.AF_INET6}:
        # Windows ProactorEventLoop 的内部 socketpair 使用随机 127.0.0.1 端口。
        # Piston 等业务环回外联由各入口在创建 client 前单独硬禁。
        if _is_loopback_address(address):
            return _original_socket_connect(sock, address)
        raise _blocked("connect", address)
    return _original_socket_connect(sock, address)


def _offline_connect_ex(sock: socket.socket, address):
    if sock.family in {socket.AF_INET, socket.AF_INET6}:
        if _is_loopback_address(address):
            return _original_socket_connect_ex(sock, address)
        raise _blocked("connect_ex", address)
    return _original_socket_connect_ex(sock, address)


def _offline_sendto(sock: socket.socket, data, *args):
    if sock.family in {socket.AF_INET, socket.AF_INET6}:
        target = args[-1] if args else None
        if _is_loopback_address(target):
            return _original_socket_sendto(sock, data, *args)
        raise _blocked("sendto", target)
    return _original_socket_sendto(sock, data, *args)


def install_outbound_network_guard() -> None:
    """幂等安装进程级出站网络阻断；必须在导入外部 provider 前调用。"""
    global _installed
    if _installed:
        return
    socket.getaddrinfo = _offline_getaddrinfo
    socket.socket.connect = _offline_connect
    socket.socket.connect_ex = _offline_connect_ex
    socket.socket.sendto = _offline_sendto
    _installed = True
