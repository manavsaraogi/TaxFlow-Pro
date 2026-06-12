#!/usr/bin/env bash
# scripts/dev.sh — TaxFlow Pro development startup
# Usage: bash scripts/dev.sh [--reset] [--no-seed]
#   --reset    Drop and recreate the database before starting
#   --no-seed  Skip seeding even if DB is empty

set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${CYAN}[taxflow]${NC} $*"; }
ok()     { echo -e "${GREEN}[taxflow]${NC} ✓ $*"; }
warn()   { echo -e "${YELLOW}[taxflow]${NC} ⚠ $*"; }
fail()   { echo -e "${RED}[taxflow]${NC} ✗ $*"; exit 1; }

# ─── Args ────────────────────────────────────────────────────────────────────
RESET=false
NO_SEED=false

for arg in "$@"; do
  case $arg in
    --reset)   RESET=true ;;
    --no-seed) NO_SEED=true ;;
    *) warn "Unknown argument: $arg" ;;
  esac
done

# ─── Root check ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      TaxFlow Pro — Dev Server        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ─── .env check ──────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    warn ".env not found. Copying from .env.example..."
    cp .env.example .env
    warn "Please review .env and set VAULT_SALT before continuing."
    warn "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    echo ""
  else
    fail ".env and .env.example are both missing. Cannot continue."
  fi
fi

# Source .env for this script
set -a
# shellcheck disable=SC1091
source .env
set +a

# ─── Node / npm version check ────────────────────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ is required. Found: $(node -v 2>/dev/null || echo 'not installed')"
fi
ok "Node.js $(node -v)"

# ─── Install dependencies ────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  log "Installing root dependencies..."
  npm install
  ok "Root dependencies installed"
fi

if [ ! -d "renderer/node_modules" ]; then
  log "Installing renderer dependencies..."
  (cd renderer && npm install)
  ok "Renderer dependencies installed"
fi

# ─── Data directory ──────────────────────────────────────────────────────────
DATA_DIR="${ROOT_DIR}/data"
mkdir -p "$DATA_DIR"
ok "Data directory: $DATA_DIR"

# ─── Database setup ──────────────────────────────────────────────────────────
DB_PATH="${DATA_DIR}/taxflow.db"

if [ "$RESET" = true ]; then
  warn "--reset flag set. Dropping existing database..."
  rm -f "$DB_PATH"
  ok "Database dropped"
fi

log "Running Prisma migrations..."
npx prisma migrate dev --skip-seed --name init 2>/dev/null || \
  npx prisma db push --skip-generate 2>/dev/null || \
  warn "Migration step skipped (may already be up to date)"

log "Generating Prisma client..."
npx prisma generate
ok "Prisma client ready"

# ─── Seed ────────────────────────────────────────────────────────────────────
if [ "$NO_SEED" = false ]; then
  DB_EMPTY=false
  if [ ! -f "$DB_PATH" ]; then
    DB_EMPTY=true
  else
    # Check if Firm table has any rows
    ROW_COUNT=$(node -e "
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.firm.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
    " 2>/dev/null || echo "0")
    if [ "$ROW_COUNT" = "0" ]; then
      DB_EMPTY=true
    fi
  fi

  if [ "$DB_EMPTY" = true ] || [ "${AUTO_SEED:-false}" = "true" ]; then
    log "Seeding database with development data..."
    npx ts-node --project tsconfig.json prisma/seed.ts
    ok "Database seeded"
  else
    log "Database already has data — skipping seed (use --reset to start fresh)"
  fi
fi

# ─── TypeScript compile check (non-blocking) ─────────────────────────────────
log "Type-checking electron main process..."
npx tsc --project tsconfig.electron.json --noEmit 2>&1 | tail -5 || warn "TypeScript errors in main process (non-blocking)"

# ─── Start dev servers ───────────────────────────────────────────────────────
RENDERER_PORT="${RENDERER_PORT:-3000}"

log "Starting Next.js renderer on port ${RENDERER_PORT}..."
log "Starting Electron..."
echo ""

# Concurrently: Next.js renderer + Electron
# Electron waits for renderer to be ready via ELECTRON_WAIT_FOR
RENDERER_URL="http://localhost:${RENDERER_PORT}"

npx concurrently \
  --kill-others \
  --prefix "[{name}]" \
  --names "renderer,electron" \
  --prefix-colors "cyan,yellow" \
  "cd renderer && npx next dev -p ${RENDERER_PORT}" \
  "npx wait-on ${RENDERER_URL} && npx electron . --dev"
