#!/bin/sh
# Writes runtime configuration into the served bundle at container start-up, so
# one image runs unchanged in dev and prod. Picked up by nginx's own
# /docker-entrypoint.d/ mechanism before the server starts.
set -eu

: "${API_BASE_URL:=/api}"

cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiBaseUrl": "${API_BASE_URL}"
}
EOF

echo "jobradar: wrote /config.json with apiBaseUrl=${API_BASE_URL}"
