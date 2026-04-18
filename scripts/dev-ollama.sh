#!/usr/bin/env bash
# Dev runner — local Ollama (Gemma 4) + Next dev, with automatic cleanup.
#
# Usage: npm run dev:ollama
#
# What it does:
#  1. Kills anything holding Next.js dev ports (3000, 3001)
#  2. Ensures Ollama is up (starts it in the background if not)
#  3. Verifies the target model is pulled
#  4. Starts `next dev` with GEMMA_PROVIDER=ollama

set -euo pipefail

PORT="${PORT:-3000}"
MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
OLLAMA_BASE="${OLLAMA_BASE:-http://localhost:11434}"

say() { printf "\033[36m[dev:ollama]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[dev:ollama]\033[0m %s\n" "$*"; }

# --- 1. Free Next dev ports ---
for p in 3000 3001; do
  pids="$(lsof -ti:"$p" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    say "killing process(es) on port $p: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
# also stop any stray next dev processes
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 0.3

# --- 2. Ensure Ollama is running ---
if ! curl -sf "$OLLAMA_BASE/api/tags" >/dev/null 2>&1; then
  say "starting ollama in background (log: /tmp/ollama.log)"
  nohup ollama serve >/tmp/ollama.log 2>&1 &
  # wait for it to come up
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf "$OLLAMA_BASE/api/tags" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  if ! curl -sf "$OLLAMA_BASE/api/tags" >/dev/null 2>&1; then
    warn "ollama did not come up at $OLLAMA_BASE — is it installed?"
    exit 1
  fi
else
  say "ollama already up at $OLLAMA_BASE"
fi

# --- 3. Verify the model is pulled ---
if ! curl -sf "$OLLAMA_BASE/api/tags" | grep -q "\"$MODEL\""; then
  warn "model '$MODEL' not found locally. run:  ollama pull $MODEL"
  warn "available tags:"
  curl -sf "$OLLAMA_BASE/api/tags" | sed -e 's/[{},]/\n/g' | grep '"name"' || true
  exit 1
fi

say "using provider=ollama model=$MODEL"
say "starting next dev on port $PORT"

# --- 4. Launch Next dev ---
exec env \
  GEMMA_PROVIDER=ollama \
  OLLAMA_MODEL="$MODEL" \
  OLLAMA_BASE="$OLLAMA_BASE" \
  npx next dev -p "$PORT"
