# Vendor catalogue intake and matching

Status: v1, 2026-09-07

Purpose: reconcile a rights-holder or label catalogue export against GARBA without manually matching hundreds of recordings and without treating fuzzy metadata as legal proof.

## Accepted input

The CLI accepts UTF-8 CSV or JSON.

For Excel/XLSX files, export the relevant sheet to CSV first. Preserve one recording per row and do not merge cells.

Supported field aliases include:

- title / track title / song title / recording title;
- artist / artists / primary artist / performer;
- release / album / release title;
- duration in seconds, milliseconds, `MM:SS`, or `HH:MM:SS`;
- ISRC;
- label;
- master owner / phonogram owner / ℗ owner.

A useful vendor export should contain at least title and artist. Prefer ISRC, duration, release, label, © owner and ℗ owner as well.

## Command

```bash
npm run rights:match -- path/to/vendor.csv --out vendor-match-report.json
```

Limit candidate matching to one exact GARBA release-label string when useful:

```bash
npm run rights:match -- path/to/vendor.csv --target-label "Sur Sagar" --out sur-sagar-match-report.json
```

The target-label option is intentionally exact after normalisation. It does not silently merge legally distinct label aliases.

## Match states

- `exact`: exact normalised title plus sufficiently strong artist, duration and release signals when supplied.
- `likely`: high-scoring metadata match that still deserves review.
- `possible`: plausible match with insufficient evidence for automatic acceptance.
- `ambiguous`: top candidates are too close to choose safely.
- `unmatched`: no candidate reaches the conservative threshold.
- `invalid`: the vendor row is missing the minimum required title.

The matcher returns up to five candidates for review. It never changes catalogue data and never marks rights as cleared.

## Matching signals

The current GARBA catalogue does not contain ISRCs, so v1 primarily compares:

1. Unicode-normalised title tokens;
2. artist token sets, allowing reordered multi-artist credits;
3. release/album similarity;
4. duration difference;
5. release-label agreement when vendor label/master-owner metadata is present.

Vendor ISRC values are retained and duplicate ISRC groups are flagged. When GARBA gains verified ISRC data, ISRC can become the highest-confidence identifier.

## Short-title safeguard

Short generic titles can occur across many recordings. A title-only row such as `Dholida` is therefore not auto-matched even when the text is identical. Supply artist and preferably release/duration/ISRC.

## Legal safeguard

A catalogue match is an identity hypothesis only. It does **not** prove:

- the vendor owns the sound recording;
- the vendor has authority to license it;
- the underlying composition/lyrics are cleared;
- GARBA has permission to host or stream the audio.

Those decisions remain in the rights ledger and direct-audio release gate.

## Recommended vendor workflow

1. Receive catalogue export from the rights holder or authorised representative.
2. Keep the original file unchanged as evidence/source material.
3. Run the matcher against all GARBA songs and, where useful, again with a target-label filter.
4. Review `ambiguous`, `possible`, duplicate-ISRC and label-disagreement rows manually.
5. Ask the licensor to resolve ownership/metadata conflicts rather than guessing.
6. Create a negotiated licensable subset with exact ISRC/recording identifiers.
7. Only after written rights are agreed, receive lossless masters from the authorised source.
8. Move corresponding rights-ledger records through `licence-review` to `cleared` only when the direct-audio release gate is satisfied.

## Output fields worth preserving

The JSON report retains the canonicalised vendor row, raw source row, match state, best GARBA candidate, up to five candidates, title/artist/release similarities, duration difference and label-agreement signal.

Do not commit confidential commercial catalogues or contracts to this public repository. Store private source exports and agreements in an access-controlled workspace; commit only non-sensitive derived metadata needed to operate GARBA.
