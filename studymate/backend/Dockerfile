# StudyMate Backend · FastAPI + SQLite + BM25
# 体积优化：python:3.11-slim + 仅安装运行期所需
ARG PYTHON_IMAGE=python:3.11-slim
FROM ${PYTHON_IMAGE} AS runtime

ARG DEBIAN_MIRROR=http://mirrors.aliyun.com/debian
ARG DEBIAN_SECURITY_MIRROR=http://mirrors.aliyun.com/debian-security
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# curl 用于 HEALTHCHECK；其余 pip wheel 即可。默认切到国内 Debian 源，
# 同时兼容旧式 sources.list 与新版 deb822 的 debian.sources。
RUN for source in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
      if [ -f "$source" ]; then \
        sed -i \
          -e "s|https\?://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
          -e "s|https\?://security.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
          -e "s|https\?://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
          "$source"; \
      fi; \
    done \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖（利用 docker layer cache，源码变动不会触发重装）
COPY requirements.txt .
RUN pip install -r requirements.txt --index-url "$PIP_INDEX_URL"

# 拷贝源码 + 脱敏压缩种子库（5 门课 1709 chunks + 向量）。这是只读基线，
# 运行期由 docker_entrypoint.py 在首启时解压到 /app/data 命名 volume（数据持久化）。
COPY app ./app
COPY scripts ./scripts
COPY resources ./resources
COPY run.py .

RUN test -s resources/seed/studymate.db.gz

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/ping || exit 1

# 入口：首启从压缩种子库播种到挂载 volume，再起 uvicorn（见 scripts/docker_entrypoint.py）
CMD ["python", "scripts/docker_entrypoint.py"]
