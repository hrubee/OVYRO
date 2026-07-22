#!/usr/bin/env bash
#
# One-command local bring-up for Ovyro on macOS (Homebrew).
#
#   bash scripts/dev-setup.sh
#
# Idempotent. Brings the whole platform up locally with NO cloud credentials:
#   1. ensures .env.local exists (generated from .env.local.example, with fresh
#      secrets and your Postgres role filled in)
#   2. installs deps (bun install)
#   3. starts local Postgres 16 + Redis (Homebrew services)
#   4. creates the `ovyro` database if absent
#   5. applies Drizzle migrations
#   6. seeds the admin user (scripts/seed.ts)
#   7. seeds the demo marketplace — ~8 active listings with placeholder photos
#      (scripts/seed-demo.ts)
#
# It deliberately does NOT start the dev server — run `bun run dev` yourself.
set -euo pipefail

# Run from the repo root regardless of where this is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# postgresql@16 is keg-only; make its client tools available.
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

step() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }

# --- 1. .env.local -----------------------------------------------------------
if [[ -f .env.local ]]; then
  step ".env.local already present — leaving it untouched"
else
  step "Creating .env.local from .env.local.example"
  cp .env.local.example .env.local
  PG_USER="$(whoami)"
  sed -i '' "s|postgresql://hrushi@|postgresql://${PG_USER}@|" .env.local
  # Generate real 32-byte secrets so auth works out of the box.
  sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env.local
  sed -i '' "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env.local
  echo "  wrote .env.local (DATABASE_URL user=${PG_USER}, secrets generated)"
fi

# drizzle-kit runs as a node child that does NOT inherit Bun's .env.local
# autoload, so export DATABASE_URL explicitly for the migrate step below.
# (The `bun run` seed scripts pick it up from .env.local on their own.)
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)"

# --- 2. dependencies ---------------------------------------------------------
step "Installing dependencies (bun install)"
bun install

# --- 3. local services -------------------------------------------------------
step "Starting Postgres 16 and Redis (Homebrew services)"
brew services start postgresql@16 >/dev/null
brew services start redis >/dev/null

step "Waiting for Postgres to accept connections"
for _ in $(seq 1 40); do
  if pg_isready -q; then break; fi
  sleep 0.5
done
pg_isready

# --- 4. database -------------------------------------------------------------
step "Ensuring the 'ovyro' database exists"
if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ovyro'" | grep -q 1; then
  echo "  database 'ovyro' already exists"
else
  createdb ovyro
  echo "  created database 'ovyro'"
fi

# --- 5-7. migrate + seed -----------------------------------------------------
step "Applying Drizzle migrations"
bun run db:migrate

step "Seeding admin user"
bun run seed

step "Seeding demo marketplace (~8 listings with placeholder photos)"
bun run seed:demo

# --- done --------------------------------------------------------------------
step "Local bring-up complete"
cat <<'DONE'

Start the app and view the populated marketplace:

  bun run dev
  open http://localhost:3000        # homepage + latest listings
  open http://localhost:3000/land   # full browse grid, filters, sort, search

Sign in as the demo seller (dashboard) with the credentials printed above,
or as the admin with the password shown by the admin seed.
DONE
