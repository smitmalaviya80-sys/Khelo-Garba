# PlayGarba

> A community-built home for Garba music, discovery, live sets, archives and listening.

[Open PlayGarba](https://playgarba.com/) · [Deployed build identity](https://playgarba.com/build-info.json) · [Catalogue status](docs/catalogue/status.md) · [Rights policy](docs/catalogue/rights.md) · [Documentation](docs/README.md)

PlayGarba exists because Garba music is everywhere, but it is scattered across albums, cassettes, CDs, streaming releases, live Navratri performances, nonstop sets, community uploads, artist pages, labels and local archives.

The project has two connected goals:

1. build a careful, source-first Garba catalogue that can keep expanding without inventing missing facts;
2. make that catalogue useful through a fast, responsive, installable listening and discovery experience.

## Principles

- **Source first.** Unknown dates, durations, credits and rights stay unknown until evidence supports them.
- **No silent piracy.** Commercial audio is not copied into GitHub simply because it is available elsewhere. Under the current product policy, executable playback uses exact verified YouTube routes through the visible YouTube player; other provider URLs may remain only as provenance/migration evidence.
- **Canonical data stays separate from discovery leads.** A Reddit recommendation, playlist or community upload can be useful evidence without automatically becoming canonical release metadata.
- **Long-form Garba matters.** Live performances, nonstop albums and timestamped chapters are first-class discovery objects.
- **Stable runtime contracts matter.** The production player, generated catalogue, service worker and deployed build identity have explicit validation so the Pages deployment cannot silently drift from source truth.

## Music coverage

The player presents six visual worlds:

| Player world | Music represented |
| --- | --- |
| **Traditional** | Traditional Garba, roots/archive material, Tran Taali, Be Taali and related forms |
| **Dandiya** | Raas, Dandiya and related dance traditions |
| **Devotional** | Mataji, Krishna Garba, devotional Raas and temple-oriented material |
| **Folk** | Gujarati folk, lokgeet, Hinch, Dakla and related traditions |
| **Sanedo** | Sanedo and high-energy community/festival material |
| **Fusion** | Modern Gujarati Garba, electronic, hip-hop, remix, cinematic and crossover material |

These are presentation worlds. The canonical taxonomy is more detailed and lives in `data/taxonomy.json`.

For the exact deployed revision and current build-time counts, use [`/build-info.json`](https://playgarba.com/build-info.json). For definitions, source layout and dated historical context, see [`docs/catalogue/status.md`](docs/catalogue/status.md).

## Playback and rights

PlayGarba is a discovery and listening project, not a raw-audio mirror.

Executable music playback is YouTube-only:

- exact verified YouTube recordings and directly verified timestamped chapters can play through the visible YouTube IFrame player;
- Apple Music, Spotify, Amazon Music, SoundCloud, Bandcamp, Qobuz and direct-audio records may remain as source/provenance evidence, but they do not become executable fallbacks;
- unchaptered multi-song YouTube releases, provider reference pages and ambiguous same-title recordings remain non-executable until exact identity is verified;
- PlayGarba does not extract raw streams, hide the YouTube player, suppress YouTube advertising or cache YouTube media for offline playback.

The playback contract is in [`docs/product/youtube-first-playback.md`](docs/product/youtube-first-playback.md). Rights/provenance policy is in [`docs/catalogue/rights.md`](docs/catalogue/rights.md).

## Repository structure

```text
garba/
├── index.html                  # production player entry point
├── app.js                      # production app/controller source
├── simple-runtime.js           # launch-safe runtime layer
├── provider-runtime.js         # YouTube-only execution policy
├── player-continuity.js        # selection/route continuity safeguards
├── youtube-player-runtime.js   # visible YouTube IFrame controller
├── nonstop-browser.js          # production Nonstop Garba browser
├── sw.js                       # production service worker
│
├── styles/                     # ordered, purpose-named CSS source layers
├── src/
│   └── optional/               # retained browser experiments, not shipped by Pages
├── assets/
│   ├── backgrounds/            # production artwork packs and world assets
│   └── icons/                  # app/PWA icons
├── data/
│   ├── catalogue/              # canonical source shards and manifest
│   ├── discovery/              # artists, recommendations and live/nonstop sets
│   ├── rights-acquisition/     # rights operations data
│   └── README.md               # source vs generated-data contract
├── docs/
│   ├── catalogue/              # schema, status, sources and catalogue rights
│   ├── product/                # design, playback, responsive/PWA and UX notes
│   ├── rights/                 # partnership and licensing operations
│   ├── operations/             # hosting, ingestion and publishing procedures
│   ├── project/                # roadmap
│   └── README.md               # canonical documentation index
├── scripts/                    # catalogue, validation and operations tooling
└── .github/                    # issues and CI/Pages workflows
```

The root is intentionally small. A browser file should live there only if it is part of the production runtime or a standard repository entry point.

GitHub Pages builds one production artifact at `playgarba.com`. Production `app.js` and `styles.css` are assembled from several source layers, so source-file byte differences alone are not proof that production is stale. The deployed `/build-info.json` records the exact Git revision and SHA-256 digests for key assembled files.

## Catalogue layout

Canonical catalogue shards are listed explicitly in `data/catalogue/index.json`. That manifest controls what the build consumes.

```text
data/catalogue/
├── index.json
├── songs/
├── releases/
├── free-sources/
└── archive/                    # retained but deliberately unindexed fragments
```

Existing numbered shards are append-only. Renumbering old canonical shards merely to make the sequence look prettier would create noisy history and contributor conflicts. New semantic shards should keep the next sequence number and add a descriptive suffix.

Generated aggregate files should be rebuilt through the project scripts instead of edited as competing sources of truth.

## Run locally

```bash
npm run check
npm run serve
```

Then open `http://localhost:4173`.

`npm run check` rebuilds the catalogue and validates runtime/data contracts, YouTube route truth, repository structure, documentation and the build-identity contract.

PWA installation requires HTTPS or a browser-recognised local development origin.

## Contributing

Useful contributions include missing songs/releases, old track lists, regional artists, live/nonstop sets, timestamp chapters, spelling/transliteration corrections, official sources, duplicate detection, classification improvements, rights corrections, player bugs, accessibility fixes and performance work.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing catalogue or rights data.

The most important rule is simple: **do not guess catalogue facts and do not upload music you do not have the right to redistribute.**

A blank field is more useful than confident-looking fiction.

## Documentation

Start at [`docs/README.md`](docs/README.md). The main references are:

- [`docs/catalogue/status.md`](docs/catalogue/status.md)
- [`docs/catalogue/schema.md`](docs/catalogue/schema.md)
- [`docs/catalogue/rights.md`](docs/catalogue/rights.md)
- [`docs/catalogue/song-catalog-contract.md`](docs/catalogue/song-catalog-contract.md)
- [`docs/product/design-system.md`](docs/product/design-system.md)
- [`docs/product/youtube-first-playback.md`](docs/product/youtube-first-playback.md)
- [`docs/product/playback-runtime-coverage.md`](docs/product/playback-runtime-coverage.md)
- [`docs/product/responsive-pwa.md`](docs/product/responsive-pwa.md)
- [`docs/project/roadmap.md`](docs/project/roadmap.md)

## Licence status

The repository is public, but a repository-wide software/data licence still needs to be selected. Public visibility by itself does not make reuse rights legally unambiguous. Underlying songs, recordings, artwork, embeds and third-party material retain their own copyrights and licence terms.

PlayGarba should become more complete over time without pretending it is already complete. If something is missing, preserve the gap, find the evidence and add it carefully.
