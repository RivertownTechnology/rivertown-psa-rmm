# Deploying the marketing site to Cloudflare Pages

The marketing site (`forgepsa.com`) is served from Cloudflare Pages. The app and
API live elsewhere (Railway) — see the main `README.md` for their deploy
instructions.

## Initial Cloudflare Pages setup

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages →
   Connect to Git** and select this repo.
2. Configure the build with these exact settings:

| Setting                    | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Production branch          | `main` (or `beta` while still pre-launch)                          |
| Framework preset           | None                                                               |
| Build command              | `pnpm install --frozen-lockfile && pnpm --filter @forgepsa/marketing build` |
| Build output directory     | `apps/marketing/dist`                                              |
| Root directory             | `/` (leave blank — we build from the monorepo root)                |
| Node version (env var)     | `NODE_VERSION=20`                                                  |
| Package manager (env var)  | `PNPM_VERSION=9`                                                   |

3. Environment variables (same page):

| Variable         | Value                                |
| ---------------- | ------------------------------------ |
| `VITE_API_URL`   | `https://api.forgepsa.com`           |
| `NODE_VERSION`   | `20`                                 |
| `PNPM_VERSION`   | `9`                                  |

4. After the first deploy succeeds, go to **Custom domains** and add
   `forgepsa.com` and `www.forgepsa.com`. Cloudflare will auto-provision SSL.

## What's committed in this folder

- `public/_redirects` — SPA fallback so `/pricing`, `/signup`, etc. serve
  `index.html` instead of 404. Also redirects `/login` → `app.forgepsa.com/login`.
- `public/_headers` — security headers (CSP, HSTS, frame-options, etc).
- `public/robots.txt` and `public/sitemap.xml` — SEO basics.
- `index.html` — Open Graph + Twitter Card meta tags, JSON-LD structured data.

## Verifying after deploy

```
curl -I https://forgepsa.com/                 # should 200
curl -I https://forgepsa.com/pricing          # should 200 (not 404 — SPA fallback)
curl    https://forgepsa.com/robots.txt       # should list sitemap
curl    https://forgepsa.com/sitemap.xml      # should list 5 URLs
curl -I https://forgepsa.com/login            # should 302 to app.forgepsa.com
```

## Signup form flow

The `/signup` page posts to `${VITE_API_URL}/api/v1/signup`. In production that's
`https://api.forgepsa.com/api/v1/signup`. Locally it falls back to `/api/v1/signup`
via the Vite dev proxy (see `vite.config.ts`).

CORS on the API must allow `https://forgepsa.com` and `https://www.forgepsa.com`.
Both origins are already listed in `apps/api/src/server.ts`.
