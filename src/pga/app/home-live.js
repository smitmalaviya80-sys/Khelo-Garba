import { fetchPgaEnvelope } from './analytics.js';

const VALID_ENVELOPE_STATES = new Set(['complete', 'partial', 'stale']);
const EMPTY_TRANSPORT = Object.freeze({ transport: 'unavailable', envelope: null });

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeText = (value, max = 160) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};
const finiteNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const safeTimestamp = (value) => {
  if (value == null || value === '') return null;
  const timestamp = typeof value === 'number' && Number.isFinite(value) ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return null;
  try { return new Date(timestamp).toISOString(); } catch { return null; }
};

export function normaliseHomeMetric(metric) {
  if (!isObject(metric) || !Object.prototype.hasOwnProperty.call(metric, 'value')) return null;
  const value = finiteNonNegative(metric.value);
  if (value == null) return null;
  return Object.freeze({ value, precision: safeText(metric.precision, 32) || 'unknown', sampled: metric.sampled === true });
}

function transportState(result) {
  const transport = safeText(result?.transport, 32) || 'unavailable';
  if (['auth-expired', 'error', 'unavailable'].includes(transport)) return transport;
  return 'ready';
}

function normaliseEnvelopeState(result) {
  const transport = transportState(result);
  if (transport !== 'ready') return transport;
  const state = safeText(result?.envelope?.status, 32)?.toLowerCase();
  return VALID_ENVELOPE_STATES.has(state) ? state : 'unavailable';
}

function normaliseSources(sources) {
  if (!Array.isArray(sources)) return Object.freeze([]);
  return Object.freeze(sources.flatMap((source) => {
    if (!isObject(source)) return [];
    const name = safeText(source.name, 80);
    const status = safeText(source.status, 32);
    return name && status ? [Object.freeze({ name, status, sampled: source.sampled === true })] : [];
  }));
}

function normaliseLifetime(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const key of ['sessions', 'confirmed_play_starts', 'surface_views', 'listening_ms']) {
    const metric = normaliseHomeMetric(value[key]);
    if (metric) result[key] = metric;
  }
  return Object.keys(result).length ? Object.freeze(result) : null;
}

function normaliseSeries(rows) {
  if (!Array.isArray(rows)) return null;
  return Object.freeze(rows.flatMap((row) => {
    if (!isObject(row)) return [];
    const value = finiteNonNegative(row.value);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(row.day || '')) ? String(row.day) : null;
    if (value == null || !day) return [];
    return [Object.freeze({
      day,
      value,
      precision: safeText(row.precision, 32) || 'unknown',
      sampled: row.sampled === true,
      dataThroughMs: finiteNonNegative(row.dataThroughMs),
    })];
  }));
}

export function normaliseHomeResult(result = EMPTY_TRANSPORT) {
  const envelope = isObject(result?.envelope) ? result.envelope : null;
  const data = isObject(envelope?.data) ? envelope.data : null;
  const todaySource = isObject(data?.today) ? data.today : null;
  const today = todaySource ? Object.freeze({
    uniqueBrowsers: normaliseHomeMetric(todaySource.uniqueBrowsers),
    sessions: normaliseHomeMetric(todaySource.sessions),
    confirmedPlayStarts: normaliseHomeMetric(todaySource.confirmedPlayStarts),
    surfaceViews: normaliseHomeMetric(todaySource.surfaceViews),
  }) : null;
  const listeningTodayMs = normaliseHomeMetric(data?.listeningTodayMs);
  const lifetime = normaliseLifetime(data?.lifetime);
  const sessionsDaily = normaliseSeries(data?.sessionsDaily);
  return Object.freeze({
    state: normaliseEnvelopeState(result),
    usable: Boolean(Object.values(today || {}).some(Boolean) || listeningTodayMs || lifetime || sessionsDaily?.length),
    generatedAt: safeTimestamp(envelope?.generatedAt),
    dataThrough: safeTimestamp(envelope?.dataThrough),
    window: isObject(envelope?.window) ? Object.freeze({
      from: safeTimestamp(envelope.window.from),
      to: safeTimestamp(envelope.window.to),
      timezone: safeText(envelope.window.timezone, 80),
    }) : null,
    sources: normaliseSources(envelope?.sources),
    today,
    listeningTodayMs,
    lifetime,
    sessionsDaily,
  });
}

