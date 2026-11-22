# Deploy

## GitHub Pages (current)

The site is static. `npm run deploy` (`scripts/deploy.sh`):

1. builds with Vite (`dist/`, relative asset paths)
2. checks out the `gh-pages` branch into a worktree (`/tmp/ghp`, override with `GHP=/path`)
3. replaces its contents with `dist/`, adds `.nojekyll`, removes `CNAME` (unless `PUBLISH_CNAME=1`)
4. commits and pushes `gh-pages`

One-time repo setup: **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `(root)`**.

Live URL: https://riyazzen369.github.io/thegodfather-menswear/ (updates about 1 minute after the push).

On Windows, run it from Git Bash (`npm run deploy`), or build with `npm run build` and push `dist/` to `gh-pages` any way you like.

## Custom domain: www.thegodfatherclothings.in

1. At the domain registrar, add:

   | Type | Host | Value |
   |---|---|---|
   | CNAME | `www` | `riyazzen369.github.io` |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |

   Remove any other A/AAAA/CNAME records for `@` and `www` (for example the registrar's parking page).
2. Check propagation: `dig www.thegodfatherclothings.in +short` should return `riyazzen369.github.io.` and the four IPs.
3. Deploy with the CNAME: `PUBLISH_CNAME=1 npm run deploy` (`public/CNAME` contains `www.thegodfatherclothings.in`). Then in **Settings → Pages → Custom domain** enter `www.thegodfatherclothings.in` and save.
4. When the DNS check passes and the certificate is issued (minutes to a few hours), tick **Enforce HTTPS**. The apex `thegodfatherclothings.in` redirects to `www`.
5. Optionally, verify the domain under GitHub **Settings → Pages → Verified domains** (a TXT record) to prevent takeover.

Don't publish `CNAME` before DNS points at GitHub, or the github.io URL will redirect to a domain that doesn't resolve yet.

## Switch the canonical and meta URLs

The build currently points at the github.io address. When the domain is live, replace `https://riyazzen369.github.io/thegodfather-menswear/` with `https://www.thegodfatherclothings.in/` in:

- `index.html`: `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, JSON-LD `url`/`logo`/`image`
- `public/robots.txt`: the `Sitemap:` line
- `public/sitemap.xml`: `<loc>`
- `public/404.html`: the redirect target, if present

```bash
grep -rl "riyazzen369.github.io/thegodfather-menswear" index.html public | xargs sed -i 's#https://riyazzen369.github.io/thegodfather-menswear/#https://www.thegodfatherclothings.in/#g'
```

Then `PUBLISH_CNAME=1 npm run deploy`. You can also change `PUBLISH_CNAME` handling in `scripts/deploy.sh` to always publish once the domain is permanent.

## Other hosts

`dist/` works on any static host (Netlify, Vercel, Cloudflare Pages, S3) with no server config. Build command `npm run build`, output `dist`.
