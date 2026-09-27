# PGA release acceptance

This directory contains the evidence-strict release-acceptance ledger for PlayGarba Admin (PGA).

It exists to stop `not tested`, `blocked`, or weak evidence from being presented as a passing release. The ledger is a pure model. It does not run browsers, contact production, read GitHub, access Cloudflare, inspect devices, or store credentials.

## Status contract

Every required item is exactly one of:

- `verified` — compatible evidence exists for the exact release revision;
- `failed` — compatible evidence for the exact release revision proves a required check failed;
- `blocked` — a concrete blocker prevents the check from being completed;
- `not_inspected` — no acceptable current evidence exists.

Overall release status is deterministic:

1. any required failure -> `failed`;
2. otherwise any blocker -> `blocked`;
3. otherwise any not-inspected item -> `incomplete`;
4. only all required items verified -> `ready`.

A new ledger therefore starts as `incomplete`, never `ready`.

## Canonical matrix

`ACCEPTANCE_MATRIX` mirrors issue #846 and currently contains 46 required checks:

- 20 environment, device, PWA, accessibility, network and state checks;
- 9 founder journeys;
- 7 public PlayGarba regression checks;
- 10 release-quality gates.

The matrix is deliberately PGA-specific. The public-player release matrix owned by #452 remains a separate source of evidence. Merely having that document or an open/closed issue does not verify a PGA public-regression item.

## Evidence methods

The supported evidence classes are:

- `browser_automation`
- `physical_device`
- `assistive_technology`
- `manual_interaction`
- `production_probe`
- `performance_measurement`
- `repository_validation`
- `reviewed_external_evidence`

Each matrix item declares which methods are acceptable. Evidence from another class is rejected back to `not_inspected`.

Important examples:

- iPhone, installed iPhone PWA, Android, installed Android PWA and iPad checks require physical-device evidence;
- a screen-reader spot check requires assistive-technology evidence;
- the protected production build requires a production probe;
- public cold-start/performance regressions require measured or reviewed external performance evidence rather than a source-code assumption.

## Evidence identity

A `verified` or `failed` attempt needs:

- a compatible evidence method;
- an observation timestamp;
- the exact 40-character target Git revision;
- an environment description;
- a source ID or HTTPS source URL.

If the evidence revision differs from the release candidate, it cannot verify or fail that candidate. Positive evidence also stops being verified when its own explicitly supplied freshness budget expires.

A known exact-revision failure remains a failure even when old, while being marked stale for review. This avoids hiding a known defect merely because time passed.

Source URLs are reduced to HTTPS origin/path. Credentials, query strings and fragments are not retained.

## Blockers

A blocked item must carry a concrete blocker such as an issue number, bounded blocker code, or bounded explanatory detail. The model does not infer blockers automatically from GitHub state.

This matters while programme dependencies are still moving. For example, #840/#842, #843, #844, #845 or Cloudflare provisioning may block particular release checks today, but those issue numbers are not hard-coded forever-status. A later release run must supply the current blocker or current evidence explicitly.

## Privacy and security boundary

The ledger keeps only bounded release evidence. It must not receive or return:

- Cloudflare Access assertions or secrets;
- GitHub/Cloudflare tokens;
- raw listener/session/search telemetry;
- arbitrary HTTP responses;
- browser storage contents;
- arbitrary caller payload fields.

`createAcceptanceLedger()` sanitises the supported evidence shape and ignores unknown payload fields. Unknown acceptance item IDs are reported only by ID so typos can be found without echoing their payloads.

## Example

```js
import { createAcceptanceLedger } from './acceptance.js'

const ledger = createAcceptanceLedger({
  'env.desktop-chrome': {
    state: 'verified',
    evidence: {
      method: 'browser_automation',
      observedAt: '2026-09-10T04:30:00.000Z',
      revision: '<exact-40-character-release-sha>',
      environment: 'Chrome desktop release smoke',
      sourceId: 'workflow-run-123',
    },
  },
  'env.iphone-installed-pwa': {
    state: 'blocked',
    blocker: {
      code: 'physical_device_check_pending',
      detail: 'Installed iPhone PWA interaction has not been run on the release candidate.',
    },
  },
}, {
  targetRevision: '<exact-40-character-release-sha>',
  targetEnvironment: 'PGA production release candidate',
})
```

This example is illustrative only. It is not evidence that any PGA release check has passed.

## Validation

Run:

```sh
node --check src/pga/release/acceptance.js
node --test src/pga/release/tests/acceptance.test.mjs
```

The dedicated `Validate PGA release acceptance` workflow runs those checks plus a small purity guard. Full repository validation is still required before merge.

## What this does not prove

This model does not itself prove that PGA works on iPhone, Android, iPad, Safari, Chrome, a screen reader, a flaky network, or the protected production hostname. Those states become `verified` only after compatible evidence for the exact release revision is supplied during the later #846 acceptance run.
