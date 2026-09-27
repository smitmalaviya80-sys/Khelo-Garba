# Roadmap

Updated: 8 September 2026

This roadmap describes product work, not live deployment identity. For the exact production revision, catalogue version and deployed counts, read:

```text
https://playgarba.com/build-info.json
```

## Foundation — complete

- [x] Responsive full-screen player across phone, tablet, desktop and short-landscape layouts
- [x] Six visual worlds with background crossfade/preload
- [x] Safe-area and reduced-motion support
- [x] Search, My Garba/favourites and Up next surfaces
- [x] FIFO manual Up next plus actual listening-history Previous behavior
- [x] Media Session integration
- [x] PWA manifest, icons, service-worker shell, offline fallback and network-first catalogue/runtime updates
- [x] Explore as the canonical supporting catalogue/discovery surface
- [x] Nonstop as a first-class full-recording mode using the shared visible YouTube engine
- [x] One canonical production artifact served by GitHub Pages at `playgarba.com`
- [x] Canonical player route `/` and Explore route `/explore/` with `/catalogue/` retained only as compatibility navigation
- [x] Universal social metadata / OG image and platform icon matrix

## Playback truth and catalogue migration — active

- [x] Data-driven verified catalogue boundary
- [x] YouTube-only executable playback policy
- [x] Non-YouTube provider URLs demoted to provenance/migration evidence rather than executable fallbacks
- [x] Exact-route, release-reference and unchaptered-release safety classification
- [x] Continuous-set/Nonstop modelling without fake duplicate audio tracks
- [x] Artist-identity checks for generated performance chapters
- [x] Source-only / catalogue-alias / Nonstop-only presentation redirects for legacy catalogue identities
- [ ] Complete exact YouTube migration for the remaining provider-backed catalogue backlog under #221 / #157
- [ ] Finish remaining duplicate-release and track-count reconciliation under #278
- [ ] Continue factual presentation metadata enrichment under #276 without inventing cultural/recording claims
- [ ] Complete licensing/copyright review for any future directly hosted master; current executable product remains YouTube-only

The current deployed YouTube-playable count is not hard-coded here. Read `/build-info.json` or run `npm run youtube:coverage` on the exact source revision being discussed.

## Player reliability — active

The September player audit is coordinated by #436. Its implementation order is deliberate because several lanes touch the same runtime files.

- [ ] #437 — truthful initial/restored selection and automatic continuation readiness
- [ ] #438 — atomic song/Nonstop playback state, time and status transitions
- [ ] #439 — persistent listener-facing playback failures and recovery
- [ ] #440–#443 — stable metadata layout, mobile reachability, input accessibility and verified contrast
- [ ] #444 — shared player/Explore search contract with reviewed aliases and relevance ranking
- [ ] #445–#447 — Nonstop chapter navigation/resume and exact-context sharing
- [ ] #449 — reduce redundant playback-controller ownership after the P0 state work lands

#408 owns the transition to one deliberate primary Play action with a visible integrated YouTube performance stage. Do not implement a competing second-step playback interaction in documentation or another runtime lane while #408 is active.

## Reliability, measurement and release evidence — active

- [ ] #415 — finish deterministic Chromium/WebKit browser viewport smoke infrastructure
- [ ] #450 — establish reproducible player startup/interaction/artwork performance baselines
- [ ] #451 — make PWA update/offline behavior safe for active listening sessions
- [ ] #452 — complete the release-acceptance matrix across critical listening journeys
- [ ] #453 — keep production documentation aligned and expose exact deployed build identity
- [ ] Real-device iOS Safari and Android Chrome QA
- [ ] Real iPad portrait/landscape QA
- [ ] Screen-reader audit
- [ ] Production Lighthouse/performance measurements with recorded revision/profile
- [ ] Analytics/privacy decision before introducing new telemetry

## Deployment and launch contract

The old “choose a host/provider/domain” work is no longer an open roadmap decision.

- GitHub Pages is the only production artifact source.
- `playgarba.com` is the canonical production origin.
- The player lives at `/`; Explore lives at `/explore/`.
- Pages assembles source-native runtime/style files into the deployed artifact and now emits `/build-info.json` so audits can identify the exact shipped revision and key artifact digests.
- DNS/hosting architecture changes require their own explicitly claimed infrastructure issue; playback/catalogue agents must not revive a Vercel/host split incidentally.

Remaining launch-quality work is verification rather than another hosting migration:

- [ ] keep production-host smoke checks green after deployments;
- [ ] finish real-device/PWA install verification;
- [ ] finish rights/licensing review for any content whose distribution model changes;
- [ ] close remaining P0 player reliability issues before calling the listening experience release-ready.

## Build and audit vocabulary

Do not compare undocumented counts from different layers.

- **Raw source** = indexed source rows before retired IDs are removed.
- **Active generated catalogue** = non-retired generated rows.
- **Ordinary-listening / curated-visible** = active rows shown as normal catalogue objects after presentation aliases/source-only editions/Nonstop handoffs are hidden.
- **Source-evidence mapped** = provider/source evidence exists; this is not executable coverage.
- **YouTube playable** = exact controllable YouTube route accepted by route-truth validation.
- **Playable in this session** = runtime/browser state and therefore not a build-time numeric claim.

`/build-info.json` reports these layers separately so future roadmap decisions start from the deployed artifact instead of a stale document.
