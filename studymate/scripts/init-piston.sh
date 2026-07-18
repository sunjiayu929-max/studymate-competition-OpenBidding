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

# 官方 Python runtime 已带 numpy/scipy，但未带 sklearn。机器学习课程的代码
# Agent 会生成 sklearn 对比示例，因此在持久化 runtime 目录中补齐固定兼容版本。
PISTON_CONTAINER_ID="${PISTON_CONTAINER_ID:-$(docker compose ps -q piston-api 2>/dev/null || true)}"
if [[ -n "$PISTON_CONTAINER_ID" ]]; then
  runtime_python="/piston/packages/python/3.10.0/bin/python3"
  if docker exec -u piston "$PISTON_CONTAINER_ID" "$runtime_python" -c "import sklearn" >/dev/null 2>&1; then
    echo "==> Python scikit-learn 已安装，跳过"
  else
    echo "==> 安装 Python scikit-learn 1.3.2 ..."
    pip_index_url="${PISTON_PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple/}"
    docker exec -u piston "$PISTON_CONTAINER_ID" "$runtime_python" -m pip install \
      --disable-pip-version-check --no-cache-dir --timeout 60 \
      --index-url "$pip_index_url" "scikit-learn==1.3.2"
  fi
else
  echo "!! 未找到本机 piston-api 容器，无法补充 scikit-learn" >&2
  exit 1
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
  -d '{"language":"python","version":"3.10.0","files":[{"name":"main.py","content":"import os; os.environ[\"OPENBLAS_NUM_THREADS\"]=\"1\"; os.environ[\"OMP_NUM_THREADS\"]=\"1\"; import sklearn; print(\"sklearn-ok\")"}],"run_timeout":10000}')"
if ! python3 -c 'import json, sys; result=json.load(sys.stdin)["run"]; raise SystemExit(0 if result.get("code") == 0 and result.get("stdout", "").strip() == "sklearn-ok" else 1)' <<<"$python_check"; then
  echo "!! Python scikit-learn 运行校验失败" >&2
  exit 1
fi
echo
echo "✅ 完成。Python（含 NumPy/SciPy/scikit-learn）、C 与 C++ 代码均可在沙箱运行。"
