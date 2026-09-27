import {
  PGA_RANGES,
  fetchPgaEnvelope,
  formatDuration,
  formatFreshness,
  formatMetric,
  formatPercent,
  metricValue,
  normaliseAudience,
  normaliseListening,
} from './analytics.js';

const VIEWS = ['home', 'audience', 'listening', 'health', 'more'];
const ANALYTICS_VIEWS = new Set(['audience', 'listening']);
const navButtons = [...document.querySelectorAll('[data-nav]')];
const views = [...document.querySelectorAll('[data-view]')];
const announcer = document.querySelector('#announcer');
const boundary = document.querySelector('#boundary');
const boundaryTitle = document.querySelector('#boundaryTitle');
const boundaryBody = document.querySelector('#boundaryBody');
const boundaryAction = document.querySelector('#boundaryAction');
const connectionLabel = document.querySelector('#connectionLabel');
const refreshButton = document.querySelector('#refreshButton');
const accessButton = document.querySelector('#accessButton');
const installButton = document.querySelector('#installButton');
const rangeButtons = [...document.querySelectorAll('[data-range-view][data-range]')];

let deferredInstallPrompt = null;
let activeBoundary = 'ready';
let activeView = 'home';
const selectedRanges = { audience: '30d', listening: '30d' };
const loadedRanges = { audience: null, listening: null };
const requestControllers = new Map();

function abortAnalyticsRequests() {
  for (const [view, controller] of requestControllers) {
    controller.abort();
    requestControllers.delete(view);
  }
}

function normaliseView(value) {
  return VIEWS.includes(value) ? value : 'home';
}

function setText(selector, value, ariaLabel = null) {
  const node = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!node) return;
  node.textContent = value;
  if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
  else node.removeAttribute('aria-label');
}

