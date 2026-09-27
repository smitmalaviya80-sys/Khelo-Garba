# Master ingestion and direct-audio publishing

Status: v1, 2026-09-07

Purpose: define the controlled path from a rights-holder-supplied lossless master to GARBA native browser playback without copying consumer streaming files, weakening the rights gate, or silently replacing published audio.

## Non-negotiable rule

A provider stream, purchased download, YouTube/Apple/Amazon/Spotify file, browser cache, rip, or public upload is **not** a valid GARBA source master merely because it can be accessed.

A source master enters this pipeline only when it is supplied by the rights holder, an authorised distributor/licensee, or is a commissioned master whose contract gives GARBA the required rights.

Private contracts and source binaries must remain outside this public Git repository.

## Publication state model

There are three linked public control records:

1. `data/hosting-rights.json` — whether GARBA has sufficient permission.
2. `data/master-intake.json` — provenance and technical state of the authorised source master.
3. `data/direct-audio.json` — the exact published encoded object used by the player.

A track is public-native only when all three agree:

- hosting rights state = `cleared`;
- master intake state = `published`;
- direct-audio entry exists;
- published encoded SHA-256 and audio URL match between master intake and direct audio.

`npm run rights:publish:validate` enforces this transaction.

## Intake states

`data/master-intake.json` supports:

- `received` — authorised source was received but checksum/rights validation is incomplete;
- `checksum-verified` — source bytes were hashed and the recorded SHA-256 was independently verified;
- `rights-verified` — relevant written rights and authority were reviewed;
- `encode-ready` — source is technically and legally ready for production encoding;
- `published` — exact production encode is live and bound to the direct-audio manifest;
- `rejected` — source cannot proceed; record a reason.

Do not skip directly from `received` to `published` operationally even though the JSON validator only sees the current state.

## Required master-intake data

Illustrative record only. Do not copy placeholder values into production.

```json
{
  "example-song-id": {
    "state": "encode-ready",
    "checksumVerified": true,
    "source": {
      "authorityType": "rights-holder",
      "suppliedBy": "Example Rights Holder",
      "evidenceRef": "private-rights-record:agreement-2026-001",
      "receivedAt": "2026-09-07"
    },
    "master": {
      "format": "flac",
      "sha256": "<64-hex-source-master-sha256>",
      "sampleRateHz": 48000,
      "bitDepth": 24,
      "isrc": "INAAA2600001"
    },
    "rights": {
      "evidenceRef": "private-rights-record:agreement-2026-001",
      "territories": ["worldwide"],
      "perpetual": false,
      "termStart": "2026-09-07",
      "termEnd": "2028-09-06",
      "directStreamingAllowed": true,
      "transcodingAllowed": true,
      "ordinaryCacheAllowed": true,
      "offlinePlayback": "prohibited"
    }
  }
}
```

Use the exact rights wording from the agreement when deciding these booleans. Do not infer them from a vague approval such as “you can use our songs.”

## Validate before encoding

Run:

```bash
npm run rights:master:validate
```

The validator rejects, among other things:

- song IDs that do not exist in the GARBA catalogue;
- intake before hosting rights reach `licence-review` or `cleared`;
- non-authoritative supply paths;
- MP3/AAC consumer files as source masters;
- missing/invalid SHA-256;
- duplicate source-master hashes mapped to different GARBA songs;
- invalid sample rate/bit depth/ISRC metadata;
- missing territory/term evidence;
- advanced states without direct-streaming, transcoding, and ordinary-cache permission.

## Produce an immutable ingest plan

Run:

```bash
npm run rights:master:plan -- --out private-ingest-plan.json
```

The planner performs no upload or rights mutation. It produces deterministic object-key plans.

Private archival master:

```text
masters/<song-id>/<SOURCE_MASTER_SHA256>.flac
```

or `.wav` as supplied.

Production encode staging key:

```text
encodes/<song-id>/<ENCODE_PLAN_ID>/stream.m4a
```

Final immutable public key:

```text
tracks/<song-id>/<ENCODED_FILE_SHA256>/stream.m4a
```

