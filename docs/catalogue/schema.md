# Catalogue schema

## Visual worlds

`data/genres.json` contains the six presentation worlds:

- `traditional`
- `dandiya`
- `devotional`
- `folk`
- `sanedo`
- `fusion`

They control high-level player presentation. They are not the music taxonomy.

A song has one primary visual world for player presentation. Explore may also surface the song in another visual-world collection when a verified secondary taxonomy classification maps there. This keeps the player theme stable while making catalogue browsing multi-dimensional.

## Music taxonomy

`data/taxonomy.json` contains the 19 catalogue categories, including Roots / Archive, Traditional Garba, Tran Taali, Be Taali, Raas / Dandiya, Dodhiyu, Hinch, Dakla, Sanedo, Mataji / Devotional, Krishna Garba, Folk / Lokgeet, Live Garba, Modern Gujarati Garba, Hip-hop Garba, Electronic / Fusion, DJ / Remix, Bollywood / Filmi and Instrumental / Cinematic.

Aliases preserve spelling variants such as Tran Taali, Teen Taali, Dodhiya and Dodiyo.

Explore category membership should use `category` and `taxonomyStyles[]` first. Free-text title, artist or release matching is only a fallback for a concept that does not yet have a canonical taxonomy ID.

## Canonical names and editorial metadata

Entity IDs and canonical `title` values are stable catalogue identity. Do not rename an `id` simply to improve presentation because IDs are used by playback mappings, favourites, deep links and generated data.

Use the optional editorial fields below when a cleaner user-facing name or richer context is verified:

- `displayTitle`: preferred user-facing title. The canonical `title` remains unchanged.
- `aliases[]`: verified alternate spellings, transliterations or previously used names. Do not repeat the canonical title.
- `description`: concise factual description suitable for Explore.
- `story`: optional longer editorial context for a song when a story, tradition, performance context or origin is actually sourced. Never invent a story to fill the field.
- `descriptionSource`: optional source/provenance label for editorial copy when useful.

If `description` and `story` are absent, Explore generates a factual fallback from existing catalogue metadata such as artist credit, taxonomy, release, year and label. A generated fallback is not presented as historical or biographical fact beyond those fields.

The same `displayTitle`, `aliases[]` and `description` fields may be used on release and discovery Nonstop records. Nonstop records may additionally use `series` and `volume` to separate a series name from its numbered edition without changing stable IDs.

## Song record

Important fields:

- `id`: stable internal ID
- `title`: canonical source title
- `displayTitle`: optional user-facing title
- `aliases[]`: optional verified alternate names
- `description`: optional factual editorial description
- `story`: optional sourced story/context
- `artist`
- `artistPrecision`: optional qualifier when only album-level or release-level attribution is verified
- `genre`: one of the six visual worlds
- `category`: primary taxonomy ID
- `taxonomyStyles[]`: secondary taxonomy IDs
- `styles`: secondary searchable free-form tags
- `durationSeconds`: exact seconds or `null`
- `releaseId`
- `trackNumber`
- `audioUrl`: authorised local/remote playable audio or `null`
- `youtubeId`: verified YouTube ID or `null`
- `placeholder`: always false for the verified catalogue
- `sourceStatus`
- `audioAvailability`

Generated runtime songs may additionally carry `presentationRole`, `canonicalReleaseId`, `canonicalSongId` and `nonstopSetId` when their source release is retained for provenance but must not appear as a separate ordinary listening object. These fields are generated from release presentation metadata rather than authored independently on song rows.

A verified catalogue entry can exist without playable audio. Commercial recordings normally use:

```json
{
  "audioUrl": null,
  "youtubeId": null,
  "sourceStatus": "verified-metadata",
  "audioAvailability": "not-bundled"
}
```

## Release record

Important fields:

- `id`, `title`, `artist`
- `displayTitle`, `aliases[]`, `description`: optional editorial presentation metadata
- `releaseDate`: exact date only when verified
- `originalReleaseYear`
- `digitalReleaseYear`: when a later digital reissue is separately verified
- `label`
- `categories`
- `visualGenre`
- `entryType`
- `songCount`
- `durationSeconds`
- `durationPrecision`
- `series` and `volume`
- `live.isLive` and `live.venue`
- `sources[]`
- `trackImportComplete`
- `rightsStatus`
- `audioBundled`
- `metadataStatus`
- `audioAvailability`
- `presentationRole`: optional listening-presentation role; absence means normal `catalogue`
- `canonicalReleaseId`: required for every non-catalogue presentation role
- `nonstopSetId`: required for `nonstop-only` when the continuous edition has a verified embeddable YouTube Nonstop set
- `notes`

