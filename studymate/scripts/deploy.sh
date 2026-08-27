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

DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${TMPDIR:-/tmp}/studymate-deploy.lock}"
if [[ "$ACTION" == "up" || "$ACTION" == "down" ]]; then
  exec 9>"$DEPLOY_LOCK_FILE"
  if ! flock -n 9; then
    echo "Another StudyMate deployment is already running." >&2
    exit 1
  fi
fi

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

reject_compose_env_overrides() {
  # docker compose gives inherited shell variables precedence over --env-file.
  # A stale SITE_ADDRESS or profile flag can therefore deploy a valid-looking
  # stack with the wrong public routing. Fail closed when both values exist.
  [[ -f "$DEPLOY_ENV_FILE" ]] || return 0
  local key configured inherited
  for key in SITE_ADDRESS HTTP_PORT HTTPS_PORT COMPOSE_PROFILES DATABASE_URL SEED_DEMO_USERS; do
    configured="$(dotenv_value "$DEPLOY_ENV_FILE" "$key")"
    if [[ -n "$configured" && -n "${!key+x}" ]]; then
      inherited="${!key}"
      if [[ "$inherited" != "$configured" ]]; then
        echo "Shell environment $key overrides $DEPLOY_ENV_FILE; unset it before deploying." >&2
        exit 1
      fi
    fi
  done
}

