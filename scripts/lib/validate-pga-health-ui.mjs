import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHealthPresentation } from '../../src/pga/health/presentation.js';
import { mountHealth, normaliseHealthResult } from '../../src/pga/app/health.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nowMs = Date.parse('2026-09-10T07:20:00.000Z');
const checkedAt = new Date(nowMs - 60_000).toISOString();

function subsystem(name, status = 'healthy', extra = {}) {
  return {
    name,
    label: name[0].toUpperCase() + name.slice(1),
    criticality: ['production', 'playback'].includes(name) ? 'critical' : 'important',
    status,
    summary: `${name} ${status}`,
    reasons: status === 'healthy' ? [] : [`${name} requires attention`],
    action: status === 'healthy' ? null : `Inspect ${name}`,
    checkedAt,
    dataThroughAt: checkedAt,
    source: {
      kind: 'github',
      id: name,
      url: `https://github.com/ruddvz/garba/actions?token=must-strip#${name}`,
    },
    details: {},
    ...extra,
  };
}

const names = ['production', 'playback', 'deployment', 'ci', 'catalogue', 'telemetry', 'rollups', 'pwa'];
const healthySnapshot = {
  schemaVersion: 'pga-health-snapshot/v1',
  status: 'healthy',
  generatedAt: checkedAt,
  evaluatedAt: checkedAt,
  leadingSubsystem: null,
  subsystems: names.map((name) => subsystem(name)),
};

const healthyPresentation = buildHealthPresentation(healthySnapshot, { nowMs });
const canonical = normaliseHealthResult({
  transport: 'ready',
  envelope: { status: 'complete', data: { presentation: healthyPresentation } },
});
assert.equal(canonical.transport, 'ready');
assert.equal(canonical.presentation.mode, 'canonical');
assert.equal(canonical.presentation.complete, true);
assert.equal(canonical.presentation.status, 'healthy');
assert.equal(canonical.presentation.subsystems.length, 8);
assert.equal(canonical.presentation.subsystems[0].source.url, 'https://github.com/ruddvz/garba/actions', 'source query/hash must be stripped');

const degradedSnapshot = {
  ...healthySnapshot,
  status: 'degraded',
  subsystems: names.map((name) => name === 'playback' ? subsystem(name, 'failed') : name === 'pwa' ? subsystem(name, 'stale') : subsystem(name)),
  leadingSubsystem: 'playback',
};
const degradedPresentation = buildHealthPresentation(degradedSnapshot, { nowMs });
const degraded = normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: degradedPresentation } });
assert.equal(degraded.presentation.status, 'degraded');
assert.equal(degraded.presentation.subsystems[0].name, 'playback', 'failed rows must lead the scan order');
assert.equal(degraded.presentation.subsystems[1].name, 'pwa', 'stale rows must rank ahead of healthy rows');
assert.equal(degraded.presentation.problems.length, 2);

const incompletePresentation = {
  ...healthyPresentation,
  complete: true,
  subsystems: healthyPresentation.subsystems.slice(0, 7),
};
const incomplete = normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: { presentation: incompletePresentation } } });
assert.equal(incomplete.presentation.complete, false);
assert.equal(incomplete.presentation.status, 'unknown', 'missing canonical subsystem must never render healthy');

const hostilePresentation = {
  ...healthyPresentation,
  subsystems: healthyPresentation.subsystems.map((row, index) => index === 0
    ? { ...row, source: { ...row.source, url: 'https://evil.example/steal?secret=1' } }
    : row),
};
const hostile = normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: hostilePresentation } });
assert.equal(hostile.presentation.subsystems.find((row) => row.name === 'production').source.url, null, 'unapproved evidence hosts must not become links');

const rollupOnly = normaliseHealthResult({
  transport: 'ready',
  envelope: {
    status: 'complete',
    generatedAt: checkedAt,
    dataThrough: checkedAt,
    data: { rollups: [{ status: 'complete', data_through_ms: nowMs - 120_000 }] },
  },
});
assert.equal(rollupOnly.presentation.mode, 'rollup-only');
assert.equal(rollupOnly.presentation.complete, false);
assert.equal(rollupOnly.presentation.status, 'unknown', 'rollup-only evidence cannot prove overall health');
assert.equal(rollupOnly.presentation.subsystems[0].name, 'rollups');
assert.equal(rollupOnly.presentation.subsystems[0].status, 'healthy');

const badRollup = normaliseHealthResult({
  transport: 'ready',
  envelope: { status: 'partial', generatedAt: checkedAt, data: { rollups: [{ status: 'failed' }] } },
});
assert.equal(badRollup.presentation.status, 'unknown');
assert.equal(badRollup.presentation.problems[0].status, 'degraded');

assert.equal(normaliseHealthResult({ transport: 'auth-expired', envelope: null }).transport, 'auth-expired');
assert.equal(normaliseHealthResult({ transport: 'error', envelope: null }).presentation, null);
assert.equal(normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: {} } }).presentation, null);
assert.deepEqual(
  normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: healthyPresentation } }),
  normaliseHealthResult({ transport: 'ready', envelope: { status: 'complete', data: healthyPresentation } }),
  'identical health inputs must normalise deterministically',
);

const [client, css, html] = await Promise.all([
  readFile(path.join(root, 'src/pga/app/health.js'), 'utf8'),
  readFile(path.join(root, 'src/pga/app/health.css'), 'utf8'),
  readFile(path.join(root, 'src/pga/app/index.html'), 'utf8'),
]);

