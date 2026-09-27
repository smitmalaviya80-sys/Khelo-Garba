# Playback runtime coverage

Updated: 8 September 2026

The deployed build publishes its exact revision, catalogue version and coverage counters at:

```text
https://playgarba.com/build-info.json
```

Do not use an old source count or provider-route count as a synonym for executable playback coverage.

## Four different coverage layers

PlayGarba tracks four distinct questions:

1. **Source evidence** — does this catalogue row retain a verified source/provider reference?
2. **Active catalogue** — is this row non-retired in the generated catalogue?
3. **Exact executable route** — does the row have an exact controllable YouTube route accepted by route-truth validation?
4. **Playable in this session** — can that exact route actually load and remain usable in the current browser/network/embed session?

Only layer 3 is build-time YouTube-playable coverage. Layer 4 is runtime-dependent and must not be invented from catalogue data.

`/build-info.json` therefore reports source-evidence and exact YouTube counts separately and leaves `sessionPlayableCount` as `null` with an explanation.

## Build path

1. `scripts/build-catalogue.mjs` builds `data/songs.json`, generated release routes and `data/playback-coverage.json`.
2. `scripts/enrich-runtime-songs.mjs` merges all playback manifests declared by `data/catalogue/index.json` into the generated song records.
3. `scripts/validate-runtime-song-routes.mjs` fails CI when a generated route violates route identity or exactness rules.
4. `scripts/report-youtube-first-coverage.mjs` classifies the enriched generated catalogue into exact controllable YouTube coverage and migration/reference backlog.
5. `scripts/lib/generate-build-info.mjs` combines catalogue/source/presentation counts with that YouTube coverage report. During GitHub Pages assembly it also fingerprints key deployed files after `app.js` and `styles.css` are built.
6. `scripts/lib/validate-build-info.mjs` prevents stale provider/hosting documentation from becoming the build contract again and verifies the emitted diagnostic structure.

Curated song mappings override generated release-level evidence in the order declared by `data/catalogue/index.json`, but the final enriched result must still pass exact-route and duplicate-route safety validation.

## Source evidence is not executable playback

Under the current YouTube-only product policy, a row may legitimately retain Apple Music, Spotify, Amazon Music, SoundCloud, Bandcamp, Qobuz, direct-audio or other provider evidence while being non-executable in PlayGarba.

These fields preserve provenance and migration research. They do not create a fallback player.

Likewise:

- `verified-release-source` can prove a release exists without proving the selected song is directly playable;
- `verified-release-track-reference` is evidence, not exact selected-song playback;
- `verified-unchaptered-youtube-release` is YouTube evidence but not a safe exact selected-song start;
- a track-shaped provider URL inherited by several songs is not made exact by labelling it so;
- a same-title recording from another performer is not an acceptable substitute.

## Exact YouTube route meaning

The repository's current YouTube coverage report treats a route as build-time playable only when it is classified as an exact controllable YouTube route and is not marked as search-only/reference-only/unchaptered-manual evidence.

Examples include:

- an exact official/verified song video;
- a verified label/artist/distributor YouTube track whose recording identity matches the selected catalogue row;
- a verified YouTube performance or continuous-set chapter with a directly sourced `youtubeStartSeconds`;
- another YouTube route whose source type and identity survive runtime route validation.

A mapped start of `0` is a valid explicit chapter start. Missing timestamps must never be synthesized from neighbouring durations.

## Runtime playability is a separate state

Even an exact accepted YouTube route can fail in a particular session because of:

- offline or degraded connectivity;
- YouTube IFrame API load failure/timeout;
- a removed/private/embedding-disabled video;
- autoplay/user-gesture restrictions;
- a stale or superseded selection request;
- another runtime/player state failure.

That is why build-time `youtubePlayable` is not called “currently playing” or “session playable.” The P0 player reliability lanes (#437–#439) own readiness, atomic state and user-facing recovery semantics.

## Presentation counts

Generated `data/songs.json` and `data/releases.json` can retain hidden presentation rows for migration safety.

- `catalogue`: normal ordinary-listening object;
- `catalogue-alias`: historical duplicate identity redirected to a richer canonical release;
- `source-only`: provenance/source edition retained without becoming another ordinary listening object;
- `nonstop-only`: continuous/source identity that hands off to the canonical Nonstop listening object.

Therefore the active generated count can be larger than the ordinary-listening/curated-visible count. `/build-info.json` reports both rather than forcing one number to serve both meanings.

## Exact-track integrity rule

A track-shaped URL is not proof that a release-level route identifies every song on the release.

The catalogue builder prefers truthful source shapes. If only a representative track source exists for a multi-song release, it remains reference-only. Enrichment and runtime validators also reject supposedly exact URLs that collide across different song identities.

An exact-selection count may decrease when false precision is removed. That is a correctness improvement, not a playback regression.

## Deployment identity

GitHub Pages owns one production artifact at `playgarba.com`.

The deployed artifact intentionally differs byte-for-byte from some source files because Pages concatenates runtime/style layers. In particular, production `app.js` includes source `app.js` plus the seek-state and continuous-set runtimes, and production `styles.css` is assembled from the ordered stylesheet layers.

For that reason, comparing a live file directly with one source file is not a reliable freshness test.

`/build-info.json` records:

- the full deployed Git SHA;
- catalogue version;
- raw/retired/active/ordinary-listening counts;
- source-evidence and YouTube coverage counts;
- SHA-256 digests for key assembled player, Explore, PWA and catalogue files.

Use that diagnostic first when auditing production freshness.

## Commands

```sh
npm run catalogue
npm run youtube:coverage
npm run build:identity:validate
npm run check
```

`npm run youtube:coverage` answers the build-time route question for the checked-out revision. `/build-info.json` answers which revision and build facts are actually deployed. Browser/player tests answer whether a route works in a particular session.
