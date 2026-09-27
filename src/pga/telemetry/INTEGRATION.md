# PGA public telemetry integration contract

`product-bridge.js` is the semantic boundary between PlayGarba product actions and the isolated PGA telemetry runtime.

Explore is now wired to this bridge in source through the merged #1147 / PR #1176 integration. That hook is deliberately limited to truthful Explore surface, search, zero-result and canonical-selection events; Explore navigation does not infer playback intent or successful playback.

The public Player/provider-confirmed playback and Nonstop hooks are still not wired. Parent issue #838 should add those remaining thin calls only after the current runtime owners release or explicitly split their files.

Production delivery of the Explore adapter/module graph is tracked separately by #1193. Until that Pages packaging fix is merged and verified, the merged source integration must not be described as proof that production Explore telemetry is live.

## Why the bridge exists

The telemetry runtime knows how to create schema-valid events, queue them safely and send them without blocking listening. It cannot know what a product action means.

The bridge owns that meaning. In particular, it prevents a Play button click from being recorded as successful playback before the media provider confirms playback.

Remaining production hooks should therefore call semantic bridge methods instead of scattering `telemetry.track(...)` calls across product files.

## Minimal setup

```js
import { createTelemetry } from './src/pga/telemetry/index.js'
import { createProductTelemetryBridge } from './src/pga/telemetry/product-bridge.js'

const telemetry = createTelemetry({
  initialSurface: 'player',
  buildId: '<deployed-build-id>',
})

const analytics = createProductTelemetryBridge(telemetry)
```

If telemetry is disabled or throws, bridge methods fail closed for analytics and fail open for the listener product. Product controls must never depend on a bridge return value to continue playback or navigation.

## Surface lifecycle

Use:

- `surfaceViewed({ surface, world, entryPoint })` for a truthful visible product surface;
- `exploreOpened({ world })` when Explore is explicitly opened;
- `nonstopOpened({ world: '' })` when the Nonstop browser is explicitly opened;
- `updatePresenceContext(...)` only when the product context changes without its own analytics event.

`Nonstop` is a surface/listening mode. It is never emitted as a seventh world. Clearing a prior world is represented by the explicit empty string passed to presence state; event payloads omit the empty world.

## Search lifecycle

A search integration should retain the ID returned by `searchSubmitted()` for the exact rendered search result set.

```js
const searchId = analytics.searchSubmitted({
  searchTerm: submittedTerm,
  world: currentWorld,
})

if (searchId && resultCount === 0) {
  analytics.searchZeroResults({ searchId })
}

// When selecting a result from that exact result set:
analytics.searchResultSelected({
  searchId,
  contentType: 'song',
  contentId: canonicalSongId,
  world: currentWorld,
})
```

A newer accepted search replaces the active search correlation. An old result list must keep its old `searchId`; the bridge rejects that ID after a newer accepted search so unrelated searches cannot be cross-linked.

Search privacy remains owned by the telemetry core. The bridge does not read DOM text or store arbitrary query data.

## Playback lifecycle

### 1. User intent

When the listener explicitly requests playback:

```js
const playbackId = analytics.playIntent({
  contentType: 'song',
  contentId: canonicalSongId,
  world: currentWorld,
  surface: 'player',
  entryPoint: 'player',
})
```

A successful return means the `play_intent` event was accepted by the telemetry client. It does **not** mean audio started.

### 2. Provider-confirmed start

Only a real provider/media callback proving playback may call:

```js
analytics.providerPlaybackStarted({
  playbackId,
  confirmed: true,
})
```

Never pass `confirmed: true` from a click handler, optimistic UI transition, selected-track change, iframe creation, loading state, or an assumption that `play()` will succeed.

### 3. Provider lifecycle

After a confirmed start, use the same playback ID for:

```js
analytics.playbackPaused({ playbackId })
analytics.playbackResumed({ playbackId })
analytics.playbackEnded({ playbackId })
```

The bridge accepts these only for the currently confirmed playback. It updates presence only after the corresponding telemetry event is accepted.

A track transition may temporarily have two correlations: the old confirmed playback and a newer pending play intent. The old provider may still truthfully report pause/end until the new provider start is confirmed. Once the newer playback is confirmed, late lifecycle callbacks from the older playback fail closed.

### 4. Transport intent

`nextRequested()`, `previousRequested()` and `skipRequested()` are attached to the currently confirmed playback. They do not themselves create a new playback correlation. The later product hook should create a new `playIntent()` for the actual next selected canonical content when appropriate.

### 5. Unavailable and error states

Use:

```js
analytics.playbackUnavailable({
  playbackId,
  errorCode: 'route_unavailable',
})

analytics.playbackError({
  playbackId,
  errorCode: 'embed_error',
})
```

`playbackError()` accepts only the bounded canonical error-code set from `constants.js`. Do not pass provider error messages, URLs, stack traces or arbitrary strings.

Unavailable/error events never imply or create `playback_started`.

## Canonical identity

Future hooks must supply canonical catalogue IDs already known by the product layer. The bridge does not look up titles, artists, release names or popularity and does not infer identity from visible text.

Supported content types remain those in the telemetry core: song, release, nonstop set and chapter.

## Dedupe and provider churn

The bridge supplies deterministic dedupe keys for provider start/pause/resume/end callbacks and transport requests. This complements the telemetry core's bounded dedupe window.

The bridge also maintains explicit lifecycle state, so repeated provider `playing` callbacks for one playback instance do not create repeated starts even before transport-level dedupe is considered.

A genuinely new playback instance receives a new correlation ID and can be measured normally.

## Failure behaviour

Every bridge method catches telemetry exceptions. If telemetry is unavailable, disabled, rate-limited locally, cannot allocate an ID, or rejects an event:

- the listener-facing product must continue normally;
- no UI error should be shown because analytics failed;
- rejected search/play intents do not become active correlations;
- rejected pause/resume/end events do not mutate the bridge's truthful playback state;
- a presence-send failure does not prevent the product context from changing.

## Privacy boundary

The bridge has no direct access to:

- DOM or form fields;
- browser storage;
- `fetch`, beacon or network clients;
- timers or lifecycle event listeners;
- IP addresses or exact geography;
- user-agent strings or device fingerprint material;
- names, emails or account identities;
- raw provider error text.

It keeps only small in-memory correlation/context state.

## Production hook checklist

Before parent #838 wires any remaining public Player/provider-confirmed playback or Nonstop hook, verify all of the following for that hook:

1. the current file owner has released or explicitly split the path;
2. the hook is after the product truth boundary, not before it;
3. canonical content IDs are available without a new catalogue guess;
4. provider-confirmed starts come from the actual provider state;
5. the hook does not make product success depend on telemetry success;
6. existing player/Explore/Nonstop browser and performance gates remain green;
7. endpoint failure is tested as a listener no-op;
8. the public build contains no PGA/admin secret.

The Explore bridge integration is merged in source, subject to the separate #1193 production-packaging and deployment verification. Player/provider-confirmed playback and Nonstop hooks remain pending and are not claimed live by this document.