const metricFromCount = (value, precision = 'unknown', sampled = false) => {
  const count = finiteNonNegative(value);
  return count == null ? null : Object.freeze({ value: count, precision, sampled });
};

function normaliseLiveRows(value) {
  if (!Array.isArray(value)) return null;
  return Object.freeze(value.flatMap((row) => {
    if (!isObject(row)) return [];
    const label = safeText(row.label ?? row.key ?? row.name, 100);
    const metric = normaliseHomeMetric(row.metric) || metricFromCount(row.count, 'exact', false);
    return label && metric ? [Object.freeze({ label, metric })] : [];
  }));
}

function aggregateFlatBreakdown(rows, key) {
  const totals = new Map();
  for (const row of rows) {
    if (!isObject(row)) continue;
    const label = safeText(row[key], 100);
    const metric = normaliseHomeMetric(row.sessions);
    if (!label || !metric) continue;
    const current = totals.get(label) || { value: 0, precision: 'exact', sampled: false };
    current.value += metric.value;
    if (metric.precision === 'estimated') current.precision = 'estimated';
    else if (current.precision !== 'estimated' && metric.precision !== 'exact') current.precision = metric.precision;
    current.sampled ||= metric.sampled;
    totals.set(label, current);
  }
  return Object.freeze([...totals.entries()]
    .map(([label, metric]) => Object.freeze({ label, metric: Object.freeze({ ...metric }) }))
    .sort((a, b) => b.metric.value - a.metric.value || a.label.localeCompare(b.label)));
}

function normaliseBreakdowns(value) {
  if (Array.isArray(value)) {
    return Object.freeze({
      surface: aggregateFlatBreakdown(value, 'surface'),
      world: aggregateFlatBreakdown(value, 'world'),
      displayMode: aggregateFlatBreakdown(value, 'displayMode'),
    });
  }
  if (!isObject(value)) return null;
  const result = {};
  for (const [key, rows] of Object.entries(value)) {
    const safeKey = safeText(key, 60);
    const safeRows = normaliseLiveRows(rows?.rows ?? rows);
    if (safeKey && safeRows) result[safeKey] = safeRows;
  }
  return Object.keys(result).length ? Object.freeze(result) : null;
}

function normaliseTrend(value) {
  const source = Array.isArray(value) ? value : Array.isArray(value?.points) ? value.points : null;
  if (!source) return null;
  return Object.freeze(source.flatMap((point) => {
    if (!isObject(point)) return [];
    const at = safeTimestamp(point.minute ?? point.at ?? point.time ?? point.timestamp);
    const liveNow = normaliseHomeMetric(point.activeSessions ?? point.liveNow) || metricFromCount(point.activeSessions ?? point.liveNow);
    const listeningNow = normaliseHomeMetric(point.listeningSessions ?? point.listeningNow) || metricFromCount(point.listeningSessions ?? point.listeningNow);
    const browsingNow = normaliseHomeMetric(point.browsingSessions ?? point.browsingNow) || metricFromCount(point.browsingSessions ?? point.browsingNow);
    return at && (liveNow || listeningNow || browsingNow) ? [Object.freeze({ at, liveNow, listeningNow, browsingNow })] : [];
  }));
}

export function normaliseLiveResult(result = EMPTY_TRANSPORT) {
  const envelope = isObject(result?.envelope) ? result.envelope : null;
  const data = isObject(envelope?.data) ? envelope.data : null;
  const liveNow = normaliseHomeMetric(data?.liveNow);
  const listeningNow = normaliseHomeMetric(data?.listeningNow);
  const browsingNow = normaliseHomeMetric(data?.browsingNow);
  return Object.freeze({
    state: normaliseEnvelopeState(result),
    usable: Boolean(liveNow || listeningNow || browsingNow),
    generatedAt: safeTimestamp(envelope?.generatedAt),
    dataThrough: safeTimestamp(envelope?.dataThrough),
    sources: normaliseSources(envelope?.sources),
    liveNow,
    listeningNow,
    browsingNow,
    expirySeconds: finiteNonNegative(data?.expirySeconds),
    trendMinutes: finiteNonNegative(data?.trendMinutes),
    breakdowns: normaliseBreakdowns(data?.breakdowns),
    trend: normaliseTrend(data?.trend ?? data?.recentTrend),
  });
}

