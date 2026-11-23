#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages: Settings -> Pages -> Branch gh-pages, folder /).
# Uses a git worktree (default /tmp/ghp, override with GHP=...). public/CNAME is NOT published until the
# custom domain's DNS points at GitHub; set PUBLISH_CNAME=1 to publish it (see docs/DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build   # tsc -b + vite build: type errors must not ship
G=${GHP:-/tmp/ghp}
if [ ! -d "$G/.git" ] && [ ! -f "$G/.git" ]; then
  git fetch -q origin gh-pages 2>/dev/null || true
  if git show-ref -q --verify refs/remotes/origin/gh-pages; then
    git worktree add -f "$G" -B gh-pages origin/gh-pages
  else
    git worktree add -f --detach "$G" && (cd "$G" && git checkout -q --orphan gh-pages && git rm -rfq . 2>/dev/null || true)
  fi
fi
find "$G" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a dist/. "$G"/ && touch "$G/.nojekyll"
[ "${PUBLISH_CNAME:-0}" = 1 ] || rm -f "$G/CNAME"
cd "$G" && git add -A && git commit -qm "${1:-Deploy}" && git push -q origin gh-pages
echo "Published. Live in ~1 min: https://riyazzen369.github.io/thegodfather-menswear/"
