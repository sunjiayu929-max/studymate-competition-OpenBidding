#!/usr/bin/env bash
# One-time Ubuntu 22.04 bootstrap for StudyMate.
# Run on the server with: sudo bash ~/studymate-bootstrap.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-deploy}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo/root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg ufw skopeo

install -m 0755 -d /etc/apt/keyrings
DOCKER_APT_BASE=""
for candidate in \
  "https://mirrors.aliyun.com/docker-ce/linux/ubuntu" \
  "https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu" \
  "https://mirrors.ustc.edu.cn/docker-ce/linux/ubuntu" \
  "https://download.docker.com/linux/ubuntu"; do
  if curl -fsSL --connect-timeout 10 --max-time 60 \
    "$candidate/gpg" -o /etc/apt/keyrings/docker.asc; then
    DOCKER_APT_BASE="$candidate"
    break
  fi
done

if [[ -z "$DOCKER_APT_BASE" ]]; then
  echo "Unable to reach any configured Docker CE package mirror." >&2
  exit 1
fi

echo "Using Docker CE package mirror: $DOCKER_APT_BASE"
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
ARCH="$(dpkg --print-architecture)"
CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] $DOCKER_APT_BASE $CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

install -m 0755 -d /etc/docker
python3 - <<'PY'
import json
from pathlib import Path

path = Path("/etc/docker/daemon.json")
try:
    data = json.loads(path.read_text()) if path.exists() else {}
except json.JSONDecodeError as exc:
    raise SystemExit(f"Invalid existing {path}: {exc}")

data["registry-mirrors"] = [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://dockerproxy.net",
]
data.setdefault("log-driver", "local")
data.setdefault("log-opts", {"max-size": "100m", "max-file": "5"})

tmp = path.with_suffix(".json.tmp")
tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
tmp.chmod(0o644)
tmp.replace(path)
PY

dockerd --validate --config-file /etc/docker/daemon.json
# docker-ce may be auto-started by apt before daemon.json is written. Restart it
# explicitly so registry mirrors and log limits take effect immediately.
systemctl enable docker
systemctl restart docker
usermod -aG docker "$DEPLOY_USER"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Bootstrap complete. Reconnect SSH so user '$DEPLOY_USER' receives docker group membership."
