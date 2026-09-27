# GitHub Pages production

PlayGarba has one production site and one static artifact. The `main` branch is built by `.github/workflows/pages.yml` and deployed with GitHub Pages. The player is at `https://playgarba.com/`; Explore is at `https://playgarba.com/explore/`.

## Hosting contract

- Build: `npm run check`, then the workflow assembles `_site`.
- Pages actions: `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`.
- Domain: the repository-root `CNAME` contains `playgarba.com`.
- `www.playgarba.com` points to `ruddvz.github.io` and is redirected by GitHub Pages to the apex.
- `live.playgarba.com` is retired. Keep it as registrar URL forwarding to `https://playgarba.com/` with a permanent redirect and path/query preservation where Porkbun supports it.

## DNS

Keep unrelated mail, SPF, verification and forwarding records. The production records are:

| Name | Type | Value |
| --- | --- | --- |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `www` | CNAME | `ruddvz.github.io` |

GitHub's current custom-domain guidance is the source of truth for Pages DNS and HTTPS provisioning: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>.

## Verification

Before changing DNS, verify the default Pages URL serves `/`, `/explore/`, all supporting pages, `manifest.webmanifest`, `sw.js`, `robots.txt`, `sitemap.xml`, and the generated social preview. After DNS propagation, verify the same paths on the apex, that `www` redirects, and that the retired `live` host no longer serves a second application.

The Vercel project is not part of the production path. Keep it only as a temporary rollback reference until the Pages custom domain, DNS, HTTPS certificate and browser smoke checks are all green; then disconnect its repository integration without deleting unrelated account data.
