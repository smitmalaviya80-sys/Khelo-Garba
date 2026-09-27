# PGA telemetry core

This directory is the isolated browser-side telemetry engine for PlayGarba Admin analytics. It implements the client contract from `../ARCHITECTURE.md` without modifying or hooking the current player, Explore, Nonstop, service worker or public PWA manifest.

Issue #862 deliberately stops at the reusable runtime boundary. Public product integration remains under parent #838 after current runtime owners release the required files.

## What the core does

- generates a random anonymous browser ID and rotates it after 180 days;
- shares a 30-minute inactivity session through best-effort local storage;
- keeps tab IDs in memory only;
- creates independent search and playback correlation IDs;
- builds schema-v1 events accepted by the PGA ingestion Worker;
- strips obvious email-, phone- and URL-like search text before local queueing;
- reads only UTM source/medium/campaign and referrer hostname for acquisition;
- detects browser/standalone/minimal-ui display mode without fingerprinting;
- stores at most 100 queued non-presence events, 64 KB total and 24 hours of retry history;
- never persists or replays `presence_heartbeat` events;
- sends batches with keepalive fetch and can use `sendBeacon` for page exit;
- fails open when storage, transport or analytics configuration is unavailable;
- keeps playback-listening heartbeat accounting conservative and caps one heartbeat at 60 seconds;
- exposes opt-in dedupe keys for noisy provider/state callbacks.

## What it does not do

This lane does not decide when a PlayGarba control represents `play_intent`, when YouTube has truthfully reached `playback_started`, which Explore action owns a search conversion, or how Nonstop chapter identity should be attached. Those hooks belong in the later #838 integration lane because the current production files have separate active owners.

The core does not collect IP addresses, raw user-agent strings, screen dimensions, fonts, canvas/WebGL values, installed software, DOM/form text, names, emails or account IDs.

## Runtime sketch

```js
import { createTelemetry } from './index.js'

const telemetry = createTelemetry({
  initialSurface: 'player',
  buildId: 'deployed-build-id',
})

const playbackId = telemetry.playbackId()
telemetry.track('play_intent', {
  playbackId,
  contentType: 'song',
  contentId: 'canonical-song-id',
})

// Only call this after the provider truthfully reports actual playback.
telemetry.track('playback_started', {
  playbackId,
  contentType: 'song',
  contentId: 'canonical-song-id',
})
telemetry.setPresenceState({ playbackState: 'playing' })
```

Integration code must never emit `playback_started` from button clicks alone.

## Queue and retry behaviour

Normal product events are written to a bounded local queue first. A successful batch removes only the event IDs that were sent. Failed sends use bounded retry delays and never throw into the listening UI.

Presence is intentionally different. It is sent directly, never placed in the persisted queue, and is dropped on network failure/offline state. This prevents a returned connection from replaying old heartbeats and making stale sessions look live.

Corrupt queue JSON is discarded instead of breaking the app. When browser storage throws, the runtime keeps a best-effort in-memory store for the current page lifetime.

## Validation

Run the isolated checks with:

```sh
node --check src/pga/telemetry/*.js
node --test src/pga/telemetry/tests/telemetry.test.mjs
```

The dedicated workflow runs these checks. The repository-wide `npm run check` remains the integration gate before merge.
