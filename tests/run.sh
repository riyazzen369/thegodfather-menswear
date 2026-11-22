#!/usr/bin/env bash
# Build, serve dist/ on :8795, run the end-to-end suite, stop the server.
# First run installs Playwright + Chromium into tests/ (one-off, ~150 MB).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d tests/node_modules/playwright ] || (cd tests && npm install --no-audit --no-fund && npx playwright install chromium)
[ -f dist/index.html ] || npm run build
npx vite preview --port 8795 --strictPort >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf http://localhost:8795/ >/dev/null && break; sleep 0.25; done
NOVIDEO=${NOVIDEO:-1} node tests/${1:-test3d.js}
