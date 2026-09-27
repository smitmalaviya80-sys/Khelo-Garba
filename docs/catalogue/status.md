# Garba catalogue status

Updated: 8 September 2026

The live catalogue is changing quickly. Do not use an old Markdown count, screenshot, source-file byte comparison or chat transcript as proof of what is deployed.

The deployed source of truth is:

```text
https://playgarba.com/build-info.json
```

`/build-info.json` is generated from the exact GitHub Pages build after the production `app.js` and `styles.css` bundles are assembled. It identifies the deployed Git commit, catalogue version, source/active/ordinary-listening counts, YouTube coverage and SHA-256 digests for key deployed files.

## Dated source baseline

This snapshot is useful for historical comparison only. The live diagnostic supersedes it after the next deployment.

Baseline revision: `7de0b41a7dfa8c347e966e3a60b0700444011de8`  
Catalogue index version: `0.29.1`  
Captured: 8 September 2026

| Measure | Baseline | Meaning |
| --- | ---: | --- |
| Raw indexed source-song rows | 1,682 | Song rows across indexed source chunks before retired IDs are removed |
| Retired song IDs | 9 | Historical duplicate IDs retained for migration/redirect safety |
| Active generated song rows | 1,673 | Non-retired rows generated into `data/songs.json` |
| Raw indexed source-release rows | 241 | Release rows across indexed source chunks before retirement |
| Retired release IDs | 2 | Historical release IDs retained for migration/redirect safety |
| Active releases | 239 | Non-retired rows generated into `data/releases.json` |
| Music taxonomy categories | 19 | Canonical browse taxonomy categories |
| Visual worlds | 6 | Presentation worlds; they are not the music taxonomy |
| Rights-audited free/access resources | 20 | Provenance/acquisition resources, not automatically redistributable masters |
| Exact controllable YouTube routes | 883 | Build-time routes classified as executable under the YouTube-only policy |
| YouTube-playable coverage | 52.8% | 883 / 1,673 active generated song rows at this baseline |
| YouTube migration backlog | 790 | Active rows not yet classified as exact controllable YouTube playback |

The ordinary-listening song/release counts are intentionally not frozen in this document because presentation-only aliases, provenance-only source editions and Nonstop handoffs are still being reconciled. `/build-info.json` reports those counts for each deployed revision.

## Count vocabulary

Use these terms precisely:

- **Raw source songs/releases**: every row in the indexed catalogue source chunks, including rows retained only so historical IDs can be migrated safely.
- **Active songs/releases**: raw rows after `retiredSongIds` / `retiredReleaseIds` are removed. This is the generated catalogue denominator.
- **Ordinary-listening / curated-visible songs/releases**: active rows whose `presentationRole` is normal `catalogue`. `catalogue-alias`, `source-only` and `nonstop-only` rows remain source truth but do not become duplicate ordinary listening objects.
- **Source-evidence mapped**: an active row has retained provider/source evidence. This does **not** mean the source may execute in PlayGarba.
- **YouTube playable**: an active row has an exact controllable YouTube route accepted by the repository's YouTube coverage policy.
- **Playable in this session**: a runtime/browser fact, not a build-time catalogue count. An exact YouTube route can still be temporarily unusable because of connectivity, YouTube API loading, embed availability, autoplay/user-gesture state or another browser/session failure. `build-info.json` therefore reports this value as `null` with an explanation rather than fabricating a number.

This vocabulary prevents four different denominators from being called “the catalogue” or “playable.”

## Playback policy

PlayGarba is YouTube-only for executable music playback.

- Exact verified YouTube routes may play through the visible YouTube IFrame player.
- Apple Music, Spotify, Amazon Music, SoundCloud, Bandcamp, Qobuz, direct-audio records and other provider URLs may remain as provenance/migration evidence, but they are not executable fallbacks.
- A release page or representative provider track is not exact-song playback.
- An unchaptered multi-song YouTube upload is not promoted to a selected song unless the selected boundary is verified.
- Same-title recordings by another performer are not substitutions for the selected recording.
- Continuous/Nonstop recordings remain one recording; verified chapters identify positions inside that recording rather than manufacturing separate audio files.

Run `npm run youtube:coverage` after rebuilding the catalogue to inspect the current source revision. Use the deployed `/build-info.json` when the question is what production actually contains.

## Discovery layer

Discovery is separate from canonical release identity so PlayGarba can retain verified live/Nonstop sets, artist research and recommendation evidence without pretending every discovery source is an official release.

At the baseline above, repository validation reported 84 canonical discovery/Nonstop records, 50 discovery artists and 94 recommendation signals. Those are dated facts, not permanent totals.

`data/discovery/sets/index.json` is the canonical Nonstop registry. The retired parallel `data/nonstop.json` must not be recreated.

## Source-of-truth layout

- `data/catalogue/index.json` declares the catalogue version, expected active counts, indexed song/release/free-source chunks, retirement lists, playback-source manifests and generated-file paths.
- `data/catalogue/songs/` contains source song shards.
- `data/catalogue/releases/` contains source release shards.
- `data/catalogue/free-sources/` contains rights/access research records.
- `data/songs.json` and `data/releases.json` are generated active runtime/catalogue outputs.
- `data/taxonomy.json` is the 19-category music taxonomy.
- `data/genres.json` maps catalogue content into six presentation worlds.
- `data/discovery/sets/` is the canonical Nonstop/discovery-set source.
- playback manifests listed by `data/catalogue/index.json` preserve exact routes and migration evidence.

Run:

```sh
npm run check
```

That rebuilds the catalogue and validates release identity, taxonomy, Nonstop modelling, route truth, YouTube-only runtime policy, PWA packaging, documentation and the build-identity contract.

## What “complete” means

This repository does not claim to contain every Garba recording or every private/unindexed social recommendation on the internet.

`trackImportComplete: true` means the named release was imported at track level from the verified source used for that release. It does not mean licensing is complete, every track is playable on YouTube, or the release is the only edition that exists.

Unknown dates, durations, credits, tracklists and timestamps remain unknown rather than being guessed.
