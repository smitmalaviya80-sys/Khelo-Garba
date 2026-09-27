# PGA backend

This directory implements the server-side data plane for PlayGarba Admin (PGA).
The canonical metric, privacy and retention contract is `../ARCHITECTURE.md`.

## Surfaces

| Worker | Exposure | Job |
| --- | --- | --- |
| `ingest-worker.js` | Public at the future `events.playgarba.com` host | Validate and pseudonymise bounded first-party events, then write product events and presence into separate Analytics Engine datasets |
| `admin-worker.js` | Private behind Cloudflare Access at the future PGA host | Verify the Access JWT and return aggregate Home, Live, Audience, Listening and bounded canonical Health presentation data only |
| `rollup-worker.js` | Scheduled only, no public route | Rebuild the seven most recent closed IST days and replace durable D1 daily aggregates idempotently |

PGA intentionally has no raw-event endpoint, listener/session explorer, arbitrary SQL endpoint or stored IP analytics.

## Storage

Recent detail uses two Workers Analytics Engine datasets:

- `playgarba_events_v1`, indexed by the server-HMAC browser key;
- `playgarba_presence_v1`, indexed by the server-HMAC session key.

Durable aggregate history uses D1. Apply `migrations/0001_pga_rollups.sql` to the PGA D1 database before deploying the rollup or admin Worker.

The rollup replaces one closed IST day's rows instead of incrementing counters, so re-running the seven-day repair window cannot double-count lifetime totals.

## Required external configuration

The repository deliberately does not contain real account IDs, D1 IDs, Access audience values, API tokens or HMAC secrets. Copy the relevant `wrangler-*.example.toml` file outside the example name, replace the explicit placeholders, then configure secrets through Wrangler or the Cloudflare dashboard.

### Ingestion Worker

Required bindings/secrets:

- `EVENTS`: Analytics Engine dataset `playgarba_events_v1`;
- `PRESENCE`: Analytics Engine dataset `playgarba_presence_v1`;
- `BROWSER_RATE_LIMITER`: Workers Rate Limiting binding;
- `PGA_HMAC_SECRET`: server-only HMAC secret;
- `PUBLIC_ORIGIN`: normally `https://playgarba.com`.

The rate-limit key is the random browser identifier supplied by the client. It is used only by Cloudflare's rate-limit counter and is not written to PGA storage. The ingestion Worker stores only its HMAC pseudonym.

### Protected PGA API Worker

Required bindings/secrets:

- `DB`: PGA D1 database;
- `CF_ACCOUNT_ID`;
- `ANALYTICS_API_TOKEN`: server-side token allowed to query Analytics Engine;
- `TEAM_DOMAIN`: Cloudflare Access team domain including `https://`;
- `POLICY_AUD`: Access application audience;
- dataset-name vars from the example config.

Cloudflare Access must protect the PGA application/hostname, and `admin-worker.js` verifies `CF-Access-Jwt-Assertion` again before any API route is served. Private API responses are `Cache-Control: no-store`.

Listening analytics resolve canonical song/release/Nonstop labels from the public generated PlayGarba catalogue. `PUBLIC_ORIGIN` may override the default `https://playgarba.com` catalogue origin for deployment/testing. Historical or renamed IDs that are no longer present in generated catalogue files can be mapped explicitly with `CATALOGUE_ID_ALIASES_JSON`, shaped as `{"song":{"old-id":"current-id"},"release":{"old-id":"current-id"}}`. Invalid or unavailable identity data never changes measured event counts: the API returns the count with an unresolved canonical ID and downgrades the Listening envelope to `partial` when the catalogue source itself is unavailable.

#### Health configuration

`GET /api/health` reuses the canonical server-side Health collector and presentation contracts under `../health/`. The browser receives only the bounded `pga-health-presentation/v1` object at `data.presentation`; the raw Health snapshot, GitHub response bodies, tokens and arbitrary infrastructure errors are not returned.

Optional Health configuration is explicit and fail-closed:

- `PGA_EXPECTED_REVISION`: expected full 40-character production revision. If absent or invalid, deployment comparison remains unknown rather than guessed.
- `PGA_GITHUB_REPOSITORY`: repository used for required-check evidence; defaults to `ruddvz/garba` and is validated by the collector.
- `PGA_GITHUB_TOKEN`: optional server-only GitHub token used only in the outbound check-runs request. It is never copied into Health output.
- `PGA_HEALTH_REQUIRED_CHECKS_JSON`: JSON array of required GitHub check names. There is deliberately no invented default required-check list; absent/invalid configuration keeps CI evidence unresolved.
- `PGA_HEALTH_FRESHNESS_BUDGETS_JSON`: optional JSON object of per-subsystem freshness budgets in milliseconds, for example `{"production":60000,"ci":3600000,"rollups":86400000}`.
- `PGA_HEALTH_TIMEOUT_MS`: optional collector timeout. The collector bounds it to its documented maximum.

The Health collector directly acquires canonical production reachability, `build-info.json`, and configured GitHub check-runs. The protected route additionally supplies D1 rollup evidence. A missing D1 binding is presented as unknown; a configured D1 query failure is supplied as failed rollup evidence. Playback, catalogue, telemetry and installed-PWA health stay unknown until their bounded canonical observations are supplied—missing evidence is never converted to healthy.

### Rollup Worker

Required bindings/secrets:

- `DB`;
- `CF_ACCOUNT_ID`;
- `ANALYTICS_API_TOKEN`;
- dataset-name vars.

The example cron runs at 00:40 IST and repairs seven closed IST days. The Worker has no public route.

## API routes

All admin routes require a valid Access JWT:

- `GET /api/home`
- `GET /api/live`
- `GET /api/audience?range=24h|7d|30d|90d`
- `GET /api/listening?range=24h|7d|30d|90d`
- `GET /api/health`

Responses preserve `complete`, `partial` or `unavailable` transport state, freshness and sampled/precision metadata where applicable. Query failure is never converted to a numeric zero.

`GET /api/live` uses the 120-second presence expiry from the architecture contract. It returns active, confirmed-listening and browsing session estimates plus a 30-minute minute-bucket trend and privacy-safe `surface` / `world` / `displayMode` breakdowns. Breakdown rows below three active sessions are suppressed. The summary, breakdown and trend queries are independent: a missing breakdown or trend produces a `partial` response with that field set to `null`, while a failed headline live query produces `503 unavailable` rather than a fabricated zero. Each source and metric preserves exact-versus-estimated sampling metadata and `dataThrough` reflects the freshest successful live source.

`GET /api/health` separates endpoint availability from system-health severity. A successful collector returns HTTP 200 with `data.presentation`; the presentation itself carries `healthy`, `degraded`, `stale`, `unknown` or `failed`. The envelope is `partial` when the protected D1 rollup source is unavailable or the presentation is structurally incomplete. A collector/presentation failure returns `503 unavailable` and never falls back to a misleading rollup-only green response. Server-side Access verification and `no-store` security headers apply before and after Health collection exactly as they do to the other private routes.

Audience region values are suppressed below three measured sessions. Audience acquisition uses bounded UTM source/medium/campaign plus the already-sanitised referrer hostname fallback; no full referrer path or arbitrary query string is returned. Recent free-text search demand is returned only after the query reaches at least three accepted searches; obvious email-, phone- and URL-like input is discarded at ingestion.

Listening keeps `play_intent` separate from provider-confirmed `playback_started`, carries the product surface (`player`, `explore`, `nonstop`) through the aggregate, and resolves content names only from canonical catalogue truth. Nonstop remains a `nonstop_set` content type, never a genre.

## Validation

The backend stays dependency-light and uses platform APIs directly. Run:

```sh
node --check src/pga/backend/ingest-worker.js
node --check src/pga/backend/admin-worker.js
node --check src/pga/backend/rollup-worker.js
node --test src/pga/backend/tests/backend.test.mjs
node --test src/pga/backend/tests/catalogue.test.mjs
node --test src/pga/backend/tests/live-api.test.mjs
node --test src/pga/backend/tests/health-route.test.mjs
node scripts/lib/validate-pga-analytics.mjs
```

The dedicated Health-route workflow also re-runs the canonical Health collector, adapters, snapshot and presentation tests so route changes cannot silently diverge from the Health truth model. The repository-wide `npm run check` remains the final integration gate.

## Deployment evidence

Repository code alone does not prove Cloudflare resources exist. Issue #839 is production-complete only after the external D1 database, Analytics Engine bindings, rate limiter, Access application, custom domain and secrets are configured and the protected endpoints are exercised against deployed Workers.