Never overwrite a content-addressed final object. If the encoded bytes change for any reason, compute a new SHA-256 and publish under a new object key.

## Production encode profile

The current v1 plan is AAC-LC in M4A at a 256 kbps target, preserving mono/stereo and normal 44.1/48 kHz source rates. The profile is versioned in `scripts/plan-direct-ingest.mjs`.

Source WAV/FLAC remains private archival material. Git is not the master-audio store.

If a future codec/profile is introduced, give it a new profile ID rather than silently changing the meaning of `aac-lc-256k-v1`.

## Encode and checksum

After encoding:

1. Compute SHA-256 from the exact completed `.m4a` bytes.
2. Upload the final object to the content-addressed `tracks/.../<ENCODED_FILE_SHA256>/stream.m4a` key.
3. Do not promote a staging object until checksum generation is complete.
4. Configure the audio origin for byte-range responses and browser access from GARBA.
5. Confirm the object is not publicly mutable in place through the publishing workflow.

## CDN/object-storage delivery contract

The public player needs reliable HTTP audio semantics. At minimum the final object should provide:

- HTTPS;
- HTTP byte ranges with `206 Partial Content` for `Range: bytes=...` requests;
- valid `Content-Range`;
- an audio MIME type such as `audio/mp4`;
- browser CORS permission when the audio origin differs from `https://ruddvz.github.io`;
- stable immutable URL behaviour.

Run the real network audit with:

```bash
npm run audio:health
```

The scheduled `Direct audio health` workflow also checks published HTTPS direct-audio entries daily and whenever the direct-audio manifest or audit script changes on `main`.

A cross-origin response without `Access-Control-Allow-Origin: *` or `Access-Control-Allow-Origin: https://ruddvz.github.io` fails the audit.

## Atomic publish record

When the production object is known to be good, the same publication change must include all three states.

### 1. `data/hosting-rights.json`

Set the exact song record to:

```json
{
  "state": "cleared"
}
```

plus the existing required rights evidence/review fields.

### 2. `data/direct-audio.json`

Illustrative shape:

```json
{
  "audioUrl": "https://audio.example.org/tracks/example-song/<ENCODED_SHA256>/stream.m4a",
  "mimeType": "audio/mp4",
  "sha256": "<ENCODED_SHA256>",
  "rights": {
    "redistributionAuthorized": true,
    "rightsHolder": "Example Rights Holder",
    "licenseName": "Direct interactive streaming licence",
    "proofUrl": "https://rights-evidence.example.org/reference/123",
    "verifiedAt": "2026-09-07"
  }
}
```

`sha256` is mandatory and refers to the published encoded audio bytes, not the private WAV/FLAC source master.

### 3. `data/master-intake.json`

Move to `published` and bind the exact publication:

```json
{
  "state": "published",
  "publication": {
    "encodedSha256": "<ENCODED_SHA256>",
    "audioUrl": "https://audio.example.org/tracks/example-song/<ENCODED_SHA256>/stream.m4a",
    "profileId": "aac-lc-256k-v1",
    "publishedAt": "2026-09-07"
  }
}
```

The direct-audio checksum and URL must exactly match the publication block.

## Final validation

Before merging a publication change run:

```bash
npm run check
npm run rights:publish:validate
npm run audio:health
```

`npm run check` performs local/schema validation. `audio:health` performs live network delivery validation and therefore belongs after the object is actually uploaded.

Do not mark a track `published` or rights `cleared` before the real object exists and can pass delivery validation.

## Rollback and takedown

Because public objects are immutable, rollback is a metadata operation rather than an in-place binary replacement.

For a rights expiry, takedown, or bad encode:

1. remove/disable the direct-audio manifest route immediately;
2. move rights/master state out of public-published status as appropriate;
3. retain private provenance and audit history;
4. do not reuse the old content-addressed URL for different bytes;
5. purge CDN cache only when necessary for takedown urgency;
6. publish a corrected encode under a new checksum URL if rights still permit it.

## Current state

As of 2026-09-07 the master-intake and direct-audio manifests intentionally contain zero production tracks. This document and the validators prepare the pipeline; they do not claim that any commercial recording has been licensed or copied.
