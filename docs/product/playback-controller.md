# Playback controller contract

Status: architecture contract for incremental migration

Issue: #449

This document defines the end-state authority boundary for PlayGarba playback. It does not change production runtime behaviour by itself and it does not declare the migration complete.

The purpose is to stop playback truth from being reconstructed independently by DOM observers, URL changes, button interceptors, provider wrappers and media-session handlers. Playback identity and state must have one authoritative path, while views remain projections of that state.

## Product invariants

1. The selected catalogue recording is never silently replaced by a different recording, performer, edition or release merely because another route is easier to play.
2. A source reference is not automatically executable. Route truth is resolved before transport control.
3. A user command reaches one playback controller and, when accepted, at most one active provider transport path.
4. A Play command is intent. Only provider/media evidence may make the authoritative state `playing`.
5. Stale events from an older song or generation cannot overwrite the current recording, progress, error, metadata or Media Session state.
6. Views render controller snapshots. They do not infer active recording identity from title text, artist text, URL mutation, CSS state or other presentation output.
7. One runtime owner controls provider polling/timers for the active transport. A view or compatibility adapter must not start a competing playback truth loop.
8. Media Session metadata, playback state and action handlers are projections of the same authoritative playback snapshot and capabilities.
9. YouTube playback remains foreground-visible under the current product policy. A controller abstraction must not create hidden YouTube audio, media extraction or an alternate background-play contract.
10. Unsupported, unresolved or failed playback remains identifiable and truthful. Missing evidence is not converted into a playable or healthy state.

## Authority pipeline

The target data flow is:

```text
canonical catalogue selection
  -> route/source resolver
  -> playback controller command
  -> active transport adapter
  -> provider/media evidence
  -> authoritative immutable snapshot
  -> subscribed views + Media Session projection
```

There must not be a reverse identity path from rendered DOM back into playback authority.

### Canonical catalogue read

Selection starts with a canonical song or continuous-set identity from the generated catalogue/discovery authority. The controller receives stable identity fields, primarily the canonical ID and the verified metadata required for presentation.

The controller does not scrape `#songTitle`, `#songArtist`, the current hash, a rendered card, or a provider URL to decide which recording is active.

Provider/source records remain evidence. They become executable only after the repository's route-truth policy accepts them for the selected recording.

### Source resolution

Source resolution happens once per selection generation before transport execution.

A resolution must identify:

- canonical `songId` or continuous-set identity;
- route kind, such as authorised direct media or foreground YouTube;
- exact provider/media identity needed by the transport;
- verified chapter/start offset when one exists;
- capabilities available for that route;
- an explicit unavailable reason when no executable route exists.

A source resolver may preserve migration/provenance references without making them executable.

The existing direct-media stack already models this separation through `direct-source-resolver.js`; the wider player migration must retain the same source-truth boundary rather than create another permissive fallback.

## Selection generations

Every accepted selection advances a monotonically increasing generation.

The tuple:

```text
{ canonicalId, generation, resolvedRouteIdentity }
```

is the minimum authority identity for asynchronous provider work.

Provider callbacks, timers, promises and commands created for generation N must be ignored once generation N+1 becomes authoritative.

A late event from song A must never:

- mark song B as playing;
- overwrite song B progress or duration;
- replace song B Media Session metadata;
- surface song A's error on song B;
- auto-advance song B;
- reopen or rebind a stale provider stage.

The current direct-media controller and command planner already enforce generation/song/binding checks. Wider adapters should converge on that behaviour.

## Command API

The end-state controller exposes explicit commands. Callers express intent; they do not execute provider operations directly.

### `select(selection)`

Select a canonical recording/set and resolved route for a new generation.

Selection may bind or prepare the chosen transport but must not fabricate a Playing state. Autoplay behaviour, where allowed, is an explicit subsequent command/policy decision rather than an accidental side effect of rendering metadata.

### `play(context?)`

Request playback for the current generation.

Acceptance means the command was valid for the active authority. It does not mean playback has started. The snapshot becomes `playing` only after matching provider/media evidence.

### `pause(context?)`

Request pause for the current generation. The authoritative state changes to `paused` only after matching transport evidence, except where a transport's documented synchronous semantics provide equivalent evidence.

### `seek(seconds, context?)`

