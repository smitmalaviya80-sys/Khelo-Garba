# PlayGarba project context

Use this as the compact product briefing. Deeper truth lives in the repository sources linked below.

## Product

PlayGarba is a community-built home for Garba music, discovery, live sets, archives and listening. The product combines a careful source-first catalogue with a fast installable listening experience.

The primary product is the listening/discovery experience at `playgarba.com`. General pages, Explore, catalogue details, PWA behaviour and supporting content should serve that product rather than competing with it.

## Product priorities

When trade-offs are required, favour:

1. truthful playable music;
2. clear discovery and listening flow;
3. correct release, artist and recording identity;
4. fast, stable mobile behaviour;
5. simple navigation and low visual clutter;
6. useful cultural/catalogue context only when supported by evidence;
7. installable/offline-safe PWA behaviour without breaking online playback truth.

Do not preserve complexity merely because it already exists. Do preserve stable contracts and evidence-backed catalogue identity.

## Catalogue truth

Canonical catalogue inputs are under `data/catalogue/` and its manifest. Read `data/README.md`, `docs/catalogue/schema.md`, `docs/catalogue/rights.md` and `docs/catalogue/song-catalog-contract.md` when changing catalogue or playback identity.

Rules:

- never invent dates, credits, track order, durations, artists, labels, rights, translations, spellings or release relationships;
- a discovery lead is not canonical metadata;
- similar titles do not prove identical recordings;
- a YouTube video or provider page must match the intended recording/release before it becomes a playback route;
- when exact identity is unresolved, fail closed instead of silently substituting a convenient recording;
- preserve source provenance and uncertainty.

## Playback

The player is not a generic streaming shell. It must preserve truthful route identity across direct audio, YouTube and any other supported provider behaviour.

When changing playback, inspect the current runtime contracts and validators before editing. Do not patch visible symptoms in one layer if route readiness, continuity, provider state or source identity is the real cause.

Long-form, nonstop and live material may use chapter/timestamp semantics that differ from ordinary split tracks. Do not flatten those distinctions.

## Explore and general pages

Explore should make the catalogue easier to browse without creating unnecessary thin pages or duplicating the listening experience. Prefer strong search, filtering, artist/release context and clear return-to-player behaviour over page proliferation.

General pages should be concise and useful. They should explain the product, installation/PWA use, catalogue/source principles and relevant navigation without becoming a second homepage layered on top of the player.

## Visual direction

The interface should feel intentional, music-first and culturally grounded without generic festival decoration or AI-looking excess.

- Prefer strong artwork/background imagery already approved in the repository over decorative filler.
- Keep controls legible over artwork.
- Preserve hierarchy on narrow phones first.
- Avoid repeated cards, excessive gradients, ornamental badges and UI chrome that does not help listening or discovery.
- Do not use an old visual asset simply because it exists if a newer approved source has replaced it.
- Treat artist identity imagery carefully. Do not use uncertain portraits as verified identity.

For detailed visual rules, inspect `docs/product/design-system.md` and the current relevant CSS/runtime layer.

## Language and cultural handling

Read `.raas/LANGUAGE.md` for any user-facing text.

Names, release titles and Gujarati cultural terms are data, not decoration. Preserve canonical spellings/transliterations unless the issue is explicitly correcting them from evidence.

Do not describe all Gujarati folk music as Garba, all Raas as Dandiya, or all festival material as interchangeable. Use the repository taxonomy rather than cultural guesswork.

## Rights

PlayGarba is a discovery/listening project, not a raw commercial-audio mirror. Public availability does not imply redistribution permission.

Never add downloadable/raw commercial audio to GitHub without documented rights. When rights or provider usage is uncertain, inspect `docs/catalogue/rights.md` and related rights records before implementation.

## Source map

Use these entry points instead of searching the whole repository blindly:

- product overview: `README.md`
- documentation index: `docs/README.md`
- roadmap: `docs/project/roadmap.md`
- design: `docs/product/design-system.md`
- responsive/PWA: `docs/product/responsive-pwa.md`
- catalogue schema: `docs/catalogue/schema.md`
- rights: `docs/catalogue/rights.md`
- song/catalogue contract: `docs/catalogue/song-catalog-contract.md`
- agent coordination: `docs/operations/agent-coordination.md`
- canonical catalogue manifest: `data/catalogue/index.json`
- validation entry point: `package.json`