# PGA Health evidence collector

The Health collector is the protected server-side acquisition boundary between external operational evidence and the canonical `pga-health-snapshot/v1` model.

It does not define Health status. It fetches a small set of bounded observations, supplies them to the already-existing Health adapters/snapshot composer, and returns only that canonical snapshot.

## What it acquires

The collector may acquire three request-time sources:

1. `https://playgarba.com/` for canonical production reachability.
2. `https://playgarba.com/build-info.json` for deployed build identity.
3. GitHub check-runs for an explicitly supplied full Git revision and validated `owner/repo` identifier.

Playback smoke, catalogue validation, telemetry health, rollup health and installed-PWA evidence are supplied by the protected caller. Those observations still pass through their existing bounded adapters before they can appear in a snapshot.

## Network boundary

Production URLs are constants. A caller cannot replace them with another origin.

GitHub API requests are built only from:

- the fixed `https://api.github.com` origin;
- a conservative `owner/repo` identifier;
- a full 40-character Git commit SHA;
- the fixed check-runs API path.

The human evidence link is similarly constructed on `https://github.com`.

The collector uses `redirect: manual`. A successful response whose reported final URL differs from the exact request URL is rejected as `off_origin`. Redirects are therefore never silently accepted as canonical evidence.

## Bounded reads and timeouts

JSON bodies are streamed and counted before parsing:

- build-info: at most 64 KiB;
- GitHub check-runs: at most 512 KiB;
- check-runs retained after parsing: at most 100.

A declared `Content-Length` above the limit is rejected before the body is consumed. Streamed bytes are counted as they arrive and the reader is cancelled once the cap is exceeded.

Every fetch receives an abort signal. The default acquisition timeout is 5 seconds and the caller cannot raise it above 10 seconds.

Failure codes are deliberately bounded: `timeout`, `network_error`, `invalid_response`, `off_origin`, `body_too_large`, `invalid_json` and `http_<status>`. Raw exception messages and response bodies are not copied into Health output.

## GitHub token handling

`githubToken` is optional. If supplied, it is used only in the outbound GitHub `Authorization` header.

The token is never:

- placed in an evidence/source URL;
- passed to `composeHealthSnapshot()`;
- returned in the snapshot;
- included in collector error codes;
- copied from a GitHub response.

Header values containing CR/LF are rejected rather than forwarded.

## CI truth

The collector does not invent a required-check list. `requiredChecks` must be supplied explicitly.

If the repository, revision or required-check configuration is missing/invalid, the collector makes no GitHub request. The canonical CI adapter then receives unresolved evidence and keeps CI `unknown`.

The collector also reduces successful GitHub responses to the fields needed by `requiredChecksEvidence()`. Arbitrary check output and response metadata are discarded.

## Freshness

There is no universal stale threshold in the collector. Per-subsystem freshness budgets may be supplied explicitly through `freshnessBudgets`.

For caller-supplied operational observations, an explicit freshness budget is added only when that observation did not already supply one. Existing evidence timestamps are preserved; the collector does not overwrite them with request time.

## Failure isolation

Production, build-info and GitHub acquisition run independently. One failure does not erase data from another source or from caller-supplied playback/catalogue/telemetry/rollup/PWA evidence.

Production network/HTTP failure is a completed failed reachability probe. Build/CI acquisition failure remains unresolved evidence unless the existing canonical adapter has enough explicit evidence to conclude otherwise.

## Integration boundary

`collector.js` is not a public client module and is not wired into `admin-worker.js` by this lane.

After the active Live backend lane releases the protected Worker route file, #844 may call `collectHealthSnapshot()` from the authenticated `/api/health` path. The route must keep its existing server-side auth and `no-store` controls.

The collector itself does not mean PGA Health is deployed or production-verified.
