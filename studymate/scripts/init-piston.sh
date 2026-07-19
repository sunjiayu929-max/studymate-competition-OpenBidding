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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBS_FILE="${PISTON_PYTHON_LIBS_FILE:-$SCRIPT_DIR/piston_python_libs.txt}"

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

if [[ ! -f "$LIBS_FILE" ]]; then
  echo "!! 找不到 Python 依赖清单：$LIBS_FILE" >&2
  exit 1
fi

mapfile -t PYTHON_PACKAGES < <(grep -E '^[a-zA-Z0-9_.-]+==[0-9]' "$LIBS_FILE" || true)
if [[ ${#PYTHON_PACKAGES[@]} -eq 0 ]]; then
  echo "!! $LIBS_FILE 中没有可安装的 package==version 行" >&2
  exit 1
fi

echo "==> Python 第三方依赖白名单："
printf '    %s\n' "${PYTHON_PACKAGES[@]}"

PISTON_CONTAINER_ID="${PISTON_CONTAINER_ID:-$(docker compose ps -q piston-api 2>/dev/null || true)}"
if [[ -z "$PISTON_CONTAINER_ID" ]]; then
  echo "!! 未找到本机 piston-api 容器，无法安装 Python 第三方库" >&2
  exit 1
fi

runtime_python="/piston/packages/python/3.10.0/bin/python3"
pip_index_url="${PISTON_PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple/}"

# 检查是否全部可 import；缺谁装谁。
need_install=()
for spec in "${PYTHON_PACKAGES[@]}"; do
  pkg="${spec%%==*}"
  case "$pkg" in
    scikit-learn) import_name="sklearn" ;;
    pillow) import_name="PIL" ;;
    *) import_name="$pkg" ;;
  esac
  if docker exec -u piston "$PISTON_CONTAINER_ID" "$runtime_python" -c "import $import_name" >/dev/null 2>&1; then
    echo "==> Python $pkg 已安装，跳过"
  else
    need_install+=("$spec")
  fi
done

if [[ ${#need_install[@]} -gt 0 ]]; then
  echo "==> 安装 Python 第三方库：${need_install[*]}"
  docker exec -u piston "$PISTON_CONTAINER_ID" "$runtime_python" -m pip install \
    --disable-pip-version-check --no-cache-dir --timeout 120 \
    --index-url "$pip_index_url" "${need_install[@]}"
else
  echo "==> Python 第三方库均已就绪"
fi

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

python_check="$(curl -fsS --max-time 30 -X POST "$PISTON/api/v2/execute" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","version":"3.10.0","files":[{"name":"main.py","content":"import os\nos.environ.setdefault(\"OPENBLAS_NUM_THREADS\",\"1\")\nos.environ.setdefault(\"OMP_NUM_THREADS\",\"1\")\nos.environ.setdefault(\"MPLBACKEND\",\"Agg\")\nimport numpy, scipy, sklearn, matplotlib, PIL, pandas, networkx, seaborn\nimport matplotlib.pyplot as plt\nplt.plot([0,1],[0,1])\nprint(\"sandbox-libs-ok\")"}],"run_timeout":10000}')"
if ! python3 -c 'import json, sys; result=json.load(sys.stdin)["run"]; raise SystemExit(0 if result.get("code") == 0 and result.get("stdout", "").strip() == "sandbox-libs-ok" else 1)' <<<"$python_check"; then
  echo "!! Python 依赖运行校验失败：$python_check" >&2
  exit 1
fi

echo
echo "✅ 完成。Python（numpy/scipy/sklearn/matplotlib/seaborn/pillow/pandas/networkx）、C 与 C++ 均可在沙箱运行。"
echo "   依赖清单：$LIBS_FILE"
