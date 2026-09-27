# GARBA data

`data/` contains both source-of-truth records and generated runtime outputs. Keep those roles separate.

## Source-of-truth data

- `catalogue/` — canonical song, release and rights-audited source shards
- `discovery/` — artist leads, recommendations and verified live/nonstop set discovery
- `rights-acquisition/` — rights outreach and acquisition operations
- `genres.json` — six visual player worlds
- `taxonomy.json` — detailed Garba music taxonomy
- `playback-sources*.json` — curated provider mappings consumed by the catalogue build; release-specific chapter routes must preserve the verified video ID, timestamp and canonical release ID
- `direct-audio.json` — direct-audio entries that satisfy the rights contract
- `hosting-rights.json` and `master-intake.json` — hosting/publishing rights inputs

## Generated files

The catalogue build writes aggregate runtime files such as `songs.json`, `releases.json`, `free-audio-sources.json`, `playback-sources-generated.json` and `playback-coverage.json`.

Do not hand-edit a generated aggregate when the canonical record lives in a shard. Run:

```bash
npm run catalogue
```

The canonical manifest is `catalogue/index.json`. A catalogue shard placed in `catalogue/songs/`, `catalogue/releases/` or `catalogue/free-sources/` is not part of the build until the manifest references it.

## Discovery data

Discovery data is evidence and research material, not automatically canonical release metadata.

- Artist discovery shards use `artists-YYYY-NN.json`.
- Recommendation shards use `recommendations-YYYY-NN.json`.
- Live/nonstop set shards are indexed through `discovery/sets/index.json`.

The two-digit sequence is explicit even for the first shard. For example, use `artists-2026-01.json`, not `artists-2026.json`. This keeps lexical ordering predictable and avoids a special-case filename for the first wave.

## Historical/unindexed material

`catalogue/archive/` stores retained source fragments that are intentionally outside the canonical build. Keeping them there prevents filename collisions and accidental ingestion while preserving provenance for later reconciliation.

## Naming

- JSON filenames use lowercase kebab-case.
- Numbered catalogue shards are append-only. Do not renumber established canonical shards just to close historical gaps because that creates unnecessary merge conflicts and destroys useful history.
- New semantic shards should include a short descriptive suffix after their sequence number.
- Discovery waves use explicit zero-padded sequence numbers.
- Generated filenames are stable API/runtime contracts and should change only with an explicit migration.
