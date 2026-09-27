# Issue #152 final closeout audit

Date: 2026-09-08

Issue: #152, Catalogue Wave D modern/popular artist completeness.

## Closeout result

Issue #152 is ready to close after the final YouTube-only reconciliation in this branch. The four named artist lanes are meaningfully complete for PlayGarba's Garba/Dandiya taxonomy, unsafe commercial-provider execution has been removed from the remaining Wave D migration manifests, and unresolved recording-level YouTube work is explicitly handed to #157.

## Falguni Pathak

Canonical/listening coverage now includes:

- `Non Stop Garba by Falguni Pathak` (2022), complete 30-track canonical release plus verified Nova Gujarati YouTube programme.
- `Maadi Tara Mandiriye (Non Stop Dandiya Mix)` (2000), complete 10-track historical programme with exact Sony Music Bhakti chapter routes and performer ownership.
- `Dhaa Gujarati 21 Non Stop Dandiya` (2013), represented as the two authoritative continuous Tips Gujarati YouTube parts. Part 1 is `jqDZPqmEkkE`; Part 2 is `PBuvkFmaEXo`. No internal song timestamps are invented.

Reviewed but not expanded into split canonical releases:

- `90 Non Stop - Falguni Pathak` (2012): provider catalogues expose two long parts (about 33:22 and 32:58) with multiple credited performers. The closeout audit did not recover an independently verified exact YouTube execution identity for both parts, so this stays an evidence candidate for #157 rather than receiving a commercial-provider fallback.
- `Falguni Pathak Non Stop Garba` (2023, Music Nova): a single 45:13 track credited to Falguni Pathak, Sohini Mishra and Saurabh Mehta. Recording-level distinction from existing Nova material is not proven strongly enough for another canonical split import, and no exact independently verified YouTube identity is promoted here.
- the shorter `Maadi Tara Mandiriye` digital edition: materially different total duration from the 59:44 Non Stop Dandiya Mix, but title overlap is high and recording-level identity remains unresolved. It is not collapsed into, or duplicated against, the canonical 2000 programme.
- greatest-hits/`Dandiya Queen` marketing compilations dominated by Hindi/Indipop repertoire are rejected from Wave D unless individual tracks independently satisfy the Garba taxonomy and recording-identity rules.

## Kirtidan Gadhvi

The major modern/historical Garba series are now represented:

- Rangili Ramzat 6 is already canonical.
- Rangili Ramzat 7 and 8 split releases are canonical; verified 2 Taali continuous masters are in the Nonstop browser.
- Nortani Raat and Nortani Raat 2 are canonical/reviewed under YouTube-only route truth.
- Tahukar 9, 10 and 11 are already represented, with exact chapters where source-published.
- Tahukar 1 through 8 continuous masters are now represented in the Nonstop browser using the repository's previously audited authoritative YouTube identities. Tahukar 1-6 use verified Studio Saraswati label sources; Tahukar 7-8 use official Kirtidan sources. Their lack of published internal starts remains an explicit evidence boundary rather than a TODO.

Separate split-album surfaces for older Tahukar volumes are not used to manufacture chapter routes into the continuous masters. Where a split provider album and a continuous YouTube programme both exist, recording/edit identity must be proven independently in #157 before any per-song migration.

## Geeta Rabari

Major Garba coverage is already broad and current:

- Taal 2021 listening master.
- Taal - Non Stop Garba 2022 complete 21-track canonical release. The three long masters are exact official YouTube; the remaining 18 split tracks are explicitly non-playable and handed to #157.
- Zankaar 2.0 and Zankaar 3.0 canonical/listening coverage.
- Taal 4.0 (2025) already canonical in the main catalogue.
- Khamma 2 canonical and audited under the YouTube-only policy; 20/21 exact routes were resolved in #231, with one deliberately unresolved identity.
- Khamma Tran Taali and other current Geeta catalogue material already present in the main catalogue.

Earlier `Taal 2` / `Taal 3` backlog language was a naming misunderstanding: in the 2022 release, `Taal (2)` and `Taal (3)` are long tracks, not missing album volumes.

## Aditya Gadhvi

Major Garba-taxonomy coverage is complete enough for Wave D:

- `Ochhav` complete 25-track canonical release with exact official YouTube chapter routing.
- `Amber Gaje` complete 18-track 2024 canonical edition with nine exact official YouTube song identities and nine explicit recording-level gaps handed to #157.
- `Meldi Maa No Rankar` verified YouTube Nonstop listening entry.
- existing Aditya essentials/current catalogue entries remain preserved.

Popular Gujarati works such as `Khalasi` or other non-Garba folk/pop collaborations are not added merely because the artist is in Wave D. Wave D is a Garba/Dandiya catalogue-completeness issue, not an exhaustive artist discography import.

## Migration children

- #231 Khamma 2: completed and closed.
- #229 Taal 2022: final state is 3 exact official YouTube master tracks plus 18 explicitly unresolved/non-playable split tracks.
- #230 Rangili Ramzat 8: final state is a verified continuous YouTube listening master plus 17 explicitly unresolved/non-playable split tracks.

The unresolved rows from #229/#230, the remaining nine `Amber Gaje` rows, and any other recording-level YouTube gaps belong to #157, whose explicit objective is the final YouTube-only migration burn-down.

## Safety decisions

This closeout does not:

- calculate chapter starts from durations;
- substitute same-title recordings by different performers or editions;
- keep Amazon, Apple Music, Spotify, Qobuz or other commercial providers as executable Wave D playback;
- collapse materially different historical editions by title alone;
- add popular non-Garba repertoire solely because it belongs to a Wave D artist.

## Definition-of-done assessment

The four artist catalogues are meaningfully complete for the product taxonomy. Remaining evidence gaps are recording/playback migration work rather than missing Wave D catalogue structure, and they are explicitly handed to #157. The final merge is gated on the complete repository validation suite on the latest `main` lineage.
