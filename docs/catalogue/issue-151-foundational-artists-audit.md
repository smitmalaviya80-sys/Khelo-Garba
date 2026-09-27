# Issue #151 foundational artists catalogue audit

This audit records the completed PlayGarba catalogue Wave C for Atul Purohit, Hemant Chauhan and Praful Dave. The implementation follows the issue's evidence boundary: provider-published track lists and exact song links are accepted; ambiguous editions, incomplete public track lists and guessed provider IDs are not.

## Outcome

Wave C adds 151 canonical songs/selections and 13 newly represented releases, and completes the existing 23-track `Dhholi (Non Stop Garba, Vol. 15)` programme without creating a duplicate release.

Playback improvements include 126 independently verified exact provider routes. Added songs without independently verified exact-song evidence retain a truthful release/provider fallback instead of treating an album URL as exact playback.

| Artist scope | Newly represented releases | Added canonical songs/selections | Exact route additions | Conservative fallback additions |
| --- | ---: | ---: | ---: | ---: |
| Atul Purohit | 6 | 60 | 60 | 0 |
| Hemant Chauhan | 3 new releases + completed existing Dhholi programme | 58 | 39 | 19 |
| Praful Dave / shared Hemant-Praful releases | 4 | 33 | 27 | 6 |
| **Total** | **13 new releases + 1 completed existing release** | **151** | **126** | **25** |

The issue's quantitative floor was 75 meaningful catalogue/playback improvements. This wave exceeds that target without padding with low-confidence search results.

## Atul Purohit

Accepted releases:

- `Maa Ni Chundadi (Gujarati Garba Songs)` (1994), 11 tracks
- `Tara Vina Shyam` (2000), 19 tracks
- `ફાગણ આયો` (2022), 10 tracks
- `અંબા નો દરબાર` (2022), 9 tracks
- `ચુંદડી રે` (2022), 10 tracks
- `રંગ રસીયા, Vol. 3` (2023), one continuous selection

All 60 selections have exact Amazon Music track routes followed directly from the provider-published album track lists. No provider IDs or timestamps were inferred.

Existing Atul material owned by other active waves was left isolated. In particular, this work does not rewrite `Maro Garbo` or `Ho Raj` route clusters and does not resurrect the retired `atul-live-uwb-2015` catalogue records.

## Hemant Chauhan

Accepted missing releases:

- `Maa Na Norta Mataji Na Garba` (1996), 6 tracks
- `Maa Na Norta-2` (1997), 11 tracks
- `Ghammar Vol: 3 (Nonstop Garba)` (2008), 18 tracks

All 35 selections across those three releases have exact provider-backed song routes.

### Dhholi completion

The repository already contained `Dhholi (Non Stop Garba, Vol. 15)` (2011) as a 23-song Soor Mandir release but its track import was incomplete. Wave C adds all 23 canonical track rows to that existing release instead of introducing another release identity.

Four Dhholi songs have independently verified exact provider routes. The remaining 19 retain the verified Apple Music album route as a release fallback. The release metadata is corrected from the old rounded 3,720-second platform summary to a 3,710-second sum of the imported track durations, and `trackImportComplete` is now `true`.

### Hemant material already present

The audit also checked existing catalogue material including `Madhuvan / Bansari-2`, `Shyam`, `Jagran`, `Bansari`, `Morli` and other represented Hemant recordings. Existing exact/YouTube routes were not weakened.

Two legacy releases remain deliberately incomplete:

- `Bansari` (1996): authoritative provider surfaces verify the release and 19-song count, but the public evidence retrieved during this wave did not expose a complete trustworthy canonical track sequence.
- `Morli (Non Stop Raas, Vol. 6)` (2004): authoritative provider surfaces verify the release and 19-song count, but the complete track sequence was not sufficiently exposed to import without reconstructing it from partial snippets.

Both remain `trackImportComplete: false`. This is an evidence limitation, not an overlooked task. The issue explicitly forbids guessing missing rows.

## Praful Dave and shared releases

Accepted releases:

- `Kalkamano Garbo` (2002), Praful Dave, 11 tracks
- `Boot Maa Na Garba` (2008), Praful Dave, Damayanti Bardai & Hemant Chauhan, 7 tracks
- `Maa Ashapura Na Garba` (2009), Hemant Chauhan, Damayanti Bardai & Praful Dave, 7 tracks
- `Mata Nu Garba` (2013), 8 tracks

The first three releases have 25 exact provider-backed song routes. `Mata Nu Garba` contributes two independently verified exact song overrides; its other six tracks retain release-level fallback because exact track URLs were not independently verified.

`Mata Nu Garba` preserves a provider-credit discrepancy rather than silently rewriting it: Amazon currently exposes Deepesh Desai at album level, while all eight track performance credits are Praful Dave, with Meena Patel additionally credited on track 7. The catalogue records the discrepancy in release notes and keeps the verified track-level credits on the song rows.

Existing Praful material such as `Navdurgani Navratri (Non-Stop Garba)` was checked and retained where already complete and strongly routed.

## Playback evidence rules applied

For every route added in this wave:

1. exact provider song URLs were used only when the provider exposed that song explicitly;
2. album URLs were never labelled as exact-song playback;
3. no YouTube chapter timestamp was calculated from durations;
4. no Amazon, Apple, Spotify or YouTube identifier was guessed from neighbouring records;
5. duplicate traditional titles remain separate when they represent distinct provider releases/recordings;
6. existing stronger routes were not replaced with weaker store links.

## Repository integration

Canonical source shards:

- releases `45` through `47`
- songs `57` through `70`
- 14 narrowly scoped playback-source manifests

The canonical manifest advances to version `0.19.0` with 1,311 active songs and 221 active releases. Generated runtime files remain build outputs and are not hand-edited.

## Definition-of-done assessment

The three named artists received an evidence-backed catalogue and playback audit; high-value missing Garba releases were added; Dhholi's known legacy programme was completed; exact routes were added wherever independently verifiable; ambiguous provider metadata and incomplete public track lists were handled conservatively; and the remaining Bansari/Morli limitations are explicitly documented rather than fabricated.

The final merge is valid only after the repository's full `npm run check` / GitHub `Validate GARBA` workflow passes on the reconciled branch.