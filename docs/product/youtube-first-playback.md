# Playback source policy: YouTube today, authorised direct media next

Status: current production execution remains YouTube-only; authorised direct-media execution is rights-gated and not yet production-verified  
Updated: 11 September 2026

For the exact deployed revision and catalogue/playback counts, read:

```text
https://playgarba.com/build-info.json
```

## Current production truth

PlayGarba currently uses YouTube as its only executable music playback source in production.

That deployed state is narrower than the repository's accepted source architecture. Under #976, an exact direct master may become executable independently of YouTube only after explicit PlayGarba streaming/redistribution permission passes #984 and the production direct-first routing/integration work in #985/#986 is verified. Until those gates land with at least one rights-cleared master, production remains effectively YouTube-only.

Apple Music, Spotify, Amazon Music, SoundCloud, Bandcamp, Qobuz and similar consumer-provider URLs may remain in catalogue provenance while migration is in progress, but the website must not execute those routes. They are research/migration evidence, not playback fallbacks.

Never extract, proxy, mirror, reconstruct or otherwise convert a consumer-provider stream into direct audio. Authorised direct media is a separate rights-gated source class, not a workaround around consumer-provider restrictions.

## Stable playback-source policy

Today, a production song is executable only when PlayGarba has an exact YouTube video identity that is safe for the selected recording.

Accepted exact YouTube routes include:

- an exact verified YouTube video for the selected song;
- a verified YouTube performance/release chapter with an exact `youtubeStartSeconds`;
- another exact YouTube route whose source type and recording identity pass route-truth validation.

Not executable as consumer-provider playback:

- Apple Music;
- Spotify;
- Amazon Music;
- SoundCloud;
- Bandcamp;
- Qobuz;
- release/reference pages that do not prove the selected recording;
- YouTube search-only evidence;
- track-shaped provider references reused across a multi-song release;
- unchaptered multi-song YouTube releases when the selected song boundary is not verified.

GARBA-hosted/direct audio is also non-executable in the current deployed production runtime. It may become executable only through the separate authorised-direct path after the exact recording has explicit streaming/redistribution rights and #984/#985/#986 acceptance is satisfied. A rights-cleared direct master does not need a YouTube replacement merely to be a legitimate future execution source.

`provider-runtime.js` currently remains the production YouTube execution-policy layer. It may retain original provider/source fields as migration evidence while preventing those fields from becoming a playback bypass. #985 owns the future transition to rights-gated direct-first routing; do not infer that transition has shipped from this policy document alone.

## Interaction contract

The source policy above is independent from the exact control choreography.

For the currently deployed YouTube path, the approved product direction is one deliberate primary Play action for an exact verified YouTube route, using a visible integrated YouTube performance stage. #408 owns that interaction and its regression tests. Other agents must not create a competing "press Play, then press a separate YouTube button" contract in runtime code or documentation.

The YouTube interaction invariants remain stable even while other source classes are developed separately:

1. The selected recording identity is preserved; PlayGarba never silently substitutes another song or performer.
2. Executable YouTube playback uses the documented visible YouTube IFrame player.
3. The YouTube stage is visible whenever scripted YouTube playback is active; there is no hidden YouTube audio backend.
4. Play/pause, previous, next and seek operate the same active YouTube player when the selected route supports those actions.
5. Closing/stopping the stage has explicit truthful semantics; it must not leave hidden YouTube playback running.
6. An unavailable or migration-only recording remains identifiable and must not expose a fake playable state.
7. The secondary YouTube affordance may remain for provider identity/open-stage utility, but it is not a mandatory second authorization step for a ready primary Play action.

Authorised direct-media interaction, background capability and Media Session behaviour belong to #976/#985/#986 and their device-acceptance lanes. Do not describe those capabilities as deployed until the owning implementation and real-device verification say so.

Do not infer deployed interaction behavior from this document alone. `/build-info.json` identifies the deployed revision; the relevant runtime/browser tests determine which interaction contract has shipped on that revision.

