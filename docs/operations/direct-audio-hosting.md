# Direct audio hosting

GARBA should distinguish between a catalogue entry and an audio master that this project is allowed to redistribute.

A song appearing on YouTube, Apple Music, Amazon Music, Spotify, SoundCloud, Bandcamp or another platform does not by itself grant GARBA permission to copy and re-host the recording.

## Target playback model

Use this priority order:

1. **Licensed direct audio** — a master that GARBA is explicitly authorised to redistribute. This is native HTML audio with no provider login, provider ads or provider UI.
2. **Verified song-level provider stream** — an official artist, label or distributor source where embedding is permitted.
3. **Verified release page** — navigation or release context only. Never present a release page as if it were a track-specific stream.
4. **Unavailable** — keep the catalogue metadata, but do not claim the track is playable.

## Where audio should live

The Git repository should remain the source of truth for metadata, rights evidence references, checksums and player code.

For a substantial audio library, use dedicated object storage/CDN rather than storing hundreds of commercial-size audio files in Git history. A suitable setup is an object store such as Cloudflare R2 or S3-compatible storage behind a stable HTTPS audio domain. The storage layer should support byte-range requests, immutable caching and correct audio MIME types.

Small, project-owned files may use `assets/audio/...` in the repository, but this should not become the default storage strategy for the full catalogue.

## Direct-audio manifest

`data/direct-audio.json` is the only place that upgrades a catalogue song to a direct audio master.

Example:

```json
{
  "version": "1.0.0",
  "tracks": {
    "example-song-id": {
      "audioUrl": "https://audio.example.org/masters/example-song.opus",
      "mimeType": "audio/ogg; codecs=opus",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "rights": {
        "redistributionAuthorized": true,
        "rightsHolder": "Example Rights Holder",
        "licenseName": "Direct redistribution licence",
        "proofUrl": "https://example.org/licence-proof",
        "verifiedAt": "2026-09-07"
      }
    }
  }
}
```

Do not add a direct entry unless the recording itself is cleared. Clearing the musical composition alone is not enough when a third party owns the sound recording.

## Acceptable ways to obtain direct masters

- Obtain written permission or a licence from the recording rights holder that explicitly allows GARBA to host and stream the master.
- Work directly with artists or labels and receive approved masters for this project.
- Commission new recordings and secure the necessary performer, recording and composition rights in writing.
- Use genuinely open recordings where the licence permits redistribution and the uploader actually controls the underlying recording and composition rights.
- Use public-domain material only after verifying both the composition and the specific recording are free of conflicting rights.

A purchased download, streaming subscription, public YouTube upload or free-download button is not enough by itself.

## CI guard

`scripts/validate-direct-audio.mjs` rejects direct entries that do not include explicit redistribution evidence, do not match a catalogue song, or try to use major provider pages as direct masters.

The validator reduces accidental misuse. It does not replace legal review of the underlying licence or permission.

## Reliability

For licensed direct masters, prefer at least two encoded versions from the same cleared master where practical, for example Opus and AAC/MP3. Keep the original archival master outside the web-serving bucket. Store checksums and use versioned object names so a replaced file never silently changes underneath a catalogue record.

Provider-backed tracks should remain clearly marked as provider-backed. GARBA cannot guarantee ad-free, login-free or permanent availability for audio it does not host or control.
