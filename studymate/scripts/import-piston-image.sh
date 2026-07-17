#!/usr/bin/env bash
# Import Piston through the host network when Docker daemon cannot reach GHCR.

set -euo pipefail

SOURCE_IMAGE="${PISTON_SOURCE_IMAGE:-ghcr.io/engineer-man/piston:latest}"
TARGET_IMAGE="${PISTON_IMAGE:-ghcr.io/engineer-man/piston:latest}"
PULL_TIMEOUT="${PISTON_PULL_TIMEOUT:-180}"

if docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1; then
  echo "Piston image already exists: $TARGET_IMAGE"
  exit 0
fi

echo "Trying Docker pull for $SOURCE_IMAGE (timeout: ${PULL_TIMEOUT}s) ..."
if timeout "$PULL_TIMEOUT" docker pull "$SOURCE_IMAGE"; then
  if [[ "$SOURCE_IMAGE" != "$TARGET_IMAGE" ]]; then
    docker tag "$SOURCE_IMAGE" "$TARGET_IMAGE"
  fi
  docker image inspect "$TARGET_IMAGE" --format 'Imported {{.RepoTags}} ({{.Id}})'
  exit 0
fi

if ! command -v skopeo >/dev/null 2>&1; then
  echo "Docker pull failed and skopeo is unavailable. Ubuntu: sudo apt install -y skopeo" >&2
  exit 1
fi

# Ubuntu 22.04 ships an older skopeo whose docker-daemon transport uses Docker
# API 1.22; Docker 29 requires API >= 1.40. A temporary docker-archive avoids
# that incompatibility and is then loaded by the current Docker CLI.
archive="$(mktemp --suffix=.tar)"
trap 'rm -f "$archive"' EXIT

echo "Docker pull did not finish; importing through a temporary archive ..."
skopeo copy --retry-times 3 \
  "docker://$SOURCE_IMAGE" \
  "docker-archive:$archive:$TARGET_IMAGE"
docker load -i "$archive"

docker image inspect "$TARGET_IMAGE" --format 'Imported {{.RepoTags}} ({{.Id}})'