## YouTube compliance contract

The YouTube implementation uses the documented YouTube IFrame Player API.

The embedded player:

- remains visible while scripted YouTube playback is active;
- keeps at least a 200 × 200 viewport;
- uses YouTube's player rather than extracting media;
- does not separate audio from video;
- does not suppress or remove YouTube-served advertising;
- does not use background playback;
- does not use raw `googlevideo` / `videoplayback` URLs;
- does not use yt-dlp, youtube-dl or equivalent extraction logic;
- does not parse YouTube signature ciphers.

Authorised direct media, if and when production-verified, is not sourced from or reconstructed from YouTube and does not alter these YouTube requirements.

## Route-truth safety

The current deployed runtime layers preserve this ordering contract:

```text
provider-runtime.js
→ player-continuity.js
→ youtube-player-runtime.js
```

The first layer currently enforces production YouTube execution. `player-continuity.js` applies route-truth/selection safeguards before `youtube-player-runtime.js` controls the visible player.

A route marked `playbackSearchOnly`, `verified-release-track-reference`, or `verified-unchaptered-youtube-release` is not an exact selected-song route.

No consumer-provider source becomes executable merely because a provider URL exists. Likewise, no direct source becomes executable merely because a file or URL exists: it must satisfy the explicit rights and production-routing contracts before it is eligible.

## Catalogue migration rule

Every active non-YouTube consumer-provider route is migration/provenance work, not a fallback playback option.

For each affected song or release cluster:

1. find the exact recording on YouTube, preferring official artist, label or distributor uploads;
2. verify title, performer/edition and recording identity;
3. for multi-song videos, use only directly verified source-published chapter starts;
4. add the exact YouTube video/URL and truthful source type;
5. add `youtubeStartSeconds` when a verified chapter boundary exists;
6. preserve stronger existing exact routes;
7. retain old consumer-provider URLs only as provenance when useful;
8. keep ambiguous material non-executable rather than guessing.

That consumer-provider migration programme is separate from authorised-direct acquisition. If PlayGarba has explicit redistribution/streaming permission for an exact master and it passes the #984/#985/#986 contracts, that direct route does not need to be discarded or replaced merely because the same recording lacks an exact YouTube route.

Never calculate chapter starts from neighbouring durations. Never replace one artist's recording with another simply because a traditional title matches.

## Build-time coverage vs current-session playability

Run:

```bash
npm run youtube:coverage
```

That report classifies the exact source revision's YouTube migration state, including:

- `youtubePlayable`: exact controllable YouTube routes accepted at build time;
- chaptered vs untimestamped exact YouTube routes;
- consumer-provider/direct-source migration or provenance backlog according to the report schema;
- YouTube reference/manual backlog;
- no-route backlog.

These are build/catalogue facts. They are not a promise that every accepted route can play in the current browser session. Connectivity, YouTube API loading, embed restrictions, autoplay/user-gesture state and transient runtime failures are session facts.

They also do not prove that authorised direct-media execution has shipped. Direct-media production eligibility is governed separately by its rights, routing and release-acceptance evidence.

For that reason `/build-info.json` reports `sessionPlayableCount: null` rather than converting build-time coverage into a fake live-session number.

## PWA and deployment

`provider-runtime.js`, `player-continuity.js` and `youtube-player-runtime.js` are part of the current single GitHub Pages production artifact.

The YouTube IFrame API loads from YouTube at runtime and requires connectivity. PlayGarba does not cache YouTube media for offline playback.

Future authorised direct-media delivery must follow its own rights, storage, caching and lifecycle contract. This document does not grant offline caching rights or claim background/lock-screen playback before the applicable rights and device gates are verified.

GitHub Pages assembles some production files from several source modules. Source and deployed file bytes therefore need not be identical. `/build-info.json` records the deployed Git revision, catalogue version and SHA-256 digests of key assembled files so future audits do not use byte difference alone as evidence of staleness.
