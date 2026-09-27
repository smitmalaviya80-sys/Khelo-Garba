# Issue #346: Rangili Ramzat 7 / 8 YouTube migration audit

Date: 2026-09-08

## Scope

This audit covers the canonical split-track releases `Rangili Ramzat 7 (Garba)` and `Rangili Ramzat 8`. It follows the #157/#221 YouTube-only contract: executable playback is added only when the exact recording and edition can be verified. Continuous-set uploads are not treated as proof of split-track identity, and timestamps are never derived from catalogue durations.

## Rangili Ramzat 7

Canonical release: `rangili-ramzat-7-garba-2025`

Credited release artists: Kirtidan Gadhvi, Kajal Maheriya, Dharmesh Barot, Rashmita Rabari.

Six exact original-release YouTube tracks were independently recovered from the Kirtidan Gadhvi Official Artist Channel. The surfaced YouTube metadata identified the same `Rangili Ramzat 7 (Garba)` release, the same credited artist ensemble, Kirtidan Gadhvi rights, and the 2025-09-13 release date.

| Track | Canonical song ID | YouTube ID | Exact route |
| --- | --- | --- | --- |
| 4 | `rangili-ramzat-7-2025-04-mane-ekli-meli-ne-rame-raas-rangila-raja-rangili-ramzat-7` | `mPURmQJsdI8` | https://www.youtube.com/watch?v=mPURmQJsdI8 |
| 6 | `rangili-ramzat-7-2025-06-dhan-dhan-che-kutch-ni-dharti-rangili-ramzat-7` | `Bu7tRqrxFYo` | https://www.youtube.com/watch?v=Bu7tRqrxFYo |
| 8 | `rangili-ramzat-7-2025-08-sona-indhoni-rupa-bedalu-re-rangili-ramzat-7` | `cYwIPGwAzbs` | https://www.youtube.com/watch?v=cYwIPGwAzbs |
| 9 | `rangili-ramzat-7-2025-09-garbe-ghume-khodal-maa-rangili-ramzat-7` | `16U8OWIcroA` | https://www.youtube.com/watch?v=16U8OWIcroA |
| 11 | `rangili-ramzat-7-2025-11-mane-lai-ja-ne-tari-sangath-rangili-ramzat-7` | `JhTlIw7_BTw` | https://www.youtube.com/watch?v=JhTlIw7_BTw |
| 16 | `rangili-ramzat-7-2025-16-be-paisa-no-rumaliyo-rangili-ramzat-7` | `c9TgLcvACLI` | https://www.youtube.com/watch?v=c9TgLcvACLI |

These are full-song uploads, so `startSeconds: 0` is exact and no chapter inference is involved.

### Rangili Ramzat 7 unresolved split tracks

The following 13 canonical rows remain fail-closed because a direct exact original-release YouTube watch ID was not independently recovered in this pass:

- `rangili-ramzat-7-2025-01-ganpati-vandana-rangili-ramzat-7`
- `rangili-ramzat-7-2025-02-aai-ashapura-rangili-ramzat-7`
- `rangili-ramzat-7-2025-03-raat-ruple-madhi-ne-rangili-ramzat-7`
- `rangili-ramzat-7-2025-05-ame-maiyara-re-gokul-gamna-rangili-ramzat-7`
- `rangili-ramzat-7-2025-07-madi-taro-garbo-ghumto-jaay-rangili-ramzat-7`
- `rangili-ramzat-7-2025-10-morali-re-jal-jamna-ne-tire-rangili-ramzat-7`
- `rangili-ramzat-7-2025-12-sonana-mugat-upar-hirla-jaldela-rangili-ramzat-7`
- `rangili-ramzat-7-2025-13-sire-che-lobdi-rangili-ramzat-7`
- `rangili-ramzat-7-2025-14-dhan-dhan-mogal-rangili-ramzat-7`
- `rangili-ramzat-7-2025-15-mandvade-avo-mogal-machrali-rangili-ramzat-7`
- `rangili-ramzat-7-2025-17-gogo-maro-gom-dhani-rangili-ramzat-7`
- `rangili-ramzat-7-2025-18-sidadi-talavadi-rangili-ramzat-7`
- `rangili-ramzat-7-2025-19-lal-pili-bangadi-vali-rangili-ramzat-7`

The official continuous `Rangili Ramzat 7 (2 Taali Garba)` recording (`uNXSSK9KBFM`) remains useful listening/discovery evidence, but it is not promoted to split-track playback because this audit did not establish a source-published split map proving one-to-one recording/edit identity.

## Rangili Ramzat 8

Canonical release: `rangili-ramzat-8-kirtidan-2025`

All 17 split tracks remain fail-closed. The canonical provider catalogue verifies the release and its ordered split tracks, and the repository retains the verified continuous Rangili Ramzat 8 listening set. However, this audit did not independently recover exact split-track YouTube watch IDs or a trustworthy source-published 17-song chapter map tied to the same split release.

Therefore no Rangili Ramzat 8 split route is promoted merely from title similarity, continuous-set ordering, or accumulated durations.

## Rejected candidate classes

The following candidate types are deliberately rejected:

- same-title recordings from older `Rangili Ramzat` editions;
- tracks with different artist ensembles or materially different durations;
- live or continuous edits without direct proof that they are the canonical split recording;
- inferred chapter starts calculated by summing catalogue durations;
- title-only matches that do not independently establish the 2025 release identity.

## Result

- 6 new exact YouTube split-track routes for Rangili Ramzat 7.
- 13 Rangili Ramzat 7 split tracks explicitly unresolved.
- 17 Rangili Ramzat 8 split tracks explicitly unresolved.
- 0 guessed YouTube IDs.
- 0 inferred timestamps.
- 0 different-edition or different-performer substitutions.
- Existing continuous-set evidence remains a listening/discovery object rather than fake exact split playback.
