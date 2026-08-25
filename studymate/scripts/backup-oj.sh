#!/usr/bin/env bash
# Logical/data-volume backup for the independent Hydro OJ.

set -euo pipefail

BACKUP_DIR="${OJ_BACKUP_DIR:-$HOME/studymate-backups/oj}"
RETENTION_DAYS="${OJ_BACKUP_RETENTION_DAYS:-14}"
MONGO_CONTAINER="${OJ_MONGO_CONTAINER:-studymate-oj-mongo}"
BACKUP_TOOL_IMAGE="${OJ_BACKUP_TOOL_IMAGE:-busybox:1.36}"
STAMP="$(date +%Y%m%d-%H%M%S)"

umask 077
mkdir -p "$BACKUP_DIR"

docker inspect "$MONGO_CONTAINER" >/dev/null

# The Mongo container already holds the root credentials in its environment;
# they never appear in this script or in command-line logs on the host.
docker exec "$MONGO_CONTAINER" sh -c \
  'mongodump --archive --gzip --db hydro --username "$MONGO_INITDB_ROOT_USERNAME" \
   --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  > "$BACKUP_DIR/oj-hydro-${STAMP}.archive.gz"

for volume in oj_oj_file oj_oj_hydro; do
  name="${volume#oj_}"
  docker run --rm \
    -v "${volume}:/source:ro" \
    -v "${BACKUP_DIR}:/backup" \
    "$BACKUP_TOOL_IMAGE" \
    tar czf "/backup/oj-${name}-${STAMP}.tar.gz" -C /source .
done

sha256sum "$BACKUP_DIR"/*"$STAMP"* > "$BACKUP_DIR/oj-${STAMP}.sha256"
find "$BACKUP_DIR" -maxdepth 1 -type f -mtime "+$RETENTION_DAYS" -delete
chmod 600 "$BACKUP_DIR"/*"$STAMP"*
echo "OJ backups written to $BACKUP_DIR (stamp=$STAMP)"