Request a bounded logical seek for the current recording/set. The controller owns translation between logical listening time and provider time, including verified chapter offsets where applicable.

Views must not write provider time directly.

### `next(context?)` and `previous(context?)`

Request movement through the active queue/release/set context. Route readiness is evaluated before automatic movement becomes a new playable selection. Explicit navigation to an unavailable recording may remain visible and unavailable; automatic continuation must not silently land on a false playable state.

Queue/history policy may remain outside the low-level transport adapter, but the resulting selection enters through the same controller authority.

### `openStage(context?)`

Request the visible provider stage for the current route when the route supports a stage.

For current YouTube policy, scripted playback and its visible stage are one transport contract. `openStage` must not become a second mandatory authorisation step after primary Play for a ready route, nor may closing the stage leave hidden YouTube playback running.

### `stop()` / `clear()`

Stop or clear the current transport according to product semantics, invalidate stale work and remove transport-specific Media Session state. Clear/reset advances or otherwise invalidates the prior generation so late callbacks cannot resurrect it.

### `retry()`

Retry is allowed only against the current identifiable failure/unavailable context and must preserve recording identity. It must not search for or substitute a different recording unless a separate explicit product flow selects that recording.

## Authoritative snapshot

Subscribers receive an immutable snapshot. Presentation code may format it but may not mutate it.

A complete snapshot should carry only supported facts, including:

```text
version
generation
canonicalId
identity { title, artist, album?, artwork? }
route { kind, provider?, providerId?, startSeconds?, sourceUrl? }
phase
playbackState
position
duration
seek { active, target? }
capabilities
stage { supported, visible, state? }
error { code, recoverability? }
lifecycle { foreground, certainty? }
```

Exact property names can evolve during implementation, but the semantics are fixed by this contract.

### State phases

The common state vocabulary is:

- `idle`: no active selection;
- `selected`: identity/route accepted, no readiness claim yet;
- `loading`: matching transport is loading;
- `ready`: matching transport can accept playback without claiming it is already playing;
- `playing`: matching provider/media evidence confirms playback;
- `paused`: matching provider/media evidence confirms pause;
- `buffering`: selected transport temporarily lacks enough data while identity remains current;
- `ended`: matching provider/media evidence confirms end;
- `unavailable`: the selected identity has no executable route or has a durable route restriction;
- `blocked`: the route is valid but the current environment/policy prevents the requested action;
- `error`: matching transport evidence reports a failure.

Transport-specific detail may exist alongside these phases, but views must not invent additional competing global playback truth.

## Provider-visible invariant

When the active route is YouTube and scripted YouTube playback is active:

- the YouTube IFrame player remains visibly presented under the repository's YouTube policy;
- the same active player handles supported play, pause and seek commands;
- no hidden `<audio>` mirror or extracted media URL is used;
- closing/stopping the stage has explicit stop/close semantics;
- unrelated page clicks do not close the stage;
- provider identity stays bound to the selected canonical recording/generation.

An eventual controller migration must preserve `docs/product/youtube-first-playback.md` unless product policy is separately changed with evidence and review.

Authorised direct media, if/when enabled by product policy, uses the persistent direct-media element and its existing authority/planner safety. It must not make consumer-provider URLs executable by accident.

## Timers and polling ownership

Only the active transport adapter may own polling required by that provider.

The controller is responsible for lifecycle and teardown of that polling through the adapter boundary. A compatibility/view layer must not start a second interval to infer the same playback state.

Rules:

- one active provider progress poll per transport instance;
- stop provider timers on teardown, route replacement or invalidated generation;
- ignore callbacks whose generation/binding no longer matches;
- do not poll rendered labels to recover transport state;
- UI animation timers may exist independently only when they do not claim playback truth.

The current YouTube progress loop remains a migration responsibility until the YouTube adapter is brought behind the controller boundary. Its eventual owner is the YouTube transport adapter, not a view.

## Media Session ownership

Media Session is written from authoritative playback state and capability policy only.

One owner installs/removes Media Session action handlers for the active transport. Other runtimes must not independently overwrite those handlers.

Required behaviour:

