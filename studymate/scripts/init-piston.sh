#!/usr/bin/env bash
# StudyMate · Piston 沙箱 runtime 一次性安装脚本
# ============================================================
# 作用：首次启动 docker compose 之后，在 piston-api 容器里装好
#       Python / C / C++ 三个运行时（来自境外 package server）。
# 装完会缓存到 docker volume piston_data，后续启动不再访问境外。
#
# 用法（任选一种）：
#   1. 在装了 docker compose 的宿主机上：
#        bash scripts/init-piston.sh
#   2. 已暴露 piston ports 到 127.0.0.1:2000 → 任何机器 curl 都行
# ============================================================

set -euo pipefail

PISTON="${PISTON_URL:-http://127.0.0.1:2000}"

echo "==> 等待 piston-api 就绪 ($PISTON) ..."
for i in {1..30}; do
  if curl -fsS "$PISTON/api/v2/runtimes" >/dev/null 2>&1; then
    echo "    piston-api OK"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "!! piston-api 30s 内未就绪，请确认容器已起且端口可达"
    exit 1
  fi
  sleep 1
done

install_pkg() {
  local lang="$1"
  local ver="$2"
  local runtime_lang="$3"
  local installed

  installed="$(curl -fsS "$PISTON/api/v2/runtimes")"
  if grep -Fq "\"language\":\"$runtime_lang\",\"version\":\"$ver\"" <<<"$installed"; then
    echo "==> $lang $ver 已安装，跳过"
    return
  fi

  echo "==> 安装 $lang $ver ..."
  local resp
  resp=$(curl -fsS --max-time "${PISTON_INSTALL_TIMEOUT:-1800}" \
    -X POST "$PISTON/api/v2/packages" \
    -H "Content-Type: application/json" \
    -d "{\"language\":\"$lang\",\"version\":\"$ver\"}")
  echo "    $resp"
}

# Piston 官方 package 名 + 推荐版本
install_pkg "python"  "3.10.0" "python"
# C / C++ 由 gcc 包提供：piston 包名是 gcc，装一个同时给 c + c++（还附带 d/fortran）运行时。
# 早期写成 c / c++ 会报 "package does not exist"。编译时调用方传 -std=c11 / -std=c++17。
install_pkg "gcc"     "10.2.0" "c++"

echo
echo "==> 当前已装 runtime："
runtimes="$(curl -fsS "$PISTON/api/v2/runtimes")"
echo "$runtimes" | head -50

for required in \
  '"language":"python","version":"3.10.0"' \
  '"language":"c++","version":"10.2.0"'; do
  if ! grep -Fq "$required" <<<"$runtimes"; then
    echo "!! runtime 校验失败，缺少：$required" >&2
    exit 1
  fi
done
echo
echo "✅ 完成。后续运行用户代码全程走 docker 内网，零公网依赖。"
