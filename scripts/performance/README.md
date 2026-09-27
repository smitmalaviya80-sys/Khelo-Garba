# Player performance measurement

This directory owns reproducible lab measurement for PlayGarba's player. It keeps two different questions separate:

1. **How quickly and cheaply does the first usable player appear?** Use `measure-startup.mjs`.
2. **What happens after that shell while the full catalogue, Search, Nonstop and artwork continue to hydrate?** Use `measure-player.mjs`.

Do not use the second answer as if it described first paint. That was the main ambiguity in the earlier baseline.

## First-usable startup checkpoint

`measure-startup.mjs` runs cold Chromium samples and stops its request checkpoint as soon as the player has both a non-empty song title and a laid-out Play control. It does **not** wait for `GARBA_CATALOGUE_READY`, does not open Search or Nonstop, and never initiates provider playback.

For each cold sample it records:

- shell-ready time from navigation start;
- every same-origin request that started before the shell checkpoint;
- high-resolution background-library request count and unique asset count before the shell;
- retired six-world SVG requests before the shell;
- `/data/songs.json` requests before the shell;
- completed same-origin, artwork and background-library transfer bytes at the shell checkpoint;
- DOMContentLoaded and FCP when Chromium exposes them;
- same-origin request/HTTP/runtime failures.

The hard startup contract is structural, not a runner-speed guess:

- at most **one** `/assets/backgrounds/library/*.webp` request may start before the first usable shell;
- at most **one unique** high-resolution background may be requested before that checkpoint;
- **zero** retired `traditional.svg`, `dandiya.svg`, `devotional.svg`, `folk.svg`, `sanedo.svg` or `fusion.svg` world requests may start before the checkpoint;
- **zero** full `/data/songs.json` hydration requests may start before the checkpoint.

Any structural violation makes `measure-startup.mjs` exit non-zero. The product target for shell readiness is currently **1,000 ms**, but timing is reported rather than used as a hard CI failure because GitHub runner load, serving stack and network emulation are environment-sensitive. A timing regression needs comparable repeated measurements, not one noisy sample.

This distinction matters: a background request can begin before the shell but finish after it. The startup harness therefore records request starts with Playwright events, while transfer-byte values at the checkpoint cover only resources Chromium has completed by that moment.

## Full-lifetime player measurement

`measure-player.mjs` records paired cold and warm Chromium samples for two profiles:

| Profile | Viewport | CPU | Network |
| --- | --- | --- | --- |
| `desktop` | 1440×900, DPR 1 | no CPU throttling | browser/network default |
| `mobile-low-end` | 390×844, DPR 2, touch/mobile | 4× CPU slowdown | 150 ms latency, 200,000 B/s download, 93,750 B/s upload |

The mobile network profile is an explicit repository lab profile, not a claim about a standard carrier or a field percentile.

For every cold/warm phase the full-lifetime report includes:

- player-shell readiness;
- full-catalogue readiness, `/data/songs.json` response completion, and post-response catalogue hydration time;
- DOMContentLoaded, load, FCP and observed LCP timing where Chromium exposes them;
- Search presentation time after the full catalogue is ready;
- Nonstop presentation time from Choose Nonstop activation to a populated open panel;
- layout-shift score;
- Long Task count, total duration and maximum duration;
- same-origin transfer, encoded and decoded bytes;
- catalogue, `songs.json`, artwork and background-library transfer bytes;
- background-library request and unique-asset counts over the measured page lifetime;
- the ten largest same-origin transfers;
- page/runtime/HTTP failures.

Search uses the fixed known query `Khalasi` so runs remain comparable. These page-lifetime artwork counts are useful for detecting background warming, but they must not be described as requests that blocked the first usable player. Use `measure-startup.mjs` for that claim.

## Measurement boundary

Service workers are disabled in both harnesses so an installed-app cache does not hide the network and parsing behavior under test. Neither harness initiates provider playback, so YouTube startup, ads, embed availability, autoplay policy and provider network latency are excluded.

Cold startup samples clear Chromium's HTTP cache before every run. The full-lifetime harness pairs a cache-cleared cold sample with a warm sample in the same browser context. It intentionally does not use Playwright request routing because interception disables normal Chromium HTTP caching and would make a supposed warm sample network-cold.

A provider-confirmed Play transition must be measured separately by the owning playback lane. It must not be reported as a guaranteed PlayGarba response time from these measurements.

## Run it

Use the same temporary Playwright version as the repository browser tooling. Do not add it to `package.json` merely for a measurement run.

```bash
npm install --no-save --no-package-lock @playwright/test@1.55.0
npx playwright install chromium
```

Against a local production-equivalent fixture already serving on port 4173:

```bash
node scripts/performance/measure-startup.mjs \
  --origin=http://127.0.0.1:4173 \
  --profile=mobile-low-end \
  --runs=7 \
  --output=/tmp/playgarba-startup-performance.json

node scripts/performance/measure-player.mjs \
  --origin=http://127.0.0.1:4173 \
  --runs=7 \
  --output=/tmp/playgarba-player-performance.json
```

Against a deployed host when its exact revision is known:

```bash
node scripts/performance/measure-startup.mjs \
  --origin=https://playgarba.com/ \
  --profile=mobile-low-end \
  --runs=7 \
  --output=/tmp/playgarba-startup-production.json
```

Run a single profile while iterating:

```bash
node scripts/performance/measure-startup.mjs --profile=mobile-low-end --runs=3
node scripts/performance/measure-player.mjs --profile=mobile-low-end --runs=3
```