AI_INTERVIEW_ENABLED="${AI_INTERVIEW_ENABLED:-$(dotenv_value "$DEPLOY_ENV_FILE" AI_INTERVIEW_ENABLED)}"
AI_INTERVIEW_ENABLED="${AI_INTERVIEW_ENABLED:-0}"
AI_INTERVIEW_DIR="${AI_INTERVIEW_DIR:-$(dotenv_value "$DEPLOY_ENV_FILE" AI_INTERVIEW_DIR)}"
AI_INTERVIEW_DIR="${AI_INTERVIEW_DIR:-../ai-interview}"
if [[ "$AI_INTERVIEW_DIR" != /* ]]; then
  AI_INTERVIEW_DIR="$PROJECT_DIR/$AI_INTERVIEW_DIR"
fi
OJ_ENABLED="${OJ_ENABLED:-$(dotenv_value "$DEPLOY_ENV_FILE" OJ_ENABLED)}"
OJ_ENABLED="${OJ_ENABLED:-0}"
OJ_DIR="${OJ_DIR:-$(dotenv_value "$DEPLOY_ENV_FILE" OJ_DIR)}"
OJ_DIR="${OJ_DIR:-../oj}"
if [[ "$OJ_DIR" != /* ]]; then
  OJ_DIR="$PROJECT_DIR/$OJ_DIR"
fi
REQUIRE_DEPLOY_BRANCH="${REQUIRE_DEPLOY_BRANCH:-$(dotenv_value "$DEPLOY_ENV_FILE" REQUIRE_DEPLOY_BRANCH)}"
REQUIRE_DEPLOY_BRANCH="${REQUIRE_DEPLOY_BRANCH:-0}"
REQUIRE_BACKUP="${REQUIRE_BACKUP:-$(dotenv_value "$DEPLOY_ENV_FILE" REQUIRE_BACKUP)}"
REQUIRE_BACKUP="${REQUIRE_BACKUP:-0}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$(dotenv_value "$DEPLOY_ENV_FILE" BACKUP_SCRIPT)}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/home/deploy/studymate-ops/backup-db.sh}"

case "$AI_INTERVIEW_ENABLED" in
  0|1) ;;
  *)
    echo "AI_INTERVIEW_ENABLED must be 0 or 1." >&2
    exit 2
    ;;
esac
case "$OJ_ENABLED" in
  0|1) ;;
  *)
    echo "OJ_ENABLED must be 0 or 1." >&2
    exit 2
    ;;
esac

ai_enabled() {
  [[ "$AI_INTERVIEW_ENABLED" == "1" ]]
}

oj_enabled() {
  [[ "$OJ_ENABLED" == "1" ]]
}

ai_compose() {
  (
    cd "$AI_INTERVIEW_DIR"
    docker compose "$@"
  )
}

oj_compose() {
  (
    cd "$OJ_DIR"
    docker compose "$@"
  )
}

preflight_repository() {
  local root branch
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "$root" ]]; then
    if [[ "$REQUIRE_DEPLOY_BRANCH" == "1" ]]; then
      local revision
      revision="${DEPLOY_SOURCE_REVISION:-$(dotenv_value "$DEPLOY_ENV_FILE" DEPLOY_SOURCE_REVISION)}"
      if [[ -z "$revision" || "$revision" == replace-with-* ]]; then
        echo "Deployment source has no Git metadata; set DEPLOY_SOURCE_REVISION in $DEPLOY_ENV_FILE." >&2
        exit 1
      fi
    fi
    return 0
  fi

  if [[ "$REQUIRE_DEPLOY_BRANCH" == "1" ]]; then
    branch="$(git -C "$root" symbolic-ref --short HEAD 2>/dev/null || true)"
    if [[ "$branch" != "merge-competition" ]]; then
      echo "Production deployment must run from merge-competition (received: ${branch:-detached})." >&2
      exit 1
    fi
  fi
  if [[ -f "$root/.gitmodules" ]]; then
    if git -C "$root" submodule status --recursive | grep -qE '^[+-]'; then
      echo "One or more Git submodules are uninitialized or at an unexpected revision." >&2
      git -C "$root" submodule status --recursive >&2 || true
      exit 1
    fi
    [[ -f "$root/ai-interview/docker-compose.yml" ]] || { echo "ai-interview submodule is missing." >&2; exit 1; }
    [[ -f "$root/oj/docker-compose.yml" ]] || { echo "oj submodule is missing." >&2; exit 1; }
  fi
}

preflight_effective_compose() {
  local rendered configured_site
  reject_compose_env_overrides
  rendered="$("${COMPOSE[@]}" config 2>/dev/null)" || {
    echo "Unable to render the effective Docker Compose configuration." >&2
    exit 1
  }
  if [[ -f "$DEPLOY_ENV_FILE" ]] && [[ "$(dotenv_value "$DEPLOY_ENV_FILE" COMPOSE_PROFILES)" == *public* ]]; then
    configured_site="$(dotenv_value "$DEPLOY_ENV_FILE" SITE_ADDRESS)"
    if [[ -z "$configured_site" || "$configured_site" == replace-with-* ]]; then
      echo "Public deployment requires a real SITE_ADDRESS in $DEPLOY_ENV_FILE." >&2
      exit 1
    fi
    if ! grep -Fq "SITE_ADDRESS: $configured_site" <<<"$rendered"; then
      echo "Effective Compose configuration does not use SITE_ADDRESS=$configured_site." >&2
      exit 1
    fi
  fi
}

backup_gate() {
  [[ "$REQUIRE_BACKUP" == "1" ]] || return 0
  [[ -x "$BACKUP_SCRIPT" ]] || {
    echo "Required backup script is missing or not executable: $BACKUP_SCRIPT" >&2
    exit 1
  }
  echo "Running deployment backup gate: $BACKUP_SCRIPT"
  "$BACKUP_SCRIPT"
}

require_ai_project() {
  if [[ ! -f "$AI_INTERVIEW_DIR/docker-compose.yml" ]]; then
    echo "AI interview project not found: $AI_INTERVIEW_DIR" >&2
    echo "Set AI_INTERVIEW_DIR in .deploy.env to the sibling ai-interview deployment directory." >&2
    exit 1
  fi
}

require_oj_project() {
  if [[ ! -f "$OJ_DIR/docker-compose.yml" ]]; then
    echo "OJ project not found: $OJ_DIR" >&2
    echo "Set OJ_DIR in .deploy.env to the sibling oj deployment directory." >&2
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

preflight_oj() {
  oj_enabled || return 0
  require_oj_project

  if [[ ! -f "$OJ_DIR/packages/hydrojudge/vendor/testlib/testlib.h" ]]; then
    echo "HydroJudge testlib submodule is missing: $OJ_DIR/packages/hydrojudge/vendor/testlib/testlib.h" >&2
    echo "Initialize all submodules before deployment: git submodule update --init --recursive" >&2
    exit 1
  fi

  local oj_env_file="$OJ_DIR/.env"
  if [[ ! -f "$BACKEND_ENV_FILE" || ! -f "$oj_env_file" ]]; then
    echo "OJ deployment requires $BACKEND_ENV_FILE and $oj_env_file." >&2
    exit 1
  fi

  local site_address public_url hydro_url backend_secret oj_secret
  site_address="$(require_config_value "$DEPLOY_ENV_FILE" SITE_ADDRESS)"
  public_url="$(require_config_value "$BACKEND_ENV_FILE" OJ_PUBLIC_URL)"
  hydro_url="$(require_config_value "$oj_env_file" HYDRO_PUBLIC_URL)"
  backend_secret="$(require_config_value "$BACKEND_ENV_FILE" OJ_SERVICE_SECRET)"
  oj_secret="$(require_config_value "$oj_env_file" STUDYMATE_SERVICE_SECRET)"
  require_config_value "$oj_env_file" MONGO_ROOT_USERNAME >/dev/null
  require_config_value "$oj_env_file" MONGO_ROOT_PASSWORD >/dev/null
  require_config_value "$oj_env_file" HYDRO_MONGO_USERNAME >/dev/null
  require_config_value "$oj_env_file" HYDRO_MONGO_PASSWORD >/dev/null
  sso_only="$(require_config_value "$oj_env_file" STUDYMATE_SSO_ONLY)"

  local expected_public="https://${site_address%/}/oj"
  local expected_hydro="${expected_public}/"
  if [[ "$public_url" != "$expected_public" ]]; then
    echo "OJ_PUBLIC_URL must be $expected_public (received a different value)." >&2
    exit 1
  fi
  if [[ "$hydro_url" != "$expected_hydro" ]]; then
    echo "HYDRO_PUBLIC_URL must be $expected_hydro (received a different value)." >&2
    exit 1
  fi
  if [[ "$backend_secret" != "$oj_secret" ]]; then
    echo "StudyMate and OJ service secrets do not match." >&2
    exit 1
  fi
  if [[ "$sso_only" != "1" ]]; then
    echo "STUDYMATE_SSO_ONLY in $oj_env_file must be 1 for production." >&2
    exit 1
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

wait_for_oj_health() {
  for _ in {1..60}; do
    local status
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' studymate-oj-web 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "exited" || "$status" == "dead" ]]; then
      echo "OJ web container stopped before becoming healthy." >&2
      oj_compose logs --tail=120 hydro-web hydro-mongo >&2 || true
      return 1
    fi
    sleep 2
  done
  echo "OJ web container did not become healthy within 120 seconds." >&2
  oj_compose logs --tail=120 hydro-web hydro-mongo >&2 || true
  return 1
}

start_oj() {
  oj_enabled || return 0
  require_oj_project
  if ! docker network inspect studymate_edge >/dev/null 2>&1; then
    echo "Shared Docker network studymate_edge was not created by the main stack." >&2
    return 1
  fi
  # Hydro's web and judge images each run a large TypeScript build. Build them
  # one at a time so a small production host does not OOM under BuildKit.
  oj_compose build hydro-web
  oj_compose build hydro-judge
  oj_compose up -d --no-build --remove-orphans
  wait_for_oj_health
}

case "$ACTION" in
  up)
    preflight_repository
    preflight_ai
    preflight_oj
    preflight_effective_compose
    backup_gate
    compose_up_args=(-d --remove-orphans)
    if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
      compose_up_args+=(--build)
    else
      echo "Main image build skipped (SKIP_BUILD=1)."
    fi
    "${COMPOSE[@]}" up "${compose_up_args[@]}"
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
    if oj_enabled; then
      start_oj
      oj_compose ps
    fi
    ;;
  preflight)
    preflight_repository
    preflight_ai
    preflight_oj
    preflight_effective_compose
    echo "Deployment preflight passed."
    ;;
  status)
    "${COMPOSE[@]}" ps
    if ai_enabled; then
      require_ai_project
      ai_compose ps
    fi
    if oj_enabled; then
      require_oj_project
      oj_compose ps
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
  oj-logs)
    if ! oj_enabled; then
      echo "OJ deployment is disabled (OJ_ENABLED=0)." >&2
      exit 1
    fi
    require_oj_project
    oj_compose logs -f --tail=200 hydro-web hydro-judge hydro-mongo
    ;;
  down)
    # Deliberately omit -v: named volumes contain the live SQLite DB and runtimes.
    if ai_enabled; then
      require_ai_project
      ai_compose down
    fi
    if oj_enabled; then
      require_oj_project
      oj_compose down
    fi
    "${COMPOSE[@]}" down
    ;;
  *)
    echo "Usage: bash scripts/deploy.sh [up|preflight|status|logs|ai-logs|oj-logs|down]" >&2
    exit 2
    ;;
esac
