#!/usr/bin/env bash
# School Scheduler — installer for Ubuntu / Debian (also fine on WSL).
#
# What it does (idempotent — run it again to update):
#   1. Node.js 20 LTS and PostgreSQL if they are missing
#   2. a PostgreSQL role + database (defaults: scheduler / scheduler)
#   3. .env with DATABASE_URL (kept if it already exists)
#   4. npm install, prisma db push + generate, production build
#
# Usage:
#   bash scripts/install.sh                 # interactive (asks for the DB password once)
#   DB_PASSWORD=secret bash scripts/install.sh
#   DB_USER=sms_user DB_NAME=scheduler DB_PASSWORD=... bash scripts/install.sh
#
# Then:  npm start   →  http://localhost:3000       (or: npm run dev for development)

set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

DB_USER="${DB_USER:-scheduler}"
DB_NAME="${DB_NAME:-scheduler}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-}"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "sudo is required to install packages"
  SUDO="sudo"
fi

# Run psql as the postgres OS user (peer auth), whether we are root or not.
as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi
}

# ── 1. Node.js 20+ ────────────────────────────────────────────────────────────
need_node=1
if command -v node >/dev/null; then
  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$major" -ge 20 ]; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  say "Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
else
  say "Node.js $(node -v) found"
fi

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
if ! command -v psql >/dev/null; then
  say "Installing PostgreSQL"
  $SUDO apt-get update
  $SUDO apt-get install -y postgresql postgresql-contrib
fi
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  $SUDO systemctl enable --now postgresql
else
  $SUDO service postgresql start || true   # WSL without systemd
fi
say "PostgreSQL $(psql --version | awk '{print $3}') running"

# ── 3. Role + database ────────────────────────────────────────────────────────
if [ -f .env ] && grep -q '^DATABASE_URL=' .env; then
  say ".env exists — keeping its DATABASE_URL"
  # Pull user/db/password out of it so the role/db steps stay in sync.
  url="$(grep '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')"
  DB_USER="$(echo "$url" | sed -E 's#^[a-z]+://([^:]+):.*#\1#')"
  DB_PASSWORD="$(echo "$url" | sed -E 's#^[a-z]+://[^:]+:([^@]*)@.*#\1#')"
  DB_NAME="$(echo "$url" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
else
  if [ -z "$DB_PASSWORD" ]; then
    read -r -s -p "Password for PostgreSQL role '$DB_USER' (new or existing): " DB_PASSWORD; echo
    [ -n "$DB_PASSWORD" ] || die "a password is required"
  fi
  printf 'DATABASE_URL="postgresql://%s:%s@%s:%s/%s"\n' "$DB_USER" "$DB_PASSWORD" "$DB_HOST" "$DB_PORT" "$DB_NAME" > .env
  chmod 600 .env
  say "Wrote .env"
fi

say "Ensuring role '$DB_USER' and database '$DB_NAME'"
# Everything through the postgres superuser via peer auth; SQL quoting via psql variables.
as_postgres psql -v ON_ERROR_STOP=1 -v u="$DB_USER" -v p="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'u', :'p') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'u', :'p') \gexec
SQL
as_postgres psql -v ON_ERROR_STOP=1 -v d="$DB_NAME" -v u="$DB_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'d', :'u') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
SQL

# ── 4. App ────────────────────────────────────────────────────────────────────
# When started with sudo, run the npm steps as the invoking user so node_modules,
# .next and the Prisma client are not owned by root.
run_as_user() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then runuser -u "$SUDO_USER" -- "$@"; else "$@"; fi
}
if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then chown "$SUDO_USER" .env; fi

say "Installing dependencies"
run_as_user npm install --no-audit --no-fund

say "Applying database schema"
run_as_user npx prisma db push
run_as_user npx prisma generate
rm -rf .next

say "Building"
run_as_user npm run build

# ── 5. Solver (Python + OR-Tools) ────────────────────────────────────────────
if ! python3 -c 'import venv' >/dev/null 2>&1; then $SUDO apt-get install -y python3-venv; fi
say "Installing the solver (Python venv)"
run_as_user python3 -m venv .venv
run_as_user .venv/bin/pip install -q -r solver/requirements.txt

cat <<EOF

Done. Start the app with:

    cd "$APP_DIR" && npm start        # production, http://localhost:3000
    cd "$APP_DIR" && npm run dev      # development with hot reload

Load the school's Orologio data:
    npm run orologio:json -- "26-27 (1)" data/orologio-26-27.json "Όνομα σχολείου"
    npm run import:json -- data/orologio-26-27.json --replace
Generate a timetable:
    .venv/bin/python -m solver solve data/orologio-26-27.json --time 600
EOF
