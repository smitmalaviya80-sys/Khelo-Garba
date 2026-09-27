# Contributing to GARBA

GARBA is a source-first, community-built Garba catalogue and player. Contributions can be code, metadata, discovery evidence, rights corrections or product fixes.

## Non-negotiable rules

1. **Do not guess catalogue facts.** Unknown dates, durations, credits, release details and rights remain unknown until a source supports them.
2. **Do not upload music you do not have the right to redistribute.** Public availability is not the same as redistribution permission.
3. **Keep discovery leads separate from canonical metadata.** Community recommendations can be useful without being promoted immediately into the canonical catalogue.
4. **Do not edit generated aggregates as competing sources of truth.** Change the canonical shard, then rebuild.

Read [`docs/catalogue/rights.md`](docs/catalogue/rights.md) before adding audio or download sources.

## Concurrent agent coordination

This repository is edited by multiple concurrent agents. **Claim an implementation lane before coding.**

1. Fetch current remote `main`.
2. Read [`AGENTS.md`](AGENTS.md) and issue #364, **[Agent Board] Active work claims**.
3. Check the target issue comments and open PRs for overlapping scope or files.
4. Split broad master/programme issues into non-overlapping child issues before parallel implementation.
5. Post the machine-readable `agent-claim` block on the implementation issue and confirm that your claim is the first unreleased claim.
6. Use the exact claimed branch and stay inside the claimed scope.
7. Release the claim when the lane is merged, abandoned or handed off.

GitHub assignees alone do not identify an agent because several agents may operate through the same account. The claim comment plus branch is the ownership identity.

See [`docs/operations/agent-coordination.md`](docs/operations/agent-coordination.md) for the full protocol, conflict handling and release format.

## Local setup

```bash
npm run check
npm run serve
```

Then open `http://localhost:4173`.

`npm run check` rebuilds the catalogue and validates JavaScript syntax, runtime contracts, discovery data, direct-audio rights, hosting/publishing inputs, repository organisation and local documentation links.

## Repository responsibilities

- Production browser files live at the root only when they are explicit runtime entry points.
- Optional or retained browser experiments belong in `src/optional/`.
- CSS source layers live in `styles/` and use ordered semantic names.
- Canonical catalogue sources live under `data/catalogue/` and are listed by `data/catalogue/index.json`.
- Discovery leads and live/nonstop research live under `data/discovery/`.
- Rights-acquisition working data lives under `data/rights-acquisition/`.
- Documentation belongs in the appropriate `docs/` responsibility folder. Start at [`docs/README.md`](docs/README.md).

See [`data/README.md`](data/README.md) for the source/generated-data contract.

## Adding or correcting music

For a song, release, live set or correction, provide the strongest source you can find. Official artist, label, distributor and release pages are preferred for canonical metadata. Community posts, playlists and uploads can still be valuable discovery evidence when labelled accurately.

Useful fields include:

- title;
- artist(s);
- year or release date, when known;
- release/album name;
- Garba category/style;
- official or otherwise reliable source URL;
- whether it is a track, release, live set, nonstop set or timestamped chapter;
- Gujarati spelling/transliteration when known;
- explicit notes about uncertain fields.

For corrections, identify the exact record, provide the evidence and distinguish between “demonstrably wrong” and “ambiguous”. Preserve useful alternate spellings/aliases instead of deleting legitimate variants.

## Catalogue shards

Canonical shards are deliberately chunked to reduce merge conflicts.

- `data/catalogue/songs/` — song records
- `data/catalogue/releases/` — release records
- `data/catalogue/free-sources/` — rights-audited free/access resources
- `data/catalogue/archive/` — retained fragments that are intentionally not part of the build

Established canonical shard numbers are append-only. Do not renumber existing shards simply to remove historical gaps. For new semantic shards, use the next sequence number plus a concise descriptive suffix.

After changing canonical catalogue data, run `npm run check`. The build verifies the manifest counts and regenerates runtime aggregates.

## Live and nonstop sets

Long-form Garba is first-class material. Include the source URL and timestamps when available. A timestamped chapter is a segment of a performance, not automatically a separately released commercial track.

## Player changes

Product contributions are welcome for accessibility, responsive layouts, keyboard navigation, PWA/offline behaviour, playback-provider integration, search, discovery, performance and visual polish.

Keep the visual world dominant. Avoid replacing the experience with a stack of opaque dashboard cards.

If a new browser module needs to ship in production, add it deliberately. Update the HTML/runtime reference, deployment allowlist, service-worker contract if applicable and validation. Do not rely on a filename glob to deploy it.

## Pull requests

Before opening a PR:

1. run `npm run check`;
2. keep unrelated catalogue and product changes separate where possible;
3. avoid overwriting another active contribution lane;
4. include `Agent-Claim: #<issue>` and `Agent-ID: <agent-id>` for claim-governed work;
5. make sure the PR head branch matches the active claim branch;
6. explain metadata sources and provenance;
7. call out unresolved uncertainty;
8. do not claim browser/device validation you did not perform.

## Rights and licence status

The repository is public, but a repository-wide software/data licence still needs to be selected. Do not assume public visibility alone grants unrestricted reuse. Underlying recordings, compositions, artwork, embeds and other third-party material retain their own rights and licence terms.

Be precise and respectful. When reliable sources disagree, record the disagreement rather than inventing certainty.