- selected/loading state does not claim Playing;
- `playing` is projected only from matching provider/media evidence;
- buffering/interrupted/uncertain lifecycle state does not falsely advertise Playing;
- metadata belongs to the active canonical identity;
- position state uses the controller's logical position/duration;
- next/previous actions retain generation/current-context checks;
- end/error/unavailable/clear removes stale metadata/actions where policy requires it.

The existing `media-session-policy.js` and direct-media-controller tests are the reference for this projection style.

## Lifecycle and background behaviour

Page/app lifecycle changes reconcile state; they do not manufacture playback.

A hidden/background lifecycle transition may preserve confirmed transport continuation where the platform and provider permit it. A foreground/resume transition must reconcile against fresh provider/media evidence before making a stronger claim.

This controller contract does not promise background YouTube playback. Current YouTube product documentation explicitly does not support such a promise.

Automatic resume is never inferred merely because the app returned to the foreground.

## Error and recovery transitions

Errors belong to the active generation only.

An error transition records a stable reason/code without discarding canonical identity. Recovery policy decides which explicit actions are valid, for example retry, reopen stage, choose another recording, or remain unavailable.

A retry must be bounded. Repeated failure must remain visible rather than entering an invisible reload loop.

Network loss, provider API failure, embed restriction, removed/private media, autoplay restriction and route-unavailable are distinct classes when evidence can distinguish them. Unknown failure remains unknown rather than being relabelled as one of those causes.

## Subscription contract for views

Views subscribe to snapshots/events and render them one-way.

A view may:

- render title, artist, progress, duration, provider/stage state and errors;
- enable/disable controls from capabilities;
- dispatch controller commands in response to trusted user interaction;
- maintain purely presentational state such as an open sheet or focus position.

A view must not:

- observe title/artist text to discover the active track;
- infer playback state from a play/pause icon or CSS class;
- inspect a provider URL to reconstruct canonical song identity;
- create its own provider player for the same selected route;
- register competing Media Session handlers;
- mutate progress labels and later read those labels back as transport truth;
- treat navigation/hash mutation as provider evidence.

DOM `MutationObserver` remains valid for presentation concerns where DOM mutation is genuinely the source event. It is specifically forbidden as the end-state source of playback identity/state truth.

## Current runtime map

Current `main` is intentionally transitional.

### Existing controller-aligned pieces

- `src/playback/direct-source-resolver.js`: source-kind/rights-aware direct-vs-YouTube resolution boundary.
- `src/playback/direct-media-authority-state.js`: pure authority reducer for direct media.
- `src/playback/direct-media-command-planner.js`: generation/binding-scoped direct-media command planning.
- `src/playback/direct-media-controller.js`: persistent-media-element controller using the authority reducer, planner, lifecycle policy and Media Session policy.
- `src/playback/playback-lifecycle-policy.js`: lifecycle reconciliation policy.
- `src/playback/media-session-policy.js`: Media Session projection policy.
- playback recovery/policy modules under `src/playback/`: reusable pure policy where applicable.

These modules demonstrate the authority direction, but they are not proof that the public YouTube-first runtime has already migrated to one controller.

### Legacy/compatibility responsibilities still to migrate

`player-continuity.js`

- still observes rendered song-title mutations for provider resume/metadata synchronisation;
- should become a queue/continuation client of controller state rather than an identity observer;
- automatic continuation must continue to use the route-readiness work owned by #437 while that lane is active.

`provider-runtime.js`

- currently owns YouTube-only execution guards and input interception;
- remains an important route-policy compatibility boundary;
- its eventual transport integration must preserve exact-route failure semantics and one-tap/visible-stage product behaviour;
- do not migrate it while another active issue owns the file.

`youtube-player-runtime.js`

- owns the YouTube IFrame transport, provider callbacks, progress polling and Media Session behaviour today;
- should eventually become the YouTube transport adapter behind the single controller contract;
- provider callbacks must emit generation-bound evidence rather than write global/UI truth independently.

`simple-runtime.js`

- still observes rendered metadata/progress to synchronise control labels;
- should consume controller snapshots for playback-related labels while retaining unrelated shell responsibilities.

`assets/runtime/continuous-set-state.js`

- still reacts to song-title DOM mutation for continuous-set UI synchronisation;
- should subscribe to explicit canonical selection/set snapshots so Nonstop/chapter identity is never reconstructed from presentation text.

`assets/runtime/seek-state.js`

