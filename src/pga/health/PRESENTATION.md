# PGA Health presentation contract

This layer turns the canonical `pga-health-snapshot/v1` object into bounded founder-facing view data. It does not collect health evidence, re-run repository validators, query production, or decide whether a subsystem is healthy. Those responsibilities remain in the existing Health adapters, evaluator and snapshot composer.

## Founder question

The presentation model exists to answer one question quickly: **Is anything broken, stale or unknown right now?**

The output is deliberately scan-first:

1. one overall status and short summary;
2. compact failed/degraded/stale/unknown counts;
3. problems ordered by status severity, then subsystem criticality, then canonical subsystem order;
4. the eight canonical subsystem rows in stable order;
5. only actions and safe evidence links already supplied by the snapshot.

## Canonical order

The view always contains exactly these eight rows:

`Production · Playback · Deployment · CI · Catalogue · Telemetry · Rollups · PWA`

Missing rows are rendered as `Unknown`. Extra subsystem names are ignored by this presentation contract so an unexpected payload cannot displace or rename founder-critical health categories.

## Truth rules

- Only `pga-health-snapshot/v1` is accepted.
- A missing, malformed or wrong-schema snapshot produces an `Unknown` presentation with eight explicit unknown rows.
- Missing canonical subsystem evidence prevents an all-green presentation.
- The canonical snapshot's overall status remains authoritative when the snapshot is structurally complete. This layer does not downgrade or upgrade non-critical failures independently.
- A `Healthy` headline and all-good copy are permitted only when all eight canonical rows are present and healthy.
- `Stale` and `Unknown` remain explicit states. Neither is converted to zero or healthy.
- Numeric zero in approved bounded detail fields is preserved. Missing fields stay missing.
- Freshness text is derived only from timestamps already present in the snapshot plus the explicit caller-supplied `nowMs`. This layer never invents a freshness threshold.
- Actions are shown only when the originating subsystem row supplied an action. No remediation is fabricated by the presentation layer.

## Safe evidence links

A source link is exposed only when the snapshot supplied an HTTPS URL. Before presentation:

- username and password are removed;
- query parameters are removed;
- fragments are removed;
- non-HTTPS and malformed URLs are rejected;
- the final URL is bounded in length.

The view should link to evidence, not duplicate raw logs.

## Bounded details

Only a small allow-list of already-sanitised scalar diagnostic fields is allowed through the presentation model. Raw error strings, stack traces, listener telemetry, arbitrary object trees, tokens and unknown fields are dropped.

This is intentionally stricter than simply serialising `subsystem.details` into the UI.

## Accessibility

The model returns a text-only `accessibilitySummary` that includes the overall state and every non-healthy subsystem. A UI may add colour or icons, but colour and icon shape must not be required to understand status.

## Integration boundary

`presentation.js` is pure and DOM-free. The future #844 shell integration may render this model, but it must not move evidence collection or status evaluation into browser presentation code.

The shared PGA shell, backend, deployment configuration and public PlayGarba runtime are outside this lane.
