import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeHomeLiveResults,
  mountHomeLive,
  normaliseHomeMetric,
  normaliseHomeResult,
  normaliseLiveResult,
} from '../../src/pga/app/home-live.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const metric = (value, precision = 'exact', sampled = false) => ({ value, precision, sampled });
const generatedAt = '2026-09-10T06:40:00.000Z';
const dataThrough = '2026-09-10T06:39:30.000Z';

const homeReady = {
  transport: 'ready',
  envelope: {
    status: 'complete', generatedAt, dataThrough,
    window: { from: '2026-09-09T18:30:00.000Z', to: '2026-09-10T18:30:00.000Z', timezone: 'Asia/Kolkata' },
    sources: [{ name: 'analytics-engine', status: 'complete', sampled: false }],
    data: {
      today: {
        uniqueBrowsers: metric(0), sessions: metric(7), confirmedPlayStarts: metric(4), surfaceViews: metric(11),
      },
      listeningTodayMs: metric(3_900_000),
      lifetime: {
        sessions: metric(120), confirmed_play_starts: metric(86), surface_views: metric(310), listening_ms: metric(75_600_000),
      },
      sessionsDaily: [
        { day: '2026-09-08', value: 5, precision: 'exact', sampled: false, dataThroughMs: 1_757_300_000_000 },
        { day: '2026-09-09', value: 7, precision: 'exact', sampled: false, dataThroughMs: 1_757_386_000_000 },
      ],
    },
  },
};

const liveReady = {
  transport: 'ready',
  envelope: {
    status: 'complete', generatedAt, dataThrough,
    sources: [{ name: 'analytics-engine-live', status: 'complete', sampled: false }],
    data: {
      liveNow: metric(0), listeningNow: metric(0), browsingNow: metric(0), expirySeconds: 120, trendMinutes: 30,
      breakdowns: [
        { surface: 'player', world: 'courtyard', displayMode: 'browser', sessions: metric(3), listeningSessions: metric(2), browsingSessions: metric(1) },
        { surface: 'player', world: 'courtyard', displayMode: 'pwa', sessions: metric(4), listeningSessions: metric(3), browsingSessions: metric(1) },
        { surface: 'explore', world: null, displayMode: 'browser', sessions: metric(3), listeningSessions: metric(0), browsingSessions: metric(3) },
      ],
      trend: [
        { minute: '2026-09-10T06:38:00.000Z', activeSessions: metric(2), listeningSessions: metric(1), browsingSessions: metric(1) },
        { minute: '2026-09-10T06:39:00.000Z', activeSessions: metric(3), listeningSessions: metric(2), browsingSessions: metric(1) },
      ],
    },
  },
};

assert.equal(normaliseHomeMetric(null), null);
assert.equal(normaliseHomeMetric({ value: null }), null, 'null must not become zero');
assert.equal(normaliseHomeMetric({ value: '0' }), null, 'numeric strings must not be coerced');
assert.equal(normaliseHomeMetric({ value: -1 }), null, 'negative metrics must be rejected');
assert.equal(normaliseHomeMetric(metric(0)).value, 0, 'real numeric zero must survive');

const home = normaliseHomeResult(homeReady);
assert.equal(home.state, 'complete');
assert.equal(home.usable, true);
assert.equal(home.today.uniqueBrowsers.value, 0);
assert.equal(home.today.sessions.value, 7);
assert.equal(home.listeningTodayMs.value, 3_900_000);
assert.equal(home.lifetime.sessions.value, 120);
assert.equal(home.sessionsDaily.length, 2);
assert.equal(home.window.timezone, 'Asia/Kolkata');

const live = normaliseLiveResult(liveReady);
assert.equal(live.state, 'complete');
assert.equal(live.liveNow.value, 0);
assert.equal(live.expirySeconds, 120);
assert.equal(live.trendMinutes, 30);
assert.equal(live.breakdowns.surface.find((row) => row.label === 'player').metric.value, 7);
assert.equal(live.breakdowns.displayMode.find((row) => row.label === 'browser').metric.value, 6);
assert.equal(live.breakdowns.world.find((row) => row.label === 'courtyard').metric.value, 7);
assert.equal(live.trend[1].liveNow.value, 3);
assert.equal(live.trend[1].listeningNow.value, 2);
assert.equal(live.trend[1].browsingNow.value, 1);

const complete = composeHomeLiveResults(homeReady, liveReady);
assert.equal(complete.schemaVersion, 'pga-home-live-ui/v1');
assert.equal(complete.state, 'complete');
assert.equal(complete.home.today.uniqueBrowsers.value, 0);
assert.equal(complete.live.liveNow.value, 0);

const missingLive = composeHomeLiveResults(homeReady, { transport: 'unavailable', envelope: null });
assert.equal(missingLive.state, 'partial');
assert.equal(missingLive.home.today.sessions.value, 7);
assert.equal(missingLive.live.liveNow, null, 'missing Live must remain unavailable');

