# Nonstop chapter resolution audit — 2026-09-08

This closes the post-#215 chapter-evidence backlog without reconstructing YouTube seek points from album durations.

## Evidence rule

A `segments[].startSeconds` value is accepted only when the selected continuous source or another authoritative source explicitly publishes that start for the same master. Album track durations, split-release durations, waveform guesses and arithmetic reconstruction are not chapter evidence.

For audited continuous sets with no defensible starts, discovery now records one of:

- `source-no-published-chapters` — the selected authoritative source publishes the continuous work but no internal starts.
- `source-tracklist-no-timestamps` — the selected authoritative source publishes ordered song names but no internal starts.
- `published-complete` — all chapter markers used by discovery are source-published.

## Completed timestamped leftovers

### Rangtaali 4

- YouTube master: `https://www.youtube.com/watch?v=0lE9Lh_vI0Q`
- 27 Sur Sagar-published starts.
- Track-level performer metadata cross-checked against the canonical 2024 release.
- Discovery chunk: `sets-32-rangtaali4-chapters.json`.

### Rangtaali 3

- YouTube master: `https://www.youtube.com/watch?v=3CKam-ComPw`
- 30 source-published starts.
- Singer credit is published per chapter.
- Discovery chunk: `sets-33-rangtaali3-chapters.json`.

### Khamkaro 2.0

- YouTube master: `https://www.youtube.com/watch?v=3dw37FY-tBU`
- 16 source-published starts.
- Jigardan Gadhavi is treated as chapter singer; Maulik Mehta remains a set-level music contributor.
- Discovery chunk: `sets-34-khamkaro2-chapters.json`.

### Rangtaali 2

- YouTube master: `https://www.youtube.com/watch?v=O11shxGqC78`
- 34 Sur Sagar-published starts.
- 31 chapters are performer-routable using canonical track-level artist metadata.
- Tracks 27, 29 and 30 stay metadata-only because their canonical `artistPrecision` is release-level.

### GARBA ROOM

- Verified Sur Sagar master: `https://www.youtube.com/watch?v=e9KYSWKiNwQ`
- The official description publishes 29 markers from `00:00:00` through `43:50`.
- The source globally credits Geeta Rabari, Laxmi Gadhavi and Kushal Chokshi but does not identify the singer for each marker.
- All 29 markers are therefore searchable metadata only and cannot become canonical song routes.
- Discovery chunk: `sets-35-garba-room-chapters.json`.

## Audited continuous sources with no published starts

### Taalratri 2.0

- Verified Saregama Gujarati master: `https://www.youtube.com/watch?v=s9UT_EaWBsc`
- The official description publishes production and performer credits but no chapter timestamps.
- External song lists confirm Meet Jain / Jay Mavani repertoire but do not establish positions inside this continuous video.
- Resolution: `source-no-published-chapters`.

### Tahukar 1

- Selected source: `https://www.youtube.com/watch?v=vbSaPo8nlRQ`
- Continuous Studio Saraswati master; no published internal starts recovered for this selected source.
- Resolution: `source-no-published-chapters`.

### Tahukar 2

- Selected source: `https://www.youtube.com/watch?v=XX94LWNSlS4`
- Continuous Studio Saraswati master; no published internal starts recovered for this selected source.
- Resolution: `source-no-published-chapters`.

### Tahukar 3

- Selected source: `https://www.youtube.com/watch?v=uQjAVwvCD2g`
- A separate seven-track album is documented, but the continuous YouTube master does not publish exact starts.
- Resolution: `source-no-published-chapters`.

### Tahukar 4

- Selected source: `https://www.youtube.com/watch?v=SMUukvkbm0Y`
- Studio Saraswati publishes album/performer information without exact internal starts for this master.
- Resolution: `source-no-published-chapters`.

### Tahukar 5

- Selected source: `https://www.youtube.com/watch?v=NNTkhnqtp-o`
- Verified full-video sources identify Kirtidan Gadhvi and release credits but do not publish exact starts for this selected master.
- Resolution: `source-no-published-chapters`.

### Tahukar 6

- Selected source: `https://www.youtube.com/watch?v=c_UC5gs4JGg`
- Studio Saraswati continuous master; no published internal starts recovered.
- Resolution: `source-no-published-chapters`.

### Tahukar 7

- Official artist master: `https://www.youtube.com/watch?v=gmqL46J6dU8`
- YouTube presents the 2019 release as one 44:11 Nonstop Garba track.
- A separate 19-song Tahukar 7 album exists, but summing those track durations would not prove positions in the continuous master.
- Resolution: `source-no-published-chapters`.

### Tahukar 8

- Official artist master: `https://www.youtube.com/watch?v=q7nTd79yjzo`
- A separate 19-song Kirtidan Gadhvi / Nisha Barot album and a 43:15 Nonstop master are documented; exact internal starts are not published for the selected video.
- Resolution: `source-no-published-chapters`.

### Deshi Sanedo

- Verified Zee Music Gujarati master: `https://www.youtube.com/watch?v=U0MboQb-jfY`
- The official description identifies the Non Stop Album, Jayesh Barot, Abhijit Khandelkar and lyrics but no chapter starts.
- Resolution: `source-no-published-chapters`.

### Tophani Sanedo

- Verified Ishtar Regional master: `https://www.youtube.com/watch?v=5Rw8K6D3B4k`
- The official description publishes the complete ordered 33-song jukebox list.
- It publishes no chapter timestamps.
- The 33 titles are preserved in discovery `tracklist` metadata; individual album durations are not summed into seek points.
- Resolution: `source-tracklist-no-timestamps`.

## Audit contract

`data/discovery/sets/index.json` contains `chapterAudit.resolvedSetIds` for the entire leftover campaign. `scripts/validate-discovery.mjs` requires every listed ID to exist and to be resolved either by timestamped segments or by an explicit supported `chapterStatus`.

This means an empty `segments` array on an audited source is no longer an unfinished TODO. It is an explicit evidence decision. If an official source later adds chapters, the set can be promoted by replacing the resolution status with source-published `segments`; guessed arithmetic timestamps remain prohibited.
