# Song catalogue contract

The song-collection agent owns `data/songs.json`.

The UI/PWA lane should not rewrite verified song content while that work is active. The player reads the file at runtime and the service worker treats it network-first.

## Required row shape

```json
{
  "id": "stable-kebab-case-id",
  "title": "Verified song title",
  "artist": "Verified artist credit",
  "genre": "traditional",
  "durationSeconds": 270,
  "audioUrl": null,
  "youtubeId": null,
  "placeholder": false
}
```

## Allowed genres

Exactly one of:

- `traditional`
- `dandiya`
- `devotional`
- `folk`
- `sanedo`
- `fusion`

## Stability rules

- `id` must be unique and stable after publication because favourites, last-played state and deep links reference it.
- `durationSeconds` must be numeric and non-negative.
- `audioUrl`, when present, must be an approved HTTPS source the site has permission to stream.
- `youtubeId` may be stored for a later approved YouTube player integration. The current UI does not hide or spoof an embedded YouTube player.
- Do not put ratings, play counts, reviews or unverified release metadata into the row.
- Set `placeholder: false` only after the row is verified.

## Handoff safety

The UI lane currently owns:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `offline.html`
- `assets/backgrounds/`
- `assets/icons/`
- UI/PWA docs and validation scripts

The song agent should only need to update `data/songs.json` unless a schema change is explicitly coordinated.