function overallState(home, live) {
  if (home.state === 'auth-expired' || live.state === 'auth-expired') return 'auth-expired';
  if (home.state === 'stale' || live.state === 'stale') return home.usable || live.usable ? 'stale' : 'unavailable';
  if (home.usable && live.usable) return home.state === 'complete' && live.state === 'complete' ? 'complete' : 'partial';
  if (home.usable || live.usable) return 'partial';
  if (home.state === 'error' || live.state === 'error') return 'error';
  return 'unavailable';
}

export function composeHomeLiveResults(homeResult, liveResult) {
  const home = normaliseHomeResult(homeResult);
  const live = normaliseLiveResult(liveResult);
  return Object.freeze({ schemaVersion: 'pga-home-live-ui/v1', state: overallState(home, live), home, live });
}

const formatCount = (metric) => metric ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(metric.value) : '—';
function formatDuration(metric) {
  if (!metric) return '—';
  const minutes = Math.max(0, Math.round(metric.value / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}
function formatIstTimestamp(value) {
  if (!value) return 'Freshness unavailable';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Freshness unavailable';
  return `${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(timestamp)} IST`;
}
function statusCopy(state) {
  if (state === 'complete') return ['Current', 'Home and Live sources returned usable protected aggregates.'];
  if (state === 'partial') return ['Partial data', 'Some protected aggregates are unavailable. Available values stay visible and missing values stay blank.'];
  if (state === 'stale') return ['Stale data', 'The source marked this snapshot stale. Values remain timestamped rather than presented as current.'];
  if (state === 'auth-expired') return ['Access expired', 'Refresh access before PGA can show private analytics.'];
  if (state === 'error') return ['Data unavailable', 'The protected query failed. PGA did not replace the missing result with zero.'];
  return ['No data yet', 'Protected Home and Live aggregates are not available yet.'];
}

function setMetric(id, label, metric, formatter = formatCount) {
  const node = document.querySelector(`#${id}`);
  if (!node) return;
  const value = formatter(metric);
  node.textContent = value;
  node.setAttribute('aria-label', metric ? `${label} ${value}` : `${label} unavailable`);
  node.closest('article')?.toggleAttribute('data-unavailable', !metric);
}

function renderSeries(model) {
  const section = document.querySelector('#homeTrendSection');
  const list = document.querySelector('#homeTrend');
  const summary = document.querySelector('#homeTrendSummary');
  const rows = model.home.sessionsDaily;
  if (!section || !list || !summary || !rows?.length) { if (section) section.hidden = true; return; }
  section.hidden = false;
  list.replaceChildren();
  const recent = rows.slice(-7);
  const max = Math.max(...recent.map((row) => row.value), 1);
  for (const row of recent) {
    const item = document.createElement('li');
    const bar = document.createElement('span');
    bar.className = 'home-trend-bar';
    bar.style.setProperty('--home-trend-share', `${Math.max(3, (row.value / max) * 100)}%`);
    bar.setAttribute('aria-hidden', 'true');
    const date = document.createElement('span');
    date.textContent = row.day.slice(5);
    const value = document.createElement('strong');
    value.textContent = new Intl.NumberFormat('en-IN').format(row.value);
    item.append(bar, date, value);
    list.append(item);
  }
  const first = recent[0]?.value ?? 0;
  const last = recent.at(-1)?.value ?? 0;
  const direction = last > first ? 'increased' : last < first ? 'decreased' : 'was unchanged';
  summary.textContent = `Sessions ${direction} from ${new Intl.NumberFormat('en-IN').format(first)} to ${new Intl.NumberFormat('en-IN').format(last)} across the displayed ${recent.length} daily points.`;
}

function renderLiveTrend(model) {
  const section = document.querySelector('#homeLiveTrendSection');
  const summary = document.querySelector('#homeLiveTrendSummary');
  const rows = model.live.trend;
  if (!section || !summary || !rows?.length) { if (section) section.hidden = true; return; }
  section.hidden = false;
  const active = rows.map((row) => row.liveNow?.value).filter((value) => value != null);
  const listening = rows.map((row) => row.listeningNow?.value).filter((value) => value != null);
  const first = active[0] ?? null;
  const last = active.at(-1) ?? null;
  const activeRange = active.length ? `${Math.min(...active)}–${Math.max(...active)}` : 'unavailable';
  const listeningRange = listening.length ? `${Math.min(...listening)}–${Math.max(...listening)}` : 'unavailable';
  const windowText = model.live.trendMinutes != null ? `${model.live.trendMinutes}-minute` : `${rows.length}-point`;
  const movement = first == null || last == null ? 'Active-session movement is unavailable.' : first === last ? `Active sessions started and ended at ${last}.` : `Active sessions moved from ${first} to ${last}.`;
  summary.textContent = `${windowText} live window. ${movement} Active range ${activeRange}; listening range ${listeningRange}.`;
}

function renderBreakdownList(id, rows) {
  const target = document.querySelector(`#${id}`);
  if (!target) return false;
  target.replaceChildren();
  if (!rows?.length) return false;
  for (const row of rows) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = row.label;
    const value = document.createElement('strong');
    value.textContent = formatCount(row.metric);
    item.append(label, value);
    target.append(item);
  }
  return true;
}

function renderLiveDetails(model) {
  const section = document.querySelector('#homeLiveDetails');
  if (!section) return;
  const breakdowns = model.live.breakdowns || {};
  const hasSurface = renderBreakdownList('homeLiveSurfaces', breakdowns.surface || breakdowns.surfaces);
  const hasWorld = renderBreakdownList('homeLiveWorlds', breakdowns.world || breakdowns.worlds);
  const hasMode = renderBreakdownList('homeLiveModes', breakdowns.displayMode || breakdowns.display_mode || breakdowns.display);
  section.hidden = !(hasSurface || hasWorld || hasMode);
  document.querySelector('#homeLiveSurfacePanel')?.toggleAttribute('hidden', !hasSurface);
  document.querySelector('#homeLiveWorldPanel')?.toggleAttribute('hidden', !hasWorld);
  document.querySelector('#homeLiveModePanel')?.toggleAttribute('hidden', !hasMode);
}

function renderLifetime(model) {
  const section = document.querySelector('#homeLifetimeSection');
  const target = document.querySelector('#homeLifetime');
  const lifetime = model.home.lifetime;
  if (!section || !target || !lifetime) { if (section) section.hidden = true; return; }
  const rows = [
    ['Sessions', lifetime.sessions, formatCount],
    ['Confirmed play starts', lifetime.confirmed_play_starts, formatCount],
    ['Listening time', lifetime.listening_ms, formatDuration],
    ['Surface views', lifetime.surface_views, formatCount],
  ].filter(([, metric]) => metric);
  if (!rows.length) { section.hidden = true; return; }
  section.hidden = false;
  target.replaceChildren();
  for (const [labelText, metric, formatter] of rows) {
    const row = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = formatter(metric);
    row.append(label, value);
    target.append(row);
  }
}

function renderModel(model) {
  setMetric('homeLiveNow', 'Live now active sessions', model.live.liveNow);
  setMetric('homeListeningNow', 'Listening now sessions', model.live.listeningNow);
  setMetric('homeBrowsingNow', 'Browsing now sessions', model.live.browsingNow);
  setMetric('homeUniqueToday', 'Unique browsers today', model.home.today?.uniqueBrowsers);
  setMetric('homeSessionsToday', 'Sessions today', model.home.today?.sessions);
  setMetric('homeStartsToday', 'Confirmed play starts today', model.home.today?.confirmedPlayStarts);
  setMetric('homeListeningToday', 'Listening time today', model.home.listeningTodayMs, formatDuration);

  const freshest = [model.home.dataThrough, model.live.dataThrough].filter(Boolean).sort().at(-1) || null;
  const freshness = document.querySelector('#homeFreshness');
  if (freshness) freshness.textContent = freshest ? `Data through ${formatIstTimestamp(freshest)}` : 'Freshness unavailable';
  const liveMeta = document.querySelector('#homeLiveMeta');
  if (liveMeta) {
    const parts = [];
    if (model.live.expirySeconds != null) parts.push(`Sessions expire after ${model.live.expirySeconds} seconds without a fresh heartbeat.`);
    if (model.live.dataThrough) parts.push(`Live evidence through ${formatIstTimestamp(model.live.dataThrough)}.`);
    liveMeta.textContent = parts.join(' ') || 'Live freshness metadata is unavailable.';
  }
  const state = document.querySelector('#homeState');
  const [title, body] = statusCopy(model.state);
  if (state) {
    state.hidden = model.state === 'complete';
    state.dataset.state = model.state;
    state.querySelector('strong').textContent = title;
    state.querySelector('p').textContent = body;
  }
  document.querySelector('#homeContent')?.removeAttribute('hidden');
  renderSeries(model);
  renderLiveTrend(model);
  renderLiveDetails(model);
  renderLifetime(model);
}

function renderBlockingState(state, title, body) {
  const status = document.querySelector('#homeState');
  if (status) {
    status.hidden = false;
    status.dataset.state = state;
    status.querySelector('strong').textContent = title;
    status.querySelector('p').textContent = body;
  }
  const content = document.querySelector('#homeContent');
  if (content) content.hidden = true;
  const freshness = document.querySelector('#homeFreshness');
  if (freshness) freshness.textContent = state === 'loading' ? 'Refreshing protected aggregates' : 'No current protected snapshot';
}

export function mountHomeLive({ fetchEnvelope = fetchPgaEnvelope, autoLoad = true } = {}) {
  if (typeof document === 'undefined') return null;
  const section = document.querySelector('[data-view="home"]');
  if (!section) return null;

  let controller = null;
  let generation = 0;
  let hasRenderedSnapshot = false;
  const isActive = () => !section.hidden;

  async function load({ force = false } = {}) {
    if (!force && hasRenderedSnapshot) return;

    const token = ++generation;
    controller?.abort();
    controller = null;

    if (!navigator.onLine) {
      if (!hasRenderedSnapshot) renderBlockingState('offline', 'Offline', 'The PGA shell is available, but private Home and Live aggregates cannot refresh while this device is offline.');
      else {
        const state = document.querySelector('#homeState');
        if (state) {
          state.hidden = false;
          state.dataset.state = 'offline';
          state.querySelector('strong').textContent = 'Offline';
          state.querySelector('p').textContent = 'Showing the last loaded snapshot. Fresh protected aggregates cannot refresh while this device is offline.';
        }
      }
      return;
    }

    controller = new AbortController();
    const signal = controller.signal;
    if (!hasRenderedSnapshot) renderBlockingState('loading', 'Loading protected data', 'PGA is fetching Home and Live aggregates without showing placeholder zeros.');
    else {
      const freshness = document.querySelector('#homeFreshness');
      if (freshness) freshness.textContent = 'Refreshing protected aggregates';
    }

    const wrap = async (path) => {
      try { return await fetchEnvelope(path, { signal }); }
      catch (error) {
        if (error?.name === 'AbortError') throw error;
        return { transport: 'error', envelope: null };
      }
    };

    let results;
    try { results = await Promise.all([wrap('/api/home'), wrap('/api/live')]); }
    catch (error) {
      if (error?.name === 'AbortError') return;
      results = [EMPTY_TRANSPORT, EMPTY_TRANSPORT];
    }
    if (token !== generation || signal.aborted) return;

    const model = composeHomeLiveResults(results[0], results[1]);
    if (model.state === 'auth-expired') {
      hasRenderedSnapshot = false;
      renderBlockingState('auth-expired', 'Access expired', 'PGA cannot show private Home data until Cloudflare Access is restored.');
      return;
    }
    if (!model.home.usable && !model.live.usable) {
      hasRenderedSnapshot = false;
      const [title, body] = statusCopy(model.state);
      renderBlockingState(model.state, title, body);
      return;
    }
    hasRenderedSnapshot = true;
    renderModel(model);
  }

  const loadWhenHomeActivates = () => {
    if (isActive() && !hasRenderedSnapshot) return load();
    return undefined;
  };

  document.querySelector('#refreshButton')?.addEventListener('click', () => { if (isActive()) load({ force: true }); });
  for (const button of document.querySelectorAll('[data-nav="home"]')) {
    button.addEventListener('click', loadWhenHomeActivates);
  }
  window.addEventListener('online', () => { if (isActive()) load({ force: true }); });
  window.addEventListener('offline', () => { if (isActive()) load({ force: true }); });
  window.addEventListener('hashchange', () => { if (location.hash === '#home' && !hasRenderedSnapshot) load({ force: true }); });

  if (autoLoad && isActive()) load({ force: true });
  return Object.freeze({ reload: () => load({ force: true }) });
}

if (typeof document !== 'undefined') {
  const fixtureAllowed = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const controller = mountHomeLive({ autoLoad: !fixtureAllowed });
  if (fixtureAllowed && controller) window.PGA_HOME_LIVE_TEST = controller;
}