const missingHome = composeHomeLiveResults({ transport: 'error', envelope: null }, liveReady);
assert.equal(missingHome.state, 'partial');
assert.equal(missingHome.home.today, null);
assert.equal(missingHome.live.liveNow.value, 0);

assert.equal(composeHomeLiveResults(homeReady, { transport: 'auth-expired', envelope: null }).state, 'auth-expired');
assert.equal(composeHomeLiveResults({ ...homeReady, envelope: { ...homeReady.envelope, status: 'stale' } }, liveReady).state, 'stale');

const invalidHome = normaliseHomeResult({
  transport: 'ready',
  envelope: { status: 'complete', generatedAt, data: { today: { sessions: { value: -4, precision: 'exact', sampled: false } } } },
});
assert.equal(invalidHome.today.sessions, null);
assert.equal(invalidHome.usable, false);

const groupedLive = normaliseLiveResult({
  transport: 'ready',
  envelope: { status: 'partial', generatedAt, data: { liveNow: metric(3), listeningNow: metric(1), browsingNow: metric(2), breakdowns: { surface: [{ key: 'player', count: 3 }] }, trend: null } },
});
assert.equal(groupedLive.state, 'partial');
assert.equal(groupedLive.breakdowns.surface[0].metric.value, 3);
assert.equal(groupedLive.trend, null);
assert.deepEqual(composeHomeLiveResults(homeReady, liveReady), composeHomeLiveResults(homeReady, liveReady));
assert.equal(Object.isFrozen(complete), true);
assert.equal(Object.isFrozen(complete.home), true);
assert.equal(Object.isFrozen(complete.live), true);

const [clientSource, indexHtml, css] = await Promise.all([
  readFile(path.join(root, 'src/pga/app/home-live.js'), 'utf8'),
  readFile(path.join(root, 'src/pga/app/index.html'), 'utf8'),
  readFile(path.join(root, 'src/pga/app/home-live.css'), 'utf8'),
]);

assert.match(clientSource, /const token = \+\+generation;\s*controller\?\.abort\(\);\s*controller = null;\s*if \(!navigator\.onLine\)/s, 'refresh must invalidate and abort before the offline early return');
assert.match(clientSource, /if \(!navigator\.onLine\)[\s\S]*?return;\s*}\s*controller = new AbortController\(\)/, 'offline refresh must not allocate a new request controller');
assert.match(clientSource, /token !== generation \|\| signal\.aborted/, 'late responses must not render');
assert.match(clientSource, /Promise\.all\(\[wrap\('\/api\/home'\), wrap\('\/api\/live'\)\]\)/, 'Home must request protected sources independently');
assert.match(clientSource, /mountHomeLive\(\{ autoLoad: !fixtureAllowed \}\)/, 'static localhost shell fixtures must not make unavailable backend requests');
assert.match(clientSource, /if \(autoLoad && isActive\(\)\) load/, 'non-Home deep links must not eagerly request Home analytics');
assert.match(clientSource, /for \(const button of document\.querySelectorAll\('\[data-nav="home"\]'\)\) \{\s*button\.addEventListener\('click', loadWhenHomeActivates\);\s*}/s, 'Home must observe the existing in-app Home navigation control without changing the shared router');
assert.doesNotMatch(clientSource, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/, 'Home must avoid raw HTML injection');
assert.doesNotMatch(clientSource, /localStorage|sessionStorage|document\.cookie|eval\s*\(/, 'Home must not add storage, cookie or eval behaviour');

const createFakeNode = () => {
  const children = new Map();
  return {
    hidden: false,
    dataset: {},
    textContent: '',
    className: '',
    style: { setProperty() {} },
    setAttribute() {},
    removeAttribute(name) { if (name === 'hidden') this.hidden = false; },
    toggleAttribute(name, force) { if (name === 'hidden') this.hidden = Boolean(force); },
    closest() { return null; },
    replaceChildren() {},
    append() {},
    addEventListener() {},
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, createFakeNode());
      return children.get(selector);
    },
  };
};

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalLocation = globalThis.location;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  const nodes = new Map();
  const homeSection = createFakeNode();
  homeSection.hidden = false;
  nodes.set('[data-view="home"]', homeSection);
  const listeners = new Map();
  const onlineState = { onLine: true };
  globalThis.document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, createFakeNode());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return createFakeNode(); },
  };
  globalThis.window = { addEventListener(type, listener) { listeners.set(type, listener); } };
  globalThis.location = { hash: '#home', hostname: 'validator.local' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: onlineState });

  const pending = [];
  const fetchEnvelope = (requestPath, { signal }) => new Promise((resolve) => pending.push({ requestPath, signal, resolve }));
  const mounted = mountHomeLive({ fetchEnvelope, autoLoad: false });
  assert.ok(mounted, 'Home + Live test mount must initialise');

  const firstLoad = mounted.reload();
  await Promise.resolve();
  assert.equal(pending.length, 2, 'online refresh must start Home and Live requests');
  const firstSignal = pending[0].signal;
  assert.equal(firstSignal, pending[1].signal, 'one generation must share one abort signal');
  assert.equal(firstSignal.aborted, false);

  onlineState.onLine = false;
  listeners.get('offline')?.();
  await Promise.resolve();
  assert.equal(firstSignal.aborted, true, 'offline transition must abort the prior online generation');
  assert.equal(pending.length, 2, 'offline transition must not allocate a new request controller or fetch');
  assert.equal(nodes.get('#homeState').dataset.state, 'offline');
  assert.equal(nodes.get('#homeContent').hidden, true);

  pending[0].resolve(homeReady);
  pending[1].resolve(liveReady);
  await firstLoad;
  assert.equal(nodes.get('#homeState').dataset.state, 'offline', 'late pre-offline response must not overwrite Offline state');
  assert.equal(nodes.get('#homeContent').hidden, true, 'late pre-offline response must not reveal stale content');

  onlineState.onLine = true;
  const recoveryLoad = mounted.reload();
  await Promise.resolve();
  assert.equal(pending.length, 4, 'online recovery must start a fresh Home and Live generation');
  const recoverySignal = pending[2].signal;
  assert.notEqual(recoverySignal, firstSignal, 'online recovery must use a fresh controller');
  assert.equal(recoverySignal.aborted, false);
  pending[2].resolve(homeReady);
  pending[3].resolve(liveReady);
  await recoveryLoad;
  assert.equal(nodes.get('#homeState').dataset.state, 'complete', 'fresh online generation may render normally after recovery');
  assert.equal(nodes.get('#homeContent').hidden, false);
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
}

