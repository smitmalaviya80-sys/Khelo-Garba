# GARBA product polish pass

Date: 7 September 2026  
Status: historical implementation note; not the current playback/deployment contract

For current production policy and deployed identity, use:

- [`youtube-first-playback.md`](youtube-first-playback.md)
- [`playback-runtime-coverage.md`](playback-runtime-coverage.md)
- `https://playgarba.com/build-info.json`

Some provider-language below describes the pre-YouTube-only implementation that existed during this pass. It is preserved as history, not as permission to execute Spotify, Apple Music, Amazon Music or direct-audio routes today.

This pass focused on interaction quality, accessibility, first paint, PWA behaviour, provider playback consistency and community contribution UX. It did not change canonical catalogue facts or overwrite active song-discovery work.

## Problems found and addressed

### 1. Demo metadata flashed before the catalogue loaded

The shell previously rendered `Traditional demo 01`, `Add artist` and a fake 4:30 duration before real catalogue data arrived. That looked like broken or fabricated content.

The app now starts in an explicit loading state with a restrained skeleton. Initial visible copy is truthful (`Loading Garba…`, `Preparing the collection`) and is replaced as soon as the real catalogue renders.

### 2. Nonstop Garba and Browse Songs could collide

The provider bridge dynamically inserted a second `.browse-button` immediately before the existing Browse Songs button. Both inherited the same CSS grid row, so they could occupy the same grid cell and visually overlap.

Both actions were moved into a shared `browse-actions` wrapper so the pair could lay out responsively. Later Explore/Nonstop work superseded parts of that original browser structure; current runtime/viewport tests are authoritative.

### 3. Current-song favourite was effectively mobile-only

The heart beside the current track was hidden on larger screens. Desktop users could open the favourites collection but did not have an equally direct current-track action.

The current-track heart became available beside the artist across responsive sizes while the top utility continued to open the saved collection.

### 4. Playback-provider UI felt disconnected from the player

At the time of this pass, injected provider/Nonstop surfaces used a separate visual style. The polish layer brought those surfaces into the GARBA glass/ivory/accent system and strengthened focus handling.

That observation predates the current YouTube-only execution policy. The present contract is one visible YouTube playback engine; other provider identities may remain only as source/migration evidence.

### 5. Provider provenance was not visible until playback

This pass introduced source provenance so listeners could understand where a catalogue mapping came from.

Under the current policy, a source/provenance label must never imply that PlayGarba will execute that provider. An Apple Music, Spotify, Amazon Music or other provider record can remain useful evidence while the song is still awaiting an exact YouTube route. Executable state must come from the YouTube-only route/readiness contract.

### 6. Sharing a specific track was unnecessarily awkward

The top utility bar added Share. On supported devices it used the native share sheet; otherwise it copied the deep link. The current `genre` + `song` state was preserved so the recipient could open the same track.

Keyboard shortcut: `Shift+S`.

### 7. Search had no discoverable keyboard shortcut

Pressing `/` outside a text field opened the existing search interface. Search wording was clarified around songs/artists.

### 8. Song-browser result volume was unclear

The browser reported the number of rendered results and used `content-visibility` where supported to reduce rendering cost for large result sets. Current Explore progressive-loading behavior is covered by later validators.

### 9. Offline state was only communicated after a transition

A compact Offline indicator was added whenever the browser reported loss of connectivity. Existing offline/back-online toasts continued to provide transition feedback.

### 10. The first screen needed stronger readability without hiding the artwork

The player remained artwork-first. Instead of adding an opaque card, a localized radial scrim sat behind track metadata. Controls received restrained glass treatment and the progress control gained a larger interactive thumb.

### 11. SEO/share metadata was too generic

The static page gained canonical/Open Graph/Twitter metadata plus minimal WebApplication structured data.

When a real track is selected, page title and metadata update to the track and artist for better history, tab identification and sharing context.

### 12. PWA polish

The service-worker shell version was bumped so existing installations could receive the new UI assets. Navigation fallback was hardened for query-string differences and the manifest received stronger launch/install handling.

### 13. Open-source contribution UX was incomplete

This pass added:

- `CONTRIBUTING.md`;
- a Missing song / release issue form;
- a Player / website bug form;
- issue-template links to catalogue status and the rights policy.

Non-code contributions such as old track lists, regional artist information, Gujarati spelling corrections and live-set timestamps are explicitly welcomed.

## Historical visual note

The original pass recorded a blocker around lightweight SVG worlds and a separately prepared 15-image source pack. That note is no longer a current deployment decision: later work added and validated the production artwork-pack flow.

Current artwork/runtime packaging checks, the Pages workflow and `/build-info.json` are authoritative for what ships. Do not reintroduce old image-pack assumptions from this historical document.

## Validation expectations

`npm run check` remains the source-controlled validation entry point.

Static validation is not a substitute for real-device testing. Before calling the product visually/reliably complete, verify at least:

- iPhone Safari portrait;
- iPhone Safari short landscape;
- installed iOS Add to Home Screen;
- iPad portrait and landscape;
- Android Chrome;
- desktop Chrome/Edge;
- desktop Safari;
- keyboard-only navigation;
- reduced-motion mode;
- offline/reconnect;
- exact YouTube playback through the visible player;
- migration-only/unavailable recording behavior;
- Nonstop set and chapter playback.

For every result, record the exact deployed revision from `/build-info.json` rather than assuming source and assembled production files are byte-identical.