function selectView(next, { focus = true, updateHash = true } = {}) {
  const view = normaliseView(next);
  activeView = view;
  for (const section of views) {
    const selected = section.dataset.view === view;
    section.hidden = !selected;
    section.classList.toggle('is-active', selected);
  }
  for (const button of navButtons) {
    if (button.dataset.nav === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (updateHash && location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  const heading = document.querySelector(`[data-view="${view}"] h1`);
  if (focus && heading) heading.focus({ preventScroll: true });
  announcer.textContent = `${heading?.textContent || view} view`;
  if (ANALYTICS_VIEWS.has(view) && loadedRanges[view] !== selectedRanges[view]) loadAnalyticsView(view);
}

const boundaries = {
  ready: null,
  loading: {
    title: 'Loading protected data',
    body: 'PGA is waiting for the latest aggregate response.',
    action: null,
  },
  offline: {
    title: 'Offline',
    body: 'The PGA shell is available, but private analytics cannot refresh while this device is offline.',
    action: 'Try again',
  },
  stale: {
    title: 'Data is stale',
    body: 'The last trustworthy snapshot is older than its freshness target. Its original timestamp must remain visible.',
    action: 'Refresh',
  },
  error: {
    title: 'Data could not be loaded',
    body: 'The protected query failed. PGA will not replace the missing result with zero.',
    action: 'Retry',
  },
  'auth-expired': {
    title: 'Access expired',
    body: 'Private data is unavailable until access is restored.',
    action: 'Refresh access',
  },
};

function setBoundary(kind = 'ready') {
  const safeKind = Object.hasOwn(boundaries, kind) ? kind : 'error';
  activeBoundary = safeKind;
  const config = boundaries[safeKind];
  if (!config) {
    boundary.hidden = true;
    connectionLabel.textContent = navigator.onLine ? 'Protected aggregates' : 'Offline';
    return;
  }
  boundary.hidden = false;
  boundary.dataset.state = safeKind;
  boundaryTitle.textContent = config.title;
  boundaryBody.textContent = config.body;
  boundaryAction.hidden = !config.action;
  boundaryAction.textContent = config.action || '';
  connectionLabel.textContent = config.title;
  announcer.textContent = config.title;
}

function viewState(view) {
  return document.querySelector(`#${view}State`);
}

function contentNode(view) {
  return document.querySelector(`#${view}Content`);
}

function setViewState(view, state, title, body) {
  const node = viewState(view);
  if (!node) return;
  node.hidden = false;
  node.dataset.state = state;
  const strong = node.querySelector('strong');
  const paragraph = node.querySelector('p');
  if (strong) strong.textContent = title;
  if (paragraph) paragraph.textContent = body;
  const content = contentNode(view);
  if (content) content.hidden = true;
}

function showViewContent(view) {
  const state = viewState(view);
  if (state) state.hidden = true;
  const content = contentNode(view);
  if (content) content.hidden = false;
}

function syncRangeButtons(view) {
  for (const button of rangeButtons) {
    if (button.dataset.rangeView !== view) continue;
    button.setAttribute('aria-pressed', button.dataset.range === selectedRanges[view] ? 'true' : 'false');
  }
}

function precisionSuffix(metric) {
  if (metric?.precision === 'estimated') return ' · estimated';
  return '';
}

function rowTotal(rows = []) {
  return rows.reduce((sum, row) => sum + (metricValue(row.metric) || 0), 0);
}

function renderRankList(target, rows = [], emptyText = 'No measured activity in this range.') {
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  const total = rowTotal(rows);
  for (const row of rows) {
    const value = metricValue(row.metric) || 0;
    const share = total > 0 ? value / total : 0;
    const item = document.createElement('div');
    item.className = 'rank-row';

    const label = document.createElement('span');
    label.className = 'rank-label';
    label.textContent = String(row.label || 'Unknown');

    const count = document.createElement('strong');
    count.className = 'rank-value';
    count.textContent = `${formatMetric(row.metric)}${precisionSuffix(row.metric)}`;

    const meta = document.createElement('div');
    meta.className = 'rank-meta';
    const track = document.createElement('span');
    track.className = 'rank-track';
    track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'rank-fill';
    fill.style.width = `${Math.max(0, Math.min(100, share * 100))}%`;
    track.append(fill);
    const percent = document.createElement('span');
    percent.className = 'rank-percent';
    percent.textContent = `${formatPercent(share)} of ${new Intl.NumberFormat('en-IN').format(total)} sessions/events`;
    meta.append(track, percent);
    item.append(label, count, meta);
    target.append(item);
  }
}

function renderAudience(model) {
  const summary = model.summary || {};
  setText('#audienceUnique', formatMetric(summary.uniqueBrowsers), `Unique browsers ${formatMetric(summary.uniqueBrowsers)}`);
  setText('#audienceSessions', formatMetric(summary.sessions), `Sessions ${formatMetric(summary.sessions)}`);
  setText('#audienceNew', formatMetric(summary.newBrowserIds), `New browser IDs ${formatMetric(summary.newBrowserIds)}`);
  setText('#audienceReturning', formatMetric(summary.returningBrowserIds), `Returning browsers ${formatMetric(summary.returningBrowserIds)}`);
  setText('#audienceFreshness', formatFreshness(model.dataThrough));

  renderRankList(document.querySelector('#audienceDevices'), model.distributions.device);
  renderRankList(document.querySelector('#audienceDisplayMode'), model.distributions.displayMode);
  renderRankList(document.querySelector('#audienceOs'), model.distributions.os);
  renderRankList(document.querySelector('#audienceBrowsers'), model.distributions.browser);
  renderRankList(document.querySelector('#audienceAcquisition'), model.distributions.acquisition);
  renderRankList(document.querySelector('#audienceCountries'), model.distributions.country);
  renderRankList(document.querySelector('#audienceRegions'), model.distributions.region, 'No region clears the privacy threshold in this range.');

  const allValues = [summary.uniqueBrowsers, summary.sessions, summary.newBrowserIds, summary.returningBrowserIds].map(metricValue);
  if (allValues.every((value) => value === 0)) {
    setViewState('audience', 'empty', 'No data yet', 'The protected query succeeded, but no measured audience activity exists in this range.');
  } else {
    showViewContent('audience');
  }
}

function appendPlainMetric(target, label, metric) {
  const row = document.createElement('div');
  row.className = 'plain-metric-row';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('strong');
  value.textContent = `${formatMetric(metric)}${precisionSuffix(metric)}`;
  row.append(name, value);
  target.append(row);
}

function renderSearchFunnel(target, model) {
  target.replaceChildren();
  const rows = [
    ['Searches', model.search.searches, null],
    ['Result selected', model.search.selectedSearches, model.search.selectionRate],
    ['Confirmed play after search', model.search.searchesWithConfirmedPlay, model.search.playRate],
    ['Zero-result searches', model.search.zeroResultSearches, model.search.zeroResultRate],
  ];
  for (const [label, metric, rate] of rows) {
    const row = document.createElement('div');
    row.className = 'funnel-row';
    const title = document.createElement('strong');
    title.textContent = label;
    const value = document.createElement('span');
    value.textContent = formatMetric(metric);
    const detail = document.createElement('small');
    detail.textContent = rate
      ? `${formatPercent(rate.value)} · ${new Intl.NumberFormat('en-IN').format(rate.numerator)} of ${new Intl.NumberFormat('en-IN').format(rate.denominator)} searches`
      : 'Denominator for conversion metrics';
    row.append(title, value, detail);
    target.append(row);
  }
}

function renderContentRank(target, rows = []) {
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No confirmed content starts in this range.';
    target.append(empty);
    return;
  }
  for (const row of rows.slice(0, 20)) {
    const item = document.createElement('div');
    item.className = 'content-rank-row';
    const label = document.createElement('strong');
    label.textContent = row.label || row.contentId;
    if (row.identityStatus !== 'resolved') label.classList.add('identity-unresolved');
    const count = document.createElement('span');
    count.textContent = formatMetric(row.metric);
    const meta = document.createElement('small');
    const identity = row.identityStatus === 'resolved'
      ? [row.artist, row.releaseTitle].filter(Boolean).join(' · ')
      : `Canonical ID ${row.contentId} · catalogue label unresolved`;
    meta.textContent = `${identity || row.contentType} · measured confirmed starts${precisionSuffix(row.metric)}`;
    item.append(label, count, meta);
    target.append(item);
  }
}

function renderDemand(target, rows = []) {
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No repeated zero-result term meets the privacy threshold.';
    target.append(empty);
    return;
  }
  for (const row of rows.slice(0, 20)) {
    const item = document.createElement('div');
    item.className = 'demand-row';
    const term = document.createElement('strong');
    term.textContent = row.term || 'Unknown term';
    const zero = document.createElement('span');
    zero.textContent = `${formatMetric(row.zeroResults)} zero-result`;
    const detail = document.createElement('small');
    detail.textContent = `${formatMetric(row.searches)} searches in selected range`;
    item.append(term, zero, detail);
    target.append(item);
  }
}

function renderListening(model) {
  setText('#listeningStarts', formatMetric(model.metrics.confirmedStarts));
  setText('#listeningIntents', formatMetric(model.metrics.playIntents));
  setText('#listeningTime', formatDuration(model.metrics.listeningMs));
  setText('#listeningFreshness', formatFreshness(model.dataThrough));

  if (model.playSuccess) {
    setText('#listeningSuccess', formatPercent(model.playSuccess.value));
    setText('#listeningSuccessDenominator', `${new Intl.NumberFormat('en-IN').format(model.playSuccess.numerator)} confirmed starts / ${new Intl.NumberFormat('en-IN').format(model.playSuccess.denominator)} play intents`);
  } else {
    setText('#listeningSuccess', '—', 'Play success unavailable');
    setText('#listeningSuccessDenominator', 'Needs at least one measured play intent');
  }

  const actions = document.querySelector('#listeningActions');
  actions.replaceChildren();
  appendPlainMetric(actions, 'Pauses', model.metrics.pauses);
  appendPlainMetric(actions, 'Next', model.metrics.next);
  appendPlainMetric(actions, 'Previous', model.metrics.previous);
  appendPlainMetric(actions, 'Skip', model.metrics.skips);

  renderRankList(document.querySelector('#listeningSurfaces'), model.surfaces, 'No confirmed start has a recorded product surface.');
  renderSearchFunnel(document.querySelector('#listeningSearch'), model);
  renderContentRank(document.querySelector('#listeningTopContent'), model.topSongs);
  renderRankList(document.querySelector('#listeningArtists'), model.topArtists, 'No resolved artist identity is available in this range.');
  renderRankList(document.querySelector('#listeningReleases'), model.topReleases, 'No resolved release identity is available in this range.');
  renderContentRank(document.querySelector('#listeningNonstopSets'), model.nonstopSets);
  renderRankList(document.querySelector('#listeningWorlds'), model.worlds, 'No presentation-world listening is recorded in this range.');
  renderRankList(document.querySelector('#listeningErrors'), model.errors, 'No playback unavailable/error event is recorded in this range.');
  renderDemand(document.querySelector('#listeningDemand'), model.unmetDemand);

  const starts = metricValue(model.metrics.confirmedStarts);
  const intents = metricValue(model.metrics.playIntents);
  const listeningMs = metricValue(model.metrics.listeningMs);
  if ([starts, intents, listeningMs].every((value) => value === 0)) {
    setViewState('listening', 'empty', 'No data yet', 'The protected query succeeded, but no measured listening activity exists in this range.');
  } else {
    showViewContent('listening');
  }
}

async function loadAnalyticsView(view, { force = false } = {}) {
  if (!ANALYTICS_VIEWS.has(view)) return;
  if (!navigator.onLine) {
    abortAnalyticsRequests();
    setBoundary('offline');
    setViewState(view, 'offline', 'Offline', 'Private aggregates cannot refresh while this device is offline.');
    return;
  }
  const range = selectedRanges[view];
  if (!force && loadedRanges[view] === range) return;

  requestControllers.get(view)?.abort();
  const controller = new AbortController();
  requestControllers.set(view, controller);
  setViewState(view, 'loading', 'Loading protected data', `Fetching ${range} aggregate data without showing placeholder zeros.`);
  if (activeView === view) setBoundary('loading');

  const endpoint = view === 'audience' ? '/api/audience' : '/api/listening';
  let result;
  try {
    result = await fetchPgaEnvelope(endpoint, { range, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') return;
    result = { transport: 'error', envelope: null };
  }
  if (requestControllers.get(view) !== controller) return;
  requestControllers.delete(view);

  if (result.transport === 'auth-expired') {
    setBoundary('auth-expired');
    setViewState(view, 'auth-expired', 'Access expired', 'PGA cannot show private analytics until Cloudflare Access is restored.');
    return;
  }
  if (result.transport === 'error' || result.transport === 'unavailable') {
    setBoundary('error');
    setViewState(view, 'error', 'Analytics unavailable', 'The protected aggregate query did not return trustworthy data. Missing results are not rendered as zero.');
    return;
  }

  loadedRanges[view] = range;
  if (activeView === view) setBoundary('ready');
  if (view === 'audience') renderAudience(normaliseAudience(result.envelope));
  else renderListening(normaliseListening(result.envelope));
}

function refreshProtectedState() {
  if (!navigator.onLine) {
    abortAnalyticsRequests();
    setBoundary('offline');
    return;
  }
  if (ANALYTICS_VIEWS.has(activeView)) {
    loadAnalyticsView(activeView, { force: true });
    return;
  }
  setBoundary('loading');
  window.setTimeout(() => setBoundary('ready'), 180);
}

function syncNetworkState() {
  if (!navigator.onLine) {
    abortAnalyticsRequests();
    setBoundary('offline');
    if (ANALYTICS_VIEWS.has(activeView)) setViewState(activeView, 'offline', 'Offline', 'Private aggregates cannot refresh while this device is offline.');
  } else if (activeBoundary === 'offline') {
    setBoundary('ready');
    if (ANALYTICS_VIEWS.has(activeView)) loadAnalyticsView(activeView, { force: true });
  }
}

for (const button of navButtons) {
  button.addEventListener('click', () => selectView(button.dataset.nav));
}
for (const button of rangeButtons) {
  button.addEventListener('click', () => {
    const view = button.dataset.rangeView;
    const range = button.dataset.range;
    if (!ANALYTICS_VIEWS.has(view) || !PGA_RANGES.includes(range)) return;
    selectedRanges[view] = range;
    syncRangeButtons(view);
    if (activeView === view) loadAnalyticsView(view, { force: true });
  });
}

window.addEventListener('hashchange', () => selectView(location.hash.slice(1), { updateHash: false }));
window.addEventListener('online', syncNetworkState);
window.addEventListener('offline', syncNetworkState);
refreshButton.addEventListener('click', refreshProtectedState);
accessButton.addEventListener('click', () => location.reload());
boundaryAction.addEventListener('click', () => {
  if (activeBoundary === 'auth-expired') location.reload();
  else refreshProtectedState();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  announcer.textContent = 'PGA installed';
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

const fixtureAllowed = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (fixtureAllowed) {
  window.PGA_TEST = Object.freeze({
    selectView: (view) => selectView(view),
    setBoundary: (kind) => setBoundary(kind),
    setRange: (view, range) => {
      if (!ANALYTICS_VIEWS.has(view) || !PGA_RANGES.includes(range)) return;
      selectedRanges[view] = range;
      syncRangeButtons(view);
    },
    renderAudienceEnvelope: (envelope) => renderAudience(normaliseAudience(envelope)),
    renderListeningEnvelope: (envelope) => renderListening(normaliseListening(envelope)),
    loadView: (view) => loadAnalyticsView(view, { force: true }),
  });
}

syncRangeButtons('audience');
syncRangeButtons('listening');
selectView(location.hash.slice(1), { focus: false, updateHash: false });
syncNetworkState();
