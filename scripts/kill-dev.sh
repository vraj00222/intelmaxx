#!/usr/bin/env bash
# Kill any running Next.js dev servers on ports 3000/3001.
set -e
for p in 3000 3001; do
  pids="$(lsof -ti:"$p" 2>/dev/null || true)"
  [ -n "$pids" ] && echo "[kill-dev] killing port $p → $pids" && kill -9 $pids 2>/dev/null || true
done
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
exit 0
