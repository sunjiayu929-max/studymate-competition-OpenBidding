#!/usr/bin/env bash
# Consistent SQLite backup for the live StudyMate Docker volume.
#
# A structurally valid snapshot is still useful when an application-level
# foreign-key defect is present. In that case this script keeps the snapshot,
# writes a JSON finding report, and exits successfully with a degraded marker.

set -euo pipefail

CONTAINER="${STUDYMATE_BACKEND_CONTAINER:-studymate-backend}"
BACKUP_DIR="${STUDYMATE_BACKUP_DIR:-$HOME/studymate-backups}"
RETENTION_DAYS="${STUDYMATE_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="studymate-${STAMP}.db"
CONTAINER_TMP="/tmp/${NAME}"
CONTAINER_REPORT="/tmp/${NAME}.foreign-keys.json"
HOST_DB="${BACKUP_DIR}/${NAME}"
HOST_REPORT="${HOST_DB}.foreign-keys.json"

umask 077
mkdir -p "$BACKUP_DIR"

cleanup() {
  docker exec "$CONTAINER" rm -f "$CONTAINER_TMP" "$CONTAINER_REPORT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker inspect "$CONTAINER" >/dev/null

docker exec -i "$CONTAINER" python - "$CONTAINER_TMP" "$CONTAINER_REPORT" <<'PY'
import json
import sqlite3
import sys
from datetime import datetime, timezone

destination, report_path = sys.argv[1:]
source = sqlite3.connect("/app/data/studymate.db")
target = sqlite3.connect(destination)
try:
    source.backup(target)
    integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = [list(row) for row in target.execute("PRAGMA foreign_key_check").fetchall()]
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "integrity_check": integrity,
        "foreign_key_errors": foreign_keys,
        "status": "clean" if integrity == "ok" and not foreign_keys else "degraded",
    }
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(
        f"container backup verification: integrity={integrity}, "
        f"foreign_key_errors={len(foreign_keys)}, status={report['status']}"
    )
    if integrity != "ok":
        raise SystemExit("SQLite integrity_check failed")
finally:
    target.close()
    source.close()
PY

docker cp "$CONTAINER:$CONTAINER_TMP" "$HOST_DB" >/dev/null
docker cp "$CONTAINER:$CONTAINER_REPORT" "$HOST_REPORT" >/dev/null

python3 - "$HOST_DB" "$HOST_REPORT" <<'PY'
import json
import sqlite3
import sys

db_path, report_path = sys.argv[1:]
connection = sqlite3.connect(db_path)
try:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = [list(row) for row in connection.execute("PRAGMA foreign_key_check").fetchall()]
finally:
    connection.close()
if integrity != "ok":
    raise SystemExit(f"host backup verification failed: {integrity}")
with open(report_path, "r+", encoding="utf-8") as handle:
    report = json.load(handle)
    report["host_integrity_check"] = integrity
    report["host_foreign_key_errors"] = foreign_keys
    report["status"] = "clean" if not foreign_keys else "degraded"
    handle.seek(0)
    json.dump(report, handle, ensure_ascii=False, indent=2)
    handle.truncate()
    handle.write("\n")
print(f"host backup verification: integrity={integrity}, foreign_key_errors={len(foreign_keys)}")
PY

gzip -9 "$HOST_DB"
sha256sum "${HOST_DB}.gz" > "${HOST_DB}.gz.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'studymate-*.db.gz' -o -name 'studymate-*.db.gz.sha256' -o -name 'studymate-*.db.foreign-keys.json' \) \
  -mtime "+$RETENTION_DAYS" -delete

chmod 600 "${HOST_DB}.gz" "${HOST_DB}.gz.sha256" "$HOST_REPORT"
echo "backup=${HOST_DB}.gz"
echo "checksum=${HOST_DB}.gz.sha256"
echo "report=${HOST_REPORT}"
