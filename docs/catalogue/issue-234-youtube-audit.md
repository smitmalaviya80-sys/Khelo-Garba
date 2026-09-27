# Issue #234 — Parth Oza `Garbe Ghoome Tu` YouTube migration audit

Audit date: 2026-09-08

Canonical song ID: `parth-garbe-ghoome-tu-2025-01-garbe-ghoome-tu`

## Verified recording evidence

- Amazon Music identifies `Garbe Ghoome Tu` by Parth Oza as a one-song release and the exact track is 3:22.
- Audiomack independently exposes the Parth Oza recording at 3:22 and identifies Samarpayami Entertainment Private Limited as the phonographic-rights source.
- Times of India reported on 2020-10-07 that Parth Oza had released `Garbe Ghume Tu` on YouTube and identified Parth Oza as vocalist, Tushar Shukla as lyricist and Rushi Vakil as composer.

## YouTube result

No directly verifiable exact YouTube video ID or watch URL for the canonical recording was recovered from the indexed evidence available during this audit. The Times of India article confirms a YouTube release existed, but does not expose the target video URL/ID in its current page representation.

Because the repository requires exact recording identity and forbids guessed routes, no YouTube route is added.

## Playback decision

The existing Amazon Music track URL is retained as provenance only. It is not an executable fallback under the repository's YouTube-only runtime policy. The canonical song remains non-playable until an exact YouTube route is independently verified.

Rejected approaches:

- guessing a YouTube ID from title search;
- substituting another Parth Oza recording with a similar title;
- treating a same-title traditional performance as equivalent;
- using Amazon, Spotify, Apple Music or another provider as an executable fallback.

This is the evidence boundary required by #234 when an exact YouTube recording cannot be safely verified.
