#!/bin/sh
set -e

# Load Docker Swarm secrets (mounted at /run/secrets/*) into env vars.
# Each *_FILE env var points at a secret file; we read it into the plain var
# the app's config schema expects.
load_secret() {
  var="$1"
  eval "file=\${${var}_FILE:-}"
  if [ -n "$file" ] && [ -f "$file" ]; then
    export "$var"="$(cat "$file")"
  fi
}

load_secret JWT_SECRET
load_secret ENCRYPTION_KEY
load_secret ANTHROPIC_API_KEY
load_secret STRIPE_SECRET_KEY

# Assemble DATABASE_URL from a password secret if not provided directly.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PASSWORD_FILE:-}" ] && [ -f "$POSTGRES_PASSWORD_FILE" ]; then
  PW="$(cat "$POSTGRES_PASSWORD_FILE")"
  export DATABASE_URL="postgresql://${POSTGRES_USER:-rivertown}:${PW}@${POSTGRES_HOST:-postgres}:5432/${POSTGRES_DB:-rivertown}"
fi

exec "$@"