try {
  const nodes = new Map();
  const homeSection = createFakeNode();
  homeSection.hidden = true;
  nodes.set('[data-view="home"]', homeSection);
  const homeNavListeners = new Map();
  const homeNav = createFakeNode();
  homeNav.addEventListener = (type, listener) => { homeNavListeners.set(type, listener); };
  const onlineState = { onLine: true };

  globalThis.document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, createFakeNode());
      return nodes.get(selector);
    },
    querySelectorAll(selector) { return selector === '[data-nav="home"]' ? [homeNav] : []; },
    createElement() { return createFakeNode(); },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { hash: '#audience', hostname: 'validator.local' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: onlineState });

  const pending = [];
  const fetchEnvelope = (requestPath, { signal }) => new Promise((resolve) => pending.push({ requestPath, signal, resolve }));
  const mounted = mountHomeLive({ fetchEnvelope, autoLoad: true });
  assert.ok(mounted, 'hidden Home test mount must initialise');
  await Promise.resolve();
  assert.equal(pending.length, 0, 'Home mounted behind another PGA view must stay lazy');
  assert.equal(typeof homeNavListeners.get('click'), 'function', 'Home must register an in-app activation listener');

  homeSection.hidden = false;
  globalThis.location.hash = '#home';
  const activationLoad = homeNavListeners.get('click')();
  await Promise.resolve();
  assert.equal(pending.length, 2, 'in-app Home activation must start exactly one Home and Live request pair');
  pending[0].resolve(homeReady);
  pending[1].resolve(liveReady);
  await activationLoad;
  assert.equal(nodes.get('#homeState').dataset.state, 'complete', 'activated Home may render the fresh protected result');
  assert.equal(nodes.get('#homeContent').hidden, false);

  const requestCount = pending.length;
  const duplicateLoad = homeNavListeners.get('click')();
  await Promise.resolve();
  assert.equal(duplicateLoad, undefined, 'already-rendered Home activation must stay a no-op');
  assert.equal(pending.length, requestCount, 'returning to an already-rendered Home view must not refetch');
} finally {
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
}

assert.match(indexHtml, /Active sessions, not people/);
assert.match(indexHtml, /Anonymous browser IDs, not people/);
assert.equal((indexHtml.match(/home-live\.css/g) || []).length, 1);
assert.equal((indexHtml.match(/home-live\.js/g) || []).length, 1);
assert.ok(indexHtml.indexOf('./app.js') < indexHtml.indexOf('./home-live.js'));

assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(css, /@media \(min-width: 520px\)/);
assert.match(css, /@media \(min-width: 720px\)/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.doesNotMatch(css, /100vw/, 'Home styles must not use viewport width');
assert.doesNotMatch(css, /(?:^|\n)\s*width:\s*(?:[4-9]\d{2,}|\d{4,})px\b/m, 'Home styles must not introduce large fixed element widths');

console.log('✓ PGA Home + Live preserves real zero, missing-data truth and partial-source visibility');
console.log('✓ Current and richer Live breakdown/trend contracts normalise deterministically');
console.log('✓ Offline transition aborts and invalidates stale Home/Live requests before recovery');
console.log('✓ Hidden Home activates through in-app navigation without duplicate loaded fetches');
console.log('✓ Refresh cancellation, lazy active-view loading, fixture safety and no-raw-HTML guards pass');
