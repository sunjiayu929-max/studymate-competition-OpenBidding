#!/usr/bin/env bash
# StudyMate local/Ubuntu one-command deployment.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

COMPOSE=(docker compose)
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$PROJECT_DIR/.deploy.env}"
BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-$PROJECT_DIR/backend/.env}"
if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  COMPOSE+=(--env-file "$DEPLOY_ENV_FILE")
fi

ACTION="${1:-up}"

dotenv_value() {
  local env_file="$1"
  local wanted_key="$2"
  [[ -f "$env_file" ]] || return 0

  awk -v wanted_key="$wanted_key" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    {
      line = trim($0)
      if (line == "" || substr(line, 1, 1) == "#") next
      sub(/^export[[:space:]]+/, "", line)
      prefix = wanted_key "="
      if (index(line, prefix) != 1) next
      value = trim(substr(line, length(prefix) + 1))
      if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") || \
          (substr(value, 1, 1) == "\047" && substr(value, length(value), 1) == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$env_file"
}

AI_INTERVIEW_ENABLED="${AI_INTERVIEW_ENABLED:-$(dotenv_value "$DEPLOY_ENV_FILE" AI_INTERVIEW_ENABLED)}"
AI_INTERVIEW_ENABLED="${AI_INTERVIEW_ENABLED:-0}"
AI_INTERVIEW_DIR="${AI_INTERVIEW_DIR:-$(dotenv_value "$DEPLOY_ENV_FILE" AI_INTERVIEW_DIR)}"
AI_INTERVIEW_DIR="${AI_INTERVIEW_DIR:-../ai-interview}"
if [[ "$AI_INTERVIEW_DIR" != /* ]]; then
  AI_INTERVIEW_DIR="$PROJECT_DIR/$AI_INTERVIEW_DIR"
fi

case "$AI_INTERVIEW_ENABLED" in
  0|1) ;;
  *)
    echo "AI_INTERVIEW_ENABLED must be 0 or 1." >&2
    exit 2
    ;;
esac

ai_enabled() {
  [[ "$AI_INTERVIEW_ENABLED" == "1" ]]
}

ai_compose() {
  (
    cd "$AI_INTERVIEW_DIR"
    docker compose "$@"
  )
}

require_ai_project() {
  if [[ ! -f "$AI_INTERVIEW_DIR/docker-compose.yml" ]]; then
    echo "AI interview project not found: $AI_INTERVIEW_DIR" >&2
    echo "Set AI_INTERVIEW_DIR in .deploy.env to the sibling ai-interview deployment directory." >&2
    exit 1
  fi
}

require_config_value() {
  local env_file="$1"
  local key="$2"
  local value
  value="$(dotenv_value "$env_file" "$key")"
  if [[ -z "$value" || "$value" == replace-with-* ]]; then
    echo "Missing required configuration: $key in $env_file" >&2
    exit 1
  fi
  printf '%s' "$value"
}

preflight_ai() {
  ai_enabled || return 0
  require_ai_project

  local ai_env_file="$AI_INTERVIEW_DIR/.env"
  if [[ ! -f "$BACKEND_ENV_FILE" || ! -f "$ai_env_file" ]]; then
    echo "AI interview deployment requires $BACKEND_ENV_FILE and $ai_env_file." >&2
    exit 1
  fi

  local site_address public_url expected_url backend_secret ai_secret base_path secure_cookie api_url main_secure_cookie
  site_address="$(require_config_value "$DEPLOY_ENV_FILE" SITE_ADDRESS)"
  public_url="$(require_config_value "$BACKEND_ENV_FILE" AI_INTERVIEW_PUBLIC_URL)"
  backend_secret="$(require_config_value "$BACKEND_ENV_FILE" AI_INTERVIEW_SERVICE_SECRET)"
  main_secure_cookie="$(require_config_value "$BACKEND_ENV_FILE" SESSION_COOKIE_SECURE)"
  ai_secret="$(require_config_value "$ai_env_file" STUDYMATE_SERVICE_SECRET)"
  base_path="$(require_config_value "$ai_env_file" PUBLIC_BASE_PATH)"
  secure_cookie="$(require_config_value "$ai_env_file" SESSION_COOKIE_SECURE)"
  api_url="$(require_config_value "$ai_env_file" STUDYMATE_API_URL)"
  require_config_value "$ai_env_file" FLASK_SECRET_KEY >/dev/null
  require_config_value "$ai_env_file" MYSQL_PASSWORD >/dev/null
  require_config_value "$ai_env_file" MYSQL_ROOT_PASSWORD >/dev/null

  expected_url="https://${site_address%/}/interview"
  if [[ "$public_url" != "$expected_url" ]]; then
    echo "AI_INTERVIEW_PUBLIC_URL must be $expected_url (received a different value)." >&2
    exit 1
  fi
  if [[ "$backend_secret" != "$ai_secret" ]]; then
    echo "StudyMate and AI interview service secrets do not match." >&2
    exit 1
  fi
  case "${main_secure_cookie,,}" in
    1|true|yes) ;;
    *)
      echo "SESSION_COOKIE_SECURE in $BACKEND_ENV_FILE must be true in production." >&2
      exit 1
      ;;
  esac
  if [[ "$base_path" != "/interview" ]]; then
    echo "PUBLIC_BASE_PATH in $ai_env_file must be /interview." >&2
    exit 1
  fi
  case "${secure_cookie,,}" in
    1|true|yes) ;;
    *)
      echo "SESSION_COOKIE_SECURE in $ai_env_file must be true in production." >&2
      exit 1
      ;;
  esac
  if [[ "$api_url" != "http://backend:8000" ]]; then
    echo "STUDYMATE_API_URL in $ai_env_file must be http://backend:8000." >&2
    exit 1
  fi
  if [[ -z "$(dotenv_value "$ai_env_file" LLM_API_KEY)" ]]; then
    echo "Warning: LLM_API_KEY is empty; practice sessions can run but reports cannot be scored or written back." >&2
  fi
}

wait_for_ai_health() {
  local status
  for _ in {1..45}; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' studymate-ai-interview 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "exited" || "$status" == "dead" ]]; then
      echo "AI interview container stopped before becoming healthy." >&2
      ai_compose logs --tail=100 ai-interview db >&2 || true
      return 1
    fi
    sleep 2
  done
  echo "AI interview container did not become healthy within 90 seconds." >&2
  ai_compose logs --tail=100 ai-interview db >&2 || true
  return 1
}

start_ai() {
  ai_enabled || return 0
  # The main stack owns creation of the shared studymate_edge network.
  if ! docker network inspect studymate_edge >/dev/null 2>&1; then
    echo "Shared Docker network studymate_edge was not created by the main stack." >&2
    return 1
  fi
  ai_compose up -d --build --remove-orphans
  wait_for_ai_health
}

case "$ACTION" in
  up)
    preflight_ai
    "${COMPOSE[@]}" up -d --build --remove-orphans
    if [[ "${SKIP_PISTON_INIT:-0}" != "1" ]] \
      && "${COMPOSE[@]}" ps --status running --services | grep -qx piston-api; then
      bash scripts/init-piston.sh
    else
      echo "Piston runtime initialization skipped (profile disabled or explicitly skipped)."
    fi
    "${COMPOSE[@]}" ps
    if ai_enabled; then
      start_ai
      ai_compose ps
    fi
    ;;
  preflight)
    preflight_ai
    echo "Deployment preflight passed."
    ;;
  status)
    "${COMPOSE[@]}" ps
    if ai_enabled; then
      require_ai_project
      ai_compose ps
    fi
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=200 backend frontend caddy piston-api
    ;;
  ai-logs)
    if ! ai_enabled; then
      echo "AI interview deployment is disabled (AI_INTERVIEW_ENABLED=0)." >&2
      exit 1
    fi
    require_ai_project
    ai_compose logs -f --tail=200 ai-interview db
    ;;
  down)
    # Deliberately omit -v: named volumes contain the live SQLite DB and runtimes.
    if ai_enabled; then
      require_ai_project
      ai_compose down
    fi
    "${COMPOSE[@]}" down
    ;;
  *)
    echo "Usage: bash scripts/deploy.sh [up|preflight|status|logs|ai-logs|down]" >&2
    exit 2
    ;;
esac