The local production-equivalent fixture should use the same packaging steps as the production/browser fixture: generated catalogue data, concatenated production CSS, packaged player runtimes, generated PWA icons and the extracted approved background pack. Do not compare an unpackaged repository root directly with a deployed build and call the difference a product regression.

## Recorded full-lifetime baseline: 2026-09-08

The persistent summary is in `baselines/2026-09-08-production-equivalent-ci.json`.

Measurement identity:

- tested revision: `057d2da13c4ee155c2cc82d973d7701fd1fb0d0a`;
- Chromium: `140.0.7339.16`;
- Playwright: `1.55.0`;
- 7 cold/warm pairs per profile;
- fixture: production-equivalent repository artifact served by `python3 -m http.server`;
- workflow run: `34270410215`;
- raw artifact: `issue-450-player-performance-baseline`, artifact ID `10073702986`;
- artifact SHA-256: `9d06ed8ed833464cf6fc4903c62e5362a6c7504e58768dea213d9642d45ae301`.

Selected p75 results:

| Metric | Desktop cold | Desktop warm | Mobile low-end cold | Mobile low-end warm |
| --- | ---: | ---: | ---: | ---: |
| Shell ready | 214.9 ms | 93.5 ms | 2644.9 ms | 758.8 ms |
| Full catalogue ready | 364.9 ms | 259.6 ms | 18737.9 ms | 2628.9 ms |
| `songs.json` response end | 254.1 ms | 136.4 ms | 18424.1 ms | 2324.2 ms |
| Post-response catalogue hydration | 110.8 ms | 132.7 ms | 327.2 ms | 308.4 ms |
| Loaded-index Search presentation | 90.8 ms | 87.3 ms | 95.2 ms | 91.0 ms |
| Nonstop presentation | 23.6 ms | 20.9 ms | 104.0 ms | 89.4 ms |
| Observed CLS | 0.0159 | 0.0054 | 0.0426 | 0.0098 |
| Long-task total | 59 ms | 60 ms | 732 ms | 579 ms |
| Largest long task | 59 ms | 60 ms | 221 ms | 195 ms |
| Same-origin transfer | 5.60 MB | 159 KB | 3.80 MB | 399 KB |
| `songs.json` transfer | 1.37 MB | 300 B | 1.37 MB | 300 B |
| Background-library transfer | 3.65 MB | 0 B | 1.85 MB | 241 KB |
| Unique background assets observed | 15 | 15 cached | 8 | 9 |

All 28 measured phases completed with no same-origin HTTP, request or runtime failures. Search returned the expected loaded-index result and Nonstop rendered 73 sets in every phase.

### What the baseline proves, and what it does not

Loaded-index Search is below the issue's proposed 150 ms local presentation budget in every p75 profile/phase above. The 100 ms primary-local-control target remains a target rather than a blanket Play-start guarantee because truthful Playing state depends on YouTube confirmation.

The throttled cold-mobile full-catalogue delay is overwhelmingly transfer-bound. `songs.json` finishes at 18.424 s p75 while post-response catalogue hydration is 327 ms p75. On the paired warm run the body is cache-validating rather than retransferring: `songs.json` transfers 300 B p75. Do not describe the cold 18.4 s value as 18.4 s of JavaScript parsing or rendering.

The production-equivalent fixture uses Python's simple HTTP server and does not model a deployed host's gzip/Brotli configuration. Cold encoded/decoded sizes in this baseline therefore describe the lab fixture, not production compressed transfer cost.

The baseline also observed substantial background warming over the **full measured page lifetime**: all 15 unique 2K backgrounds on desktop cold and 8 on throttled mobile cold. That is evidence of later warming, not proof that all of those requests started before the shell was usable. The new startup checkpoint exists specifically to remove that ambiguity.

Legacy PR #299 owns adaptive visual-world-state work. Issue #602 does not edit `assets/runtime/visual-world-state.js`. Its bounded responsibility is first-paint request shape, visible-only approved artwork promotion and measurement of the shell boundary.

## Budgets and Web Vitals targets

Repository-local targets:

- first usable shell product target: 1,000 ms under comparable normal-mobile measurements, reported rather than made a runner-sensitive hard gate;
- loaded-index Search presentation: less than 150 ms;
- primary local control response: less than 100 ms where the response is fully local;
- provider-confirmed playback start: outside the local-control budget and never guaranteed by these harnesses.

Hard cold-start request-shape budgets are the structural limits documented above: one current high-resolution background maximum, zero retired world SVGs and zero full songs-catalogue requests before shell usability.

For external Core Web Vitals targets, use current field thresholds when evaluating real-user data: LCP at or below 2.5 s, INP at or below 200 ms, and CLS at or below 0.1, assessed at the 75th percentile and segmented by mobile and desktop. Lab observations here are diagnostics, not field-CWV pass claims.

The full-lifetime harness observes LCP and CLS but does not implement a full INP field measurement. Long Tasks and direct interaction timings are diagnostic signals, not substitutes for real-user INP.

## Baseline recording rule

Do not hand-enter estimated timings or transfer sizes. A baseline must retain:

- tested Git commit or deployed build identity;
- target URL and fixture identity;
- browser/Playwright version;
- profile configuration;
- sample count and percentile limitation;
- the exact measurement boundary used;
- cold/warm summaries where applicable;
- raw samples, structural violations, failures and representative request/transfer evidence.

A future startup baseline should be recorded only from a production-equivalent fixture or known deployed revision. Until that run exists, do not claim that the sub-second target has been achieved. The dedicated startup harness now makes that result measurable and reviewable rather than inferred from page-lifetime data.