- currently has a separate seekability synchronisation path and an active performance lane (#894);
- preserve that lane. The eventual controller migration should consume authoritative route/capability/readiness state instead of adding another observer.

Optional UX modules may continue to observe DOM for non-authoritative presentation tasks. They are not playback authorities.

## Migration sequence

The migration must stay incremental so the production player remains deployable.

1. **Land this contract.** No behaviour change.
2. **Finish active P0 readiness/state/recovery owners.** In particular, do not overwrite #437 or other active transport/provider claims.
3. **Introduce/confirm one shared controller facade** that can represent the current YouTube route as well as any separately authorised direct route. Reuse existing pure state/planner/policy modules rather than duplicating them.
4. **Migrate one adapter only.** The first migrated adapter should be the smallest playback-authoritative DOM-observer path whose required state already exists in controller snapshots. Remove its playback identity observer and prove equivalent behaviour with fixtures.
5. **Move YouTube transport authority behind the controller.** Provider callbacks become evidence events; the adapter owns the IFrame/timer, while controller snapshots own global truth and Media Session projection.
6. **Migrate continuity and continuous-set consumers.** Queue/release/Nonstop logic dispatches commands and subscribes to canonical state instead of reading title/progress DOM.
7. **Retire redundant interceptors/globals.** Only after equivalent controller paths and regression coverage are green.

Each step is separately reviewable. Do not merge steps merely to reduce file count.

## First adapter selection rule

The first redundant adapter removed under #449 must satisfy all of these before implementation:

- its required playback identity/state is already available from the controller facade;
- its files are unowned on #364 at implementation time;
- removing it does not require a provider/source policy rewrite;
- ordinary queue, Nonstop, seek and rapid A→B selection fixtures can prove no regression;
- production can ship after that one adapter migration without requiring the rest of the sweep.

At the time this contract was written, `player-continuity.js`, `simple-runtime.js`, `provider-runtime.js`, `assets/runtime/seek-state.js` and related player files have active or adjacent owners. This document deliberately does not choose or edit the first runtime adapter yet.

## Representative command proof

For every migrated path, a fixture must prove this shape:

```text
trusted user Play
  -> one controller.play() intent
  -> one valid generation-scoped transport command
  -> one provider/media play request
  -> no Playing snapshot until matching provider/media evidence
```

The same fixture family must prove duplicate interception does not cause two provider calls.

Rapid-selection proof must include:

```text
select A generation 10
select B generation 11
late A playing/error/time callback
=> B identity/state unchanged
```

## Required regression coverage for runtime slices

A runtime migration under this contract is not complete with source/static checks alone. Its tests must cover the affected subset of:

- ordinary single-track play/pause/seek;
- automatic queue continuation and explicit unavailable selection;
- Previous history semantics;
- release-context continuation;
- Nonstop full-set and verified chapter logical time;
- rapid A→B selection with stale callbacks;
- loading/buffering/pause/end/error truth;
- stage open/close semantics for YouTube;
- Media Session metadata/actions/position;
- offline/reconnect and lifecycle reconciliation where relevant;
- keyboard/pointer interaction without duplicate dispatch;
- cleanup of timers/listeners/observers on replacement and teardown.

Use current repository validators and browser evidence appropriate to the changed layer. Do not weaken unrelated red gates to land a migration.

## Non-goals

This contract does not:

- make direct audio executable under the current YouTube-only public policy;
- change catalogue/provider mappings;
- promise background YouTube playback;
- replace queue policy, catalogue truth or Nonstop source evidence;
- require a sweep rewrite of `app.js` or every runtime adapter;
- remove DOM observers used only for legitimate presentation concerns;
- declare #449 complete without at least one real adapter migration and its behavioural proof.

## Completion definition for #449

The parent issue can close only when:

1. this authority/command/snapshot contract is current;
2. one isolated shared controller/state boundary is the single route for one representative playback command;
3. one redundant playback-authoritative adapter/observer has been migrated or removed;
4. the migrated view no longer infers active track from DOM mutation;
5. ordinary queue, Nonstop, seek and rapid-selection safety are proven for the affected path;
6. remaining adapters have explicit migration ownership and sequence;
7. production remains deployable and required repository/browser gates are green.

Until then, this document is the migration target, not a claim that the runtime already satisfies every rule above.