assert.match(client, /fetchEnvelope\('\/api\/health'/, 'Health client must use protected Health endpoint');
assert.match(client, /const token = \+\+generation;\s*controller\?\.abort\(\);\s*controller = null;\s*if \(!navigator\.onLine\)/s, 'Health refresh must invalidate and abort before the offline early return');
assert.match(client, /if \(!navigator\.onLine\)[\s\S]*?return;\s*}\s*controller = new AbortController\(\)/, 'offline refresh must not allocate a replacement controller');
assert.match(client, /token !== generation \|\| signal\.aborted/, 'late Health responses must not render');
assert.match(client, /mountHealth\(\{ autoLoad: !fixtureAllowed, fixtureMode: fixtureAllowed \}\)/, 'localhost shell fixture must enter explicit network-inert fixture mode');
assert.match(client, /if \(!fixtureMode\) \{[\s\S]*data-nav="health"[\s\S]*hashchange[\s\S]*online[\s\S]*offline[\s\S]*\}/, 'fixture mode must suppress automatic navigation and connectivity fetch triggers');
assert.doesNotMatch(client, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/, 'Health UI must avoid raw HTML injection');
assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie|eval\s*\(/, 'Health UI must not add sensitive browser storage or eval');
assert.match(client, /url\.search = ''/);
assert.match(client, /url\.hash = ''/);

function fakeNode() {
  const childQueries = new Map();
  return {
    hidden: false,
    dataset: {},
    textContent: '',
    className: '',
    href: '',
    target: '',
    rel: '',
    addEventListener() {},
    setAttribute() {},
    removeAttribute(name) { if (name === 'hidden') this.hidden = false; },
    toggleAttribute(name, force) { if (name === 'hidden') this.hidden = Boolean(force); },
    replaceChildren() {},
    append() {},
    querySelector(selector) {
      if (!childQueries.has(selector)) childQueries.set(selector, fakeNode());
      return childQueries.get(selector);
    },
  };
}

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalLocation = globalThis.location;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  const nodes = new Map();
  const section = fakeNode();
  section.hidden = false;
  nodes.set('[data-view="health"]', section);
  const listeners = new Map();
  const network = { onLine: true };

  globalThis.document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, fakeNode());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return fakeNode(); },
  };
  globalThis.window = { addEventListener(type, listener) { listeners.set(type, listener); } };
  globalThis.location = { hash: '#health', hostname: 'validator.local' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });

  const pending = [];
  const fetchEnvelope = (requestPath, { signal }) => new Promise((resolve) => pending.push({ requestPath, signal, resolve }));
  const mounted = mountHealth({ fetchEnvelope, autoLoad: false, fixtureMode: false });
  assert.ok(mounted, 'Health test mount must initialise');

  const firstLoad = mounted.reload();
  await Promise.resolve();
  assert.equal(pending.length, 1, 'online Health refresh must start exactly one protected request');
  const firstSignal = pending[0].signal;
  assert.equal(firstSignal.aborted, false);

  network.onLine = false;
  listeners.get('offline')?.();
  await Promise.resolve();
  assert.equal(firstSignal.aborted, true, 'offline transition must abort the previous protected request');
  assert.equal(pending.length, 1, 'offline transition must not start a replacement Health request');
  assert.equal(nodes.get('#healthState').dataset.state, 'offline');

  pending[0].resolve({ transport: 'ready', envelope: { status: 'complete', data: { presentation: healthyPresentation } } });
  await firstLoad;
  assert.equal(nodes.get('#healthState').dataset.state, 'offline', 'late pre-offline Health evidence must not overwrite Offline state');

  network.onLine = true;
  const recoveryLoad = mounted.reload();
  await Promise.resolve();
  assert.equal(pending.length, 2, 'online recovery must start a fresh Health request');
  assert.notEqual(pending[1].signal, firstSignal, 'online recovery must use a fresh AbortController');
  assert.equal(pending[1].signal.aborted, false);
  pending[1].resolve({ transport: 'ready', envelope: { status: 'complete', data: { presentation: healthyPresentation } } });
  await recoveryLoad;
  assert.equal(nodes.get('#healthOverallStatus').textContent, 'Healthy', 'fresh online Health evidence may render after recovery');
  assert.equal(nodes.get('#healthContent').hidden, false);
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
}

assert.equal((html.match(/health\.css/g) || []).length, 1, 'Health stylesheet must load once');
assert.equal((html.match(/health\.js/g) || []).length, 1, 'Health module must load once');
assert.match(html, /id="healthOverallStatus"/);
assert.match(html, /id="healthSubsystems"/);
assert.match(html, /Unknown is never converted to zero or healthy\./);

assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
assert.match(css, /min-height:\s*44px/, 'evidence links need touch-friendly minimum height');
assert.match(css, /@media \(forced-colors: active\)/);
assert.doesNotMatch(css, /100vw/, 'Health UI must not introduce viewport-width overflow');

console.log('✓ PGA Health UI preserves canonical complete/incomplete truth and rollup-only uncertainty');
console.log('✓ Failed/degraded/stale evidence stays prioritised and safe evidence URLs are sanitised');
console.log('✓ Offline transition aborts stale Health requests and online recovery uses a fresh controller');
console.log('✓ Protected loading, cancellation, network-inert fixture mode and no-raw-HTML contracts pass');
