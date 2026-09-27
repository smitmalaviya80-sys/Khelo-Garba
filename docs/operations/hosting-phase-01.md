# GARBA hosted-audio phase 1

Status: production architecture and clearance pipeline for a 700-track directly hosted library.

## Goal

Build a curated set of up to 700 catalogue tracks that GARBA can play from infrastructure it controls, without relying on YouTube, Apple Music, Amazon Music, Spotify or another consumer streaming service at playback time.

The catalogue can remain larger than 700 tracks. `targetDirectTracks` refers only to the directly hosted tier.

## Recommended production shape

Use GitHub for code, catalogue metadata, rights evidence references, checksums and deployment logic. Do not use the Git repository as the bulk audio store.

Use two object-storage tiers:

1. **Public streaming bucket** — web encodes that GARBA is authorised to deliver to listeners.
2. **Private archive bucket** — approved source masters, contracts/evidence copies where appropriate, and lossless preservation files. This bucket is never exposed as a public origin.

Cloudflare R2 Standard is the preferred first implementation because the player is static-web friendly, R2 supports S3-compatible tooling and custom domains, and Cloudflare currently charges no Internet egress for R2. As of September 2026, Standard includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month before paid usage. Verify pricing again before launch.

Official references:
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/

Use a custom domain for production audio, for example `audio.<project-domain>`. Do not use the `r2.dev` development hostname for production delivery.

## Public file format

Start simple:

- Primary: AAC-LC in M4A, 160–192 kbps stereo, generated from the approved master.
- Optional bandwidth-efficient variant: Opus 96–128 kbps.
- Keep the original approved lossless master in the private archive bucket when the licence allows retention.

AAC should be the compatibility baseline. Opus is an optimisation, not a launch blocker.

Do not re-master, change pitch, tempo or artistic dynamics during ingestion. Encode from the approved source. Loudness analysis may be stored as metadata, but destructive loudness normalisation should only be applied when the rights holder or release specification permits it.

## Storage expectation

For 700 five-minute tracks:

- AAC 160 kbps is about 4.2 GB.
- AAC 192 kbps is about 5.0 GB.
- Opus 96 kbps is about 2.5 GB.
- AAC 160 plus Opus 96 is about 6.7 GB.

Actual figures depend on track duration and VBR behaviour. `npm run hosting:report` calculates a catalogue-derived estimate using known durations.

This means the public streaming library can plausibly fit inside R2's current 10 GB Standard free storage allowance even at 700 tracks. Lossless archive masters will normally exceed that and should be budgeted separately.

## Object naming

Never overwrite a published object in place. Use immutable, versioned object names:

```text
tracks/<song-id>/<content-sha-prefix>/stream.m4a
tracks/<song-id>/<content-sha-prefix>/stream.opus
```

Set long-lived immutable cache headers on versioned objects. Updating a master creates a new object path and a new manifest entry.

## Playback path

1. Catalogue selects a song ID.
2. `data/direct-audio.json` is checked first.
3. If a rights-valid direct entry exists, GARBA plays its public streaming encode through native HTML audio.
4. If no direct entry exists, the existing verified provider route remains a fallback.
5. A release page must never be presented as a track-specific direct stream.

## Offline playback

Do not automatically cache licensed music for offline use.

A licence that allows public web streaming does not necessarily allow persistent offline copies. Add an explicit `offlineCacheAuthorized` permission before putting an audio object into PWA offline storage. Until then, the service worker should cache player code and metadata, not the music catalogue itself.

## Rights workflow

`data/hosting-rights.json` is the acquisition ledger. Each reviewed track moves through one of these states:

- `unreviewed`
- `researching`
- `contact-rights-holder`
- `licence-review`
- `cleared`
- `blocked`

A track may only be marked `cleared` when the same song has a rights-gated record in `data/direct-audio.json`.

The direct-audio record remains the playback authority. The hosting-rights ledger is the acquisition/workflow authority.

## Clearance strategy for 700 tracks

Do not approach this as 700 independent song negotiations. Prioritise rights-holder batches.

### Lane A — artist / label catalogue deals

Contact independent Gujarati artists, labels and producers with several useful releases. Ask for a catalogue or album-level digital streaming licence and approved masters. One agreement may clear dozens of tracks.

The rights grant should explicitly address at least:

- the sound recording/master;
- public on-demand Internet streaming/delivery by GARBA;
- territories;
- term and expiry;
- whether GARBA may create technical web encodes;
- whether offline caching is permitted;
- whether artwork/credits may be displayed;
- takedown/termination process;
- any payment or reporting obligations.

### Lane B — underlying musical and literary rights

For copyrighted compositions and lyrics, determine whether the relevant musical/literary rights are administered by IPRS or another rights owner and obtain the required authorisation for the intended interactive streaming use.

Useful current references:
- https://iprs.org/choose-your-license/
- https://iprs.org/songs-repertoire-local-work/

### Lane C — new recordings of traditional repertoire

Traditional/public-domain compositions can be strategically valuable, but a public-domain composition does not make somebody else's modern recording free to copy. Commission or partner on new recordings where the composition rights are clear, then secure performer and master rights for GARBA.

This lane can build a dependable traditional core without relying on commercial masters.

### Lane D — genuinely open recordings

Use recordings under licences that actually permit the intended redistribution and streaming. Verify that the uploader controls the recording and that underlying composition/lyrics do not create a conflicting restriction.

### Lane E — provider-only catalogue

Keep commercially important tracks discoverable through verified provider routes when GARBA cannot obtain the necessary rights. They remain catalogue entries but do not count toward the 700 hosted-track target.

## What not to do

- Do not rip audio from YouTube or consumer streaming services.
- Do not treat a paid download as redistribution permission.
- Do not treat a free-download button as redistribution permission.
- Do not commit hundreds of audio files to Git history.
- Do not call a track `cleared` because its composition is old or traditional while the recording is modern.
- Do not enable permanent offline caching unless the grant explicitly covers it.

## Operational pipeline after a licence is obtained

1. Receive the approved master from the authorised source.
2. Verify file integrity and preserve the original privately.
3. Record rights evidence and dates.
4. Generate streaming encodes.
5. Compute SHA-256 for every published object.
6. Upload immutable objects to the public bucket.
7. Verify MIME type, byte-range playback, CORS and cache behaviour.
8. Add the rights-gated `data/direct-audio.json` entry.
9. Mark the acquisition ledger record `cleared`.
10. Run `npm run check` and `npm run hosting:report`.
11. Smoke-test seek, pause/resume, next/previous, iPhone Safari and installed PWA playback.

## Phase 1 success criteria

- A measurable target of 700 direct tracks exists.
- Every reviewed song has a rights state.
- Direct playback and acquisition states cannot contradict each other.
- The repo reports the remaining clearance gap and largest artist-credit batches.
- The first real licence can be ingested without changing player architecture.

The next workstream after this foundation is to populate the ledger with the highest-value rights-holder batches and begin direct outreach/clearance research.
