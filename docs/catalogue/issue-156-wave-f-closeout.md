# Issue #156 Catalogue Wave F closeout

Date: 2026-09-08

## Current-main reconciliation

This closeout is reconciled against the current catalogue after the previously merged Dhara Shah `Rankar` batch, the concurrently merged Kinjal Dave `Garbe Ramvane` Wave F batch, and all newer named-artist, Nonstop, route-truth, runtime and product work. It does not re-add or overwrite those changes.

The historical research matrix in `docs/catalogue/issue-156-wave-f-audit.md` records 222 candidate songs/releases/sets. Its implementation-selection counts reflect the earlier audit baseline by design. This closeout records the final cumulative issue-level result on current `main`.

## Quantitative quality gate

- Candidates researched and decision-audited: **222**
- Canonical songs accepted across Wave F: **114**
  - 23 Dhara Shah `Rankar` songs already merged by PR #196
  - 27 Kinjal Dave `Garbe Ramvane` songs merged concurrently on `main`
  - 36 `Rangtaali 2 - Non Stop Garba` entries in the closeout PR
  - 1 Parth Oza `Garbe Ghoome Tu` single in the closeout PR
  - 27 `Rangtaali 4 - Non Stop Garba` entries in the closeout PR
- Canonical releases introduced by Wave F: **5**
  - `Rankar` (Dhara Shah, 2025)
  - `Garbe Ramvane` (Kinjal Dave, 2021)
  - `Rangtaali 2 - Non Stop Garba` (Aishwarya Majmudar & Jigardan Gadhavi, 2019)
  - `Garbe Ghoome Tu` (Parth Oza, 2025)
  - `Rangtaali 4 - Non Stop Garba` (Aishwarya Majmudar, Jigardan Gadhavi, Rajbha Gadhvi GIR & Maulik Mehta, 2024)
- Exact official/provider routes across accepted Wave F songs: **113**
  - 23 exact Amazon Music tracks for `Rankar`
  - 27 provider-published official KD Digital YouTube chapters for `Garbe Ramvane`
  - 34 provider-published Sur Sagar YouTube chapters for `Rangtaali 2`
  - 1 separate official full-track YouTube route for `Rangtaali 2`
  - 1 exact Amazon Music track for Parth Oza
  - 27 provider-published Sur Sagar YouTube chapters for `Rangtaali 4`
- Conservative fallbacks: **1**
  - `Nav Nav Naganiyo No Rafdo` stays on the verified 36-track Amazon album because Sur Sagar publishes no chapter start for that entry
- Consumer-stream audio downloaded, extracted or bundled: **0**
- Inferred YouTube timestamps/provider IDs: **0**
- Duplicate canonical IDs introduced: **0**

## New and expanded artist coverage

Wave F introduces or newly canonically surfaces Dhara Shah, Parth Oza and Rajbha Gadhvi GIR, expands Kinjal Dave with a complete verified nonstop release, and fills major missing Rangtaali material for Aishwarya Majmudar and Jigardan Gadhavi.

## Top deferred/rejected classes

The research matrix deliberately leaves out:
- named-artist work owned by issues #151 and #152 rather than racing those waves
- duplicate/transliteration variants already represented by the same recording
- compilation appearances without evidence of a distinct recording
- title-only traditional recommendations where a canonical recording could not be verified safely
- `DJ Rock Dandiya` track-level expansion while regional provider editions disagree on track count or edition identity
- lower-priority candidates that remain useful discovery backlog but are not stronger than the accepted Wave F set

## Playback truth

Playback priority follows repository policy. Published YouTube chapter starts are used verbatim. Amazon song URLs are exact only where the provider exposes an individual track URL. Album pages are explicitly marked as release-level fallbacks, never exact tracks. No consumer-stream audio is copied into the repository.

## Final catalogue impact

On the reconciled `0.23.0` baseline of 1,535 songs and 231 releases, the closeout PR adds 64 songs and 3 releases, producing **1,599 canonical songs and 234 releases** before any later concurrent catalogue merges.

## Validation gate

The final reconciled PR must pass the repository `Validate GARBA` workflow. Its `npm run check` coverage includes catalogue build and canonical/dedupe validation, discovery validation, runtime song-route validation, playback route-quality reporting, YouTube-first reporting, repository-structure validation and documentation validation. The workflow also renders the PWA icons and social preview after the check suite.

The earlier closeout run passed every catalogue, runtime, playback, discovery and repository validation and failed only because these two Wave F documents had not yet been indexed in `docs/README.md`. That documentation-index defect is corrected in the final reconciliation.

Issue #156 should close only after the complete workflow is green on the final reconciled head.