Source conflicts are preserved rather than silently normalised. Internal conflict notes are not automatically exposed as user-facing editorial descriptions.

### Release presentation roles

Release records sometimes represent the same music in more than one provider or packaging form. Preserve those records as source evidence, but do not make users choose between duplicate listening objects.

The allowed roles are:

- `catalogue`: the default normal release shown in Search, Explore, genre browsing and ordinary queues. The field can be omitted.
- `catalogue-alias`: a proven duplicate segmented release with the same track-title order as a richer canonical release. It remains in source data but ordinary UI resolves it to `canonicalReleaseId`.
- `nonstop-only`: a one-track continuous edition that has a segmented canonical release and a verified YouTube Nonstop listening set. It is hidden from ordinary song/release lists and legacy song links hand off to `nonstopSetId`.
- `source-only`: a distinct provider/source edition worth preserving for provenance, but not a separate ordinary listening object. Legacy links resolve to `canonicalReleaseId`; do not invent a Nonstop relationship when the available YouTube performance is a different arrangement.

Do not use a presentation role to erase a genuinely different release, performance, mix, year, artist credit or track sequence. `catalogue-alias` requires identical normalized track-title order. `nonstop-only` requires a verified embeddable YouTube set. A studio continuous master and a different live/performance arrangement remain separate source truths even when their titles are similar.

The catalogue builder propagates release presentation metadata into generated runtime song rows so the main player can filter non-canonical rows while retaining redirects for old favourites and deep links. Explore keeps the complete release index for redirect resolution but builds collections and search results only from normal catalogue songs.

Run:

```sh
npm run presentation:validate
```

This verifies role values, canonical targets, alias track-order identity, Nonstop set safety, generated song redirects and the main-player/Explore filtering contracts.

## Nonstop discovery source of truth

`data/discovery/sets/index.json` and the chunks it lists are the only canonical registry for Nonstop/full-set listening and discovery. The live Nonstop browser, catalogue audits and taxonomy validators all read this registry.

The former parallel file `data/nonstop.json` is retired and must not be recreated. Provider-only Amazon, Apple Music, Spotify or other evidence belongs in release/source manifests or in explicitly non-playable discovery records that carry `sourceStatus: "youtube-migration-required"`; it must not become a second listening catalogue.

A physical YouTube recording has one canonical discovery set identity. Do not add a second card because the same recording was researched under another release, artist lane or legacy ID. Alternate URLs or historical IDs may be preserved as provenance fields or notes, but one `videoId` must not resolve to multiple playable Nonstop set IDs.

Discovery records with an embeddable YouTube source are full-set listening objects. Chapter data is optional, but its evidence state must be truthful:

- `published-complete`: source-backed timestamped chapter sequence is present.
- `source-no-published-chapters`: the audited source explicitly exposes no published chapter starts.
- `source-tracklist-no-timestamps`: a source tracklist exists but exact starts do not.
- `full-set-only-no-chapter-evidence`: a verified full-set YouTube master was preserved or migrated, but no trustworthy chapter evidence was carried into the record. Play the full recording only; do not infer starts from song durations, another release, or neighbouring videos.

Multi-artist chapter lists without per-chapter performer evidence remain `segmentRouting: "metadata-only"` unless a chapter explicitly becomes routing-eligible with verified performer credit.

Run:

```sh
npm run nonstop:source:validate
```

This verifies that the retired parallel registry is absent, playable YouTube recordings are unique, release `nonstopSetId` handoffs resolve to canonical embeddable sets, and runtime/validation code points at discovery rather than a second source.

## Free/access resource record

The free-source manifest is separate from the canonical song catalogue because a free download, stream, sample or archive document is not automatically a redistributable song master.

Important fields:

- `resourceType`
- `source` and `sourceUrl`
- `access`
- `priceModel`
- `format` and `masterQuality`
- `licenseName` and `licenseUrl`
- `commercialUse`
- `standaloneRedistribution`
- `repositoryAction`
- `verificationStatus`
- `verifiedAt`

## Metadata audit

Run:

```sh
npm run catalogue:metadata:audit
```

The audit checks canonical title hygiene, optional editorial field shapes, aliases, release references, taxonomy IDs, discovery Nonstop metadata and the difference between primary visual-world counts and Explore's primary-plus-secondary taxonomy membership.

## Chunking and generation

`data/catalogue/index.json` is the manifest for the chunked source-of-truth records.

Run:

```sh
node scripts/build-catalogue.mjs
```

It verifies the expected counts and generates:

- `data/songs.json`
- `data/releases.json`
- `data/free-audio-sources.json`
