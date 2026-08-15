#!/bin/sh
# Restore the database from a backup.
#
# Tested at least once, on purpose: an untested restore is a guess.
#
# Usage:  ./scripts/restore.sh backups/jobradar-20260816-030000.sql.gz
set -eu

FILE="${1:?usage: restore.sh <backup.sql.gz>}"
DB="${POSTGRES_DB:-jobradar}"
USER="${POSTGRES_USER:-jobradar}"

[ -s "$FILE" ] || { echo "no such backup: $FILE" >&2; exit 1; }

echo "This REPLACES the contents of '$DB' with $FILE."
printf 'Type the database name to confirm: '
read -r CONFIRM
[ "$CONFIRM" = "$DB" ] || { echo "aborted"; exit 1; }

# Stop the writers first, or a run mid-restore fights the import.
docker compose stop worker beat >/dev/null 2>&1 || true

gunzip -c "$FILE" | docker compose exec -T postgres psql --username "$USER" --dbname "$DB" -v ON_ERROR_STOP=1

docker compose start worker beat >/dev/null 2>&1 || true

echo "restored from $FILE"
