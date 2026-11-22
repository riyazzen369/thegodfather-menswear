#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages worktree at /tmp/ghp. public/CNAME is NOT published:
# the site lives at riyazzen369.github.io/thegodfather-menswear until the custom domain's DNS is pointed at GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vite build
G=${GHP:-/tmp/ghp}
find "$G" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a dist/. "$G"/ && rm -f "$G/CNAME" && touch "$G/.nojekyll"
cd "$G" && git add -A && git commit -qm "${1:-Deploy}" && git push -q origin gh-pages
