#!/usr/bin/env bash
# StudyMate local/Ubuntu one-command deployment.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose)
if [[ -f .deploy.env ]]; then
  COMPOSE+=(--env-file .deploy.env)
fi

ACTION="${1:-up}"

case "$ACTION" in
  up)
    "${COMPOSE[@]}" up -d --build --remove-orphans
    if [[ "${SKIP_PISTON_INIT:-0}" != "1" ]] \
      && "${COMPOSE[@]}" ps --status running --services | grep -qx piston-api; then
      bash scripts/init-piston.sh
    else
      echo "Piston runtime initialization skipped (profile disabled or explicitly skipped)."
    fi
    "${COMPOSE[@]}" ps
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=200 backend frontend caddy piston-api
    ;;
  down)
    # Deliberately omit -v: named volumes contain the live SQLite DB and runtimes.
    "${COMPOSE[@]}" down
    ;;
  *)
    echo "Usage: bash scripts/deploy.sh [up|status|logs|down]" >&2
    exit 2
    ;;
esac
