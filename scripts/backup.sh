#!/bin/sh
# Database backup.
#
# The postings can always be re-fetched. Your application history — what you
# applied to, when, and the notes you wrote — cannot. That is what this protects.
#
# Runs from two places, so the retention rule, the naming scheme and the
# empty-file guard have exactly one definition:
#
#   ./scripts/backup.sh                 from the host, via `make backup`
#   IN_CONTAINER=1 ./scripts/backup.sh  from the `backup` compose service
#
# Usage:  ./scripts/backup.sh [output-directory]
set -eu

OUT="${1:-./backups}"
DB="${POSTGRES_DB:-jobradar}"
USER="${POSTGRES_USER:-jobradar}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT/jobradar-$STAMP.sql.gz"
KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$OUT"

# --clean --if-exists so the dump can be restored over an existing database
# without a manual drop first.
if [ "${IN_CONTAINER:-0}" = "1" ]; then
  # Already on the compose network; talk to Postgres directly. `docker` does
  # not exist in here, and should not.
  PGPASSWORD="${POSTGRES_PASSWORD:-jobradar}" pg_dump \
    --host "${POSTGRES_HOST:-postgres}" --username "$USER" --dbname "$DB" \
    --clean --if-exists \
    | gzip > "$FILE"
else
  docker compose exec -T postgres pg_dump \
    --username "$USER" --dbname "$DB" --clean --if-exists \
    | gzip > "$FILE"
fi

# Refuse to report success on an empty file: a silent zero-byte backup is worse
# than no backup, because it looks like protection.
if [ ! -s "$FILE" ]; then
  echo "backup FAILED: $FILE is empty" >&2
  rm -f "$FILE"
  exit 1
fi

echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the most recent N, drop the rest.
ls -1t "$OUT"/jobradar-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  echo "pruned: $old"
done
