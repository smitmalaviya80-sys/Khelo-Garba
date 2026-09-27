# PlayGarba production domain

Status: consolidated on GitHub Pages.

## Architecture

PlayGarba is one product on one canonical origin:

| URL | Responsibility |
| --- | --- |
| `https://playgarba.com/` | Full player and PWA homepage |
| `https://playgarba.com/explore/` | Catalogue and discovery experience |
| `https://playgarba.com/about/`, `/install/`, `/help/`, `/faq/` | Small supporting pages |
| `https://www.playgarba.com/*` | Permanent redirect to the equivalent apex URL |
| `https://live.playgarba.com/*` | Retired legacy host; registrar forwarding to the apex |

The single production artifact is published by the repository's GitHub Pages workflow. The root player is the source entry point, and Explore is published at `/explore/`.

## Compatibility rules

- `www.playgarba.com/<path>` permanently redirects to `playgarba.com/<path>`.
- `live.playgarba.com` is retired and should permanently forward to `playgarba.com` while preserving paths and query strings where the registrar supports it.
- `/catalogue/` is retained only as a compatibility path and the canonical public catalogue route is `/explore/`.
- Query strings must be preserved so player state such as `?genre=`, `?song=` and `?nonstop=` survives old links.
- Standalone song and release trees are not published; catalogue detail remains in-page Explore state.

## PWA contract

The manifest, service worker, canonical tags, sitemap, robots file and social metadata all use `playgarba.com`. The cache generation is incremented when the origin or Explore route changes. The service worker treats both `/explore/` and the retained internal `/catalogue/` asset paths as catalogue navigation, while `/catalogue/` is never a canonical public URL.

## Deployment

The Pages workflow builds the current `main` artifact and deploys `_site` with the official Pages actions. See [`docs/deployment/GITHUB-PAGES.md`](../deployment/GITHUB-PAGES.md) for the DNS and cutover runbook.

## Verification checklist

After a production deployment, verify:

1. `/` immediately renders the player and uses the 2K WebP background pack.
2. `/explore/` works on direct load and refresh.
3. `www` and `live` redirects are permanent and preserve query state.
4. `/manifest.webmanifest` and `/sw.js` load from the apex origin.
5. PWA install, offline shell, player deep links and Explore navigation work.
6. YouTube playback, Nonstop, queue, favourites and mobile controls remain intact.

DNS changes should be limited to the domain records required by GitHub Pages. Do not remove unrelated mail, verification or registrar records.
