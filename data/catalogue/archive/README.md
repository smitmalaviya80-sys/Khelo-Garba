# Unindexed catalogue archive

This directory preserves catalogue fragments that existed in the repository but were not referenced by `data/catalogue/index.json` at the time of the repository-architecture cleanup.

They are deliberately outside `songs/`, `releases/` and `free-sources/` so the canonical source directories contain only build-indexed shards.

Current retained fragments:

- `rangtaal-release-2025.json` — one Rangtaal release record previously stored as the ambiguous `releases-08.json`
- `rangtaal-song-2025.json` — its song record previously stored as the ambiguous `songs-20.json`
- `umesh-barot-garba-2022-2025.json` — Umesh Barot/Rangili Ramzat records previously stored in a second `songs-30-*` shard but not referenced by the canonical manifest

Do not treat these files as published catalogue data. Reconcile their provenance, matching release records and duplicate status first. If a fragment is promoted later, move verified records into a new canonical shard, add that shard to `index.json`, update counts, rebuild the aggregates and run `npm run check`.
