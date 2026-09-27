# PGA live-presence model

This directory implements the pure live-presence truth model for issue #919, a bounded child of #840.

The canonical product contract remains `src/pga/ARCHITECTURE.md`. This module does not fetch Cloudflare, query Analytics Engine, write D1, read browser storage, or render PGA. Later #840 adapters can feed accepted heartbeat evidence into this model after the protected backend/UI files are free.

## Canonical constants

- public telemetry heartbeat cadence: approximately **45 seconds** (`HEARTBEAT_INTERVAL_MS`)
- live expiry window: **120 seconds** (`LIVE_WINDOW_MS`)
- live breakdown privacy threshold: **3 sessions** (`BREAKDOWN_MIN_SESSIONS`)
- listening-time minute bucket: **60 seconds** (`LISTENING_BUCKET_MS`)
- maximum accepted listening contribution per heartbeat/bucket: **60 seconds** (`MAX_HEARTBEAT_PLAYED_MS`)

A heartbeat exactly 120 seconds old is still live. It expires once its age is greater than 120 seconds. A future-dated heartbeat is not treated as current evidence.

## Aggregate semantics

`aggregatePresence(evidence, { nowMs })` uses only the newest accepted heartbeat for each `sessionKey`.

- **Live now** = distinct session keys whose newest accepted heartbeat is no more than 120 seconds old.
- **Listening now** = live sessions whose newest heartbeat reports confirmed `playbackState: "playing"`.
- **Browsing now** = `liveNow - listeningNow`.

These are anonymous analytics sessions, not people, accounts or named listeners.

Multiple tabs cannot inflate the top-level count because all heartbeats collapse to one latest state per session key. Out-of-order older heartbeats cannot overwrite a newer state. Equal-timestamp collisions are resolved with a stable content tie key so fixture/order differences never change the result.

The model does not need a special “PWA closed” signal. If the browser, tab, network or installed PWA stops producing accepted heartbeats, the session ages out after the canonical window. That prevents indefinite ghost sessions.

## Breakdowns and privacy

Surface, presentation-world and confirmed-playing content breakdowns are based only on the latest heartbeat of live sessions. A row is exposed only when at least three live sessions share that value. Smaller groups are not returned as labelled rows; only an aggregate `suppressedSessions` count remains.

Content breakdowns require both:

1. latest live heartbeat has `playbackState: "playing"`; and
2. canonical `contentType` + `contentId` are present.

A paused or unknown playback state cannot create a “currently listening to this song” claim.

## Missing and failed evidence

The adapter can pass:

```js
{
  status: 'available' | 'unavailable' | 'stale' | 'error',
  heartbeats: [],
  checkedAt,
  dataThroughAt,
  source,
  reason,
}
```

Only `available` evidence produces numeric live/listening/browsing counts. `unavailable`, `stale` and `error` return `null` counts. This prevents a failed protected query from appearing as a truthful zero-listener state.

Passing an array directly is shorthand for available heartbeat evidence.

## Listening-time cap

`aggregateListeningTime(heartbeats)` sums accepted `playedMsSincePreviousHeartbeat` into `(sessionKey, minute bucket)` groups, deduplicates repeated heartbeat evidence, and caps each session/minute at 60,000 ms. Two same-session tabs therefore cannot produce more than one wall-clock minute of listening in one minute bucket.

This helper is not a replacement for backend sampling/precision handling. The protected adapter must still preserve Analytics Engine precision metadata from the canonical architecture.

## Short trend

`buildPresenceTrend(heartbeats, { startMs, endMs, stepMs })` evaluates the same live truth at deterministic sample timestamps. It exists for later short-trend adapters and tests; it does not imply realtime transport or browser polling.

## Integration boundary

This child deliberately does **not** edit:

- `src/pga/backend/admin-worker.js`;
- `src/pga/app/**`;
- public PlayGarba runtime files;
- deployment or Cloudflare configuration.

Parent #840 remains responsible for protected aggregate endpoint wiring, source precision/freshness metadata, and PGA presentation after current shared-file owners release those files.
