#!/usr/bin/env sh
# One-command local demo: serves dist/ on http://localhost:8080 and opens the browser.
cd "$(dirname "$0")"
DIR="dist"; [ -d "$DIR" ] || DIR="."
URL="http://localhost:8080/"
( sleep 1; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
if command -v python3 >/dev/null 2>&1; then
  echo "Serving $DIR at $URL (Ctrl+C to stop)"; python3 -m http.server 8080 -d "$DIR"
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l 8080 "$DIR"
else
  echo "Install Python 3 or Node.js to run the demo."; exit 1
fi
