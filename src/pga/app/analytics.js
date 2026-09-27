export const PGA_RANGES = Object.freeze(['7d', '30d', '90d']);
const PWA_DISPLAY_MODES = new Set(['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay']);

export function metricValue(metric) {
  const value = metric?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatMetric(metric) {
  const value = metricValue(metric);
  if (value === null) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

export function formatDuration(metric) {
  const ms = metricValue(metric);
  if (ms === null) return '—';
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function ratio(numerator, denominator) {
  const n = metricValue(numerator);
  const d = metricValue(denominator);
  if (n === null || d === null || d <= 0) return null;
  return { value: n / d, numerator: n, denominator: d };
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

export function formatFreshness(dataThrough) {
  if (!dataThrough) return 'Freshness unavailable';
  const timestamp = Date.parse(dataThrough);
  if (!Number.isFinite(timestamp)) return 'Freshness unavailable';
  return `Data through ${new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(timestamp)} IST`;
}

function metricFromNumber(value, source = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return {
    value,
    precision: source.precision || 'unknown',
    sampled: source.sampled ?? 'unknown',
  };
}

function addMetric(target, metric) {
  const value = metricValue(metric);
  if (value === null) return false;
  target.value += value;
  if (metric?.precision === 'estimated') target.precision = 'estimated';
  if (metric?.sampled === true) target.sampled = true;
  return true;
}

export function aggregateBreakdowns(rows = [], selector) {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    const key = selector(row);
    if (!key) continue;
    const current = totals.get(key) || { value: 0, precision: 'exact', sampled: false };
    if (!addMetric(current, row.sessions)) {
      invalidKeys.add(key);
      totals.delete(key);
      continue;
    }
    if (!invalidKeys.has(key)) totals.set(key, current);
  }
  return [...totals.entries()]
    .map(([label, metric]) => ({ label, metric }))
    .sort((a, b) => b.metric.value - a.metric.value || a.label.localeCompare(b.label));
}

export function parseClient(value = '') {
  const [device = 'unknown', os = 'unknown', browser = 'unknown'] = String(value).split('|');
  return { device, os, browser };
}

function acquisitionLabel(value = '', referrerHost = '') {
  const [source = '', medium = '', campaign = ''] = String(value).split('|');
  if (source) return medium ? `${source} · ${medium}` : source;
  if (referrerHost) return referrerHost;
  if (campaign) return campaign;
  return 'Direct';
}

function displayModeLabel(value = '') {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (PWA_DISPLAY_MODES.has(mode)) return 'PWA';
  if (mode === 'browser') return 'Browser';
  return 'Unknown';
}

export function normaliseAudience(envelope) {
  if (!envelope || envelope.status === 'unavailable' || !envelope.data) {
    return { state: 'unavailable', range: null, summary: null, distributions: {} };
  }
  const rows = Array.isArray(envelope.data.breakdowns) ? envelope.data.breakdowns : [];
  return {
    state: envelope.status || 'complete',
    range: envelope.data.range || null,
    generatedAt: envelope.generatedAt || null,
    dataThrough: envelope.dataThrough || null,
    summary: envelope.data.summary || null,
    distributions: {
      device: aggregateBreakdowns(rows, (row) => parseClient(row.client).device),
      os: aggregateBreakdowns(rows, (row) => parseClient(row.client).os),
      browser: aggregateBreakdowns(rows, (row) => parseClient(row.client).browser),
      displayMode: aggregateBreakdowns(rows, (row) => displayModeLabel(row.displayMode)),
      acquisition: aggregateBreakdowns(rows, (row) => acquisitionLabel(row.acquisition, row.referrerHost)),
      country: aggregateBreakdowns(rows, (row) => row.country && row.country !== 'ZZ' ? row.country : 'Unknown'),
      region: aggregateBreakdowns(rows, (row) => row.region || null),
    },
  };
}

function eventTotals(rows = []) {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    const key = row.eventName || 'unknown';
    const current = totals.get(key) || { value: 0, precision: 'exact', sampled: false };
    if (!addMetric(current, row.events)) {
      invalidKeys.add(key);
      totals.delete(key);
      continue;
    }
    if (!invalidKeys.has(key)) totals.set(key, current);
  }
  return { totals, invalidKeys };
}

function topContent(rows = []) {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    if (row.eventName !== 'playback_started' || !row.contentId) continue;
    const canonicalId = row.canonicalId || row.contentId;
    const type = row.contentType || 'content';
    const key = `${type}:${canonicalId}`;
    const current = totals.get(key) || {
      key,
      contentType: type,
      contentId: canonicalId,
      label: row.contentLabel || null,
      artist: row.artist || null,
      releaseTitle: row.releaseTitle || null,
      identityStatus: row.identityStatus || 'unresolved',
      metric: { value: 0, precision: 'exact', sampled: false },
    };
    if (!current.label && row.contentLabel) current.label = row.contentLabel;
    if (!current.artist && row.artist) current.artist = row.artist;
    if (!current.releaseTitle && row.releaseTitle) current.releaseTitle = row.releaseTitle;
    if (row.identityStatus === 'resolved') current.identityStatus = 'resolved';
    if (!addMetric(current.metric, row.events)) {
      invalidKeys.add(key);
      totals.delete(key);
      continue;
    }
    if (!invalidKeys.has(key)) totals.set(key, current);
  }
  return [...totals.values()]
    .sort((a, b) => b.metric.value - a.metric.value || a.contentId.localeCompare(b.contentId));
}

function dimensionTotals(rows = [], keySelector, eventName = 'playback_started') {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    if (row.eventName !== eventName) continue;
    const key = keySelector(row);
    if (!key) continue;
    const current = totals.get(key) || { value: 0, precision: 'exact', sampled: false };
    if (!addMetric(current, row.events)) {
      invalidKeys.add(key);
      totals.delete(key);
      continue;
    }
    if (!invalidKeys.has(key)) totals.set(key, current);
  }
  return [...totals.entries()]
    .map(([label, metric]) => ({ label, metric }))
    .sort((a, b) => b.metric.value - a.metric.value || a.label.localeCompare(b.label));
}

function playbackDimensionTotals(rows = [], selector) {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    if (row.eventName !== 'playback_started') continue;
    const label = selector(row);
    if (!label) continue;
    const current = totals.get(label) || { value: 0, precision: 'exact', sampled: false };
    if (!addMetric(current, row.events)) {
      invalidKeys.add(label);
      totals.delete(label);
      continue;
    }
    if (!invalidKeys.has(label)) totals.set(label, current);
  }
  return [...totals.entries()]
    .map(([label, metric]) => ({ label, metric }))
    .sort((a, b) => b.metric.value - a.metric.value || a.label.localeCompare(b.label));
}

function errorTotals(rows = []) {
  const totals = new Map();
  const invalidKeys = new Set();
  for (const row of rows) {
    if (!['playback_error', 'playback_unavailable'].includes(row.eventName)) continue;
    const label = row.errorCode || (row.eventName === 'playback_unavailable' ? 'unavailable' : 'unknown');
    const current = totals.get(label) || { value: 0, precision: 'exact', sampled: false };
    if (!addMetric(current, row.events)) {
      invalidKeys.add(label);
      totals.delete(label);
      continue;
    }
    if (!invalidKeys.has(label)) totals.set(label, current);
  }
  return [...totals.entries()].map(([label, metric]) => ({ label, metric })).sort((a, b) => b.metric.value - a.metric.value);
}

export function normaliseListening(envelope) {
  if (!envelope || envelope.status === 'unavailable' || !envelope.data) {
    return { state: 'unavailable', range: null, metrics: {}, topContent: [], worlds: [], surfaces: [], errors: [], unmetDemand: [] };
  }
  const rows = Array.isArray(envelope.data.rows) ? envelope.data.rows : [];
  const { totals, invalidKeys } = eventTotals(rows);
  const metricOrZero = (eventName) => invalidKeys.has(eventName) ? null : (totals.get(eventName) || metricFromNumber(0));
  const playIntents = metricOrZero('play_intent');
  const confirmedStarts = metricOrZero('playback_started');
  const search = envelope.data.search || {};
  const content = topContent(rows);
  return {
    state: envelope.status || 'complete',
    range: envelope.data.range || null,
    generatedAt: envelope.generatedAt || null,
    dataThrough: envelope.dataThrough || null,
    metrics: {
      playIntents,
      confirmedStarts,
      listeningMs: envelope.data.listeningMs || null,
      pauses: metricOrZero('playback_paused'),
      next: metricOrZero('next_requested'),
      previous: metricOrZero('previous_requested'),
      skips: metricOrZero('skip_requested'),
    },
    playSuccess: ratio(confirmedStarts, playIntents),
    search: {
      searches: search.searches || null,
      selectedSearches: search.selectedSearches || null,
      searchesWithConfirmedPlay: search.searchesWithConfirmedPlay || null,
      zeroResultSearches: search.zeroResultSearches || null,
      selectionRate: ratio(search.selectedSearches, search.searches),
      playRate: ratio(search.searchesWithConfirmedPlay, search.searches),
      zeroResultRate: ratio(search.zeroResultSearches, search.searches),
    },
    topContent: content,
    topSongs: content.filter((row) => row.contentType === 'song' || row.contentType === 'chapter'),
    topArtists: playbackDimensionTotals(rows, (row) => row.artist),
    topReleases: playbackDimensionTotals(rows, (row) => row.contentType === 'release' ? row.contentLabel : row.releaseTitle),
    nonstopSets: content.filter((row) => row.contentType === 'nonstop_set'),
    worlds: dimensionTotals(rows, (row) => row.world),
    surfaces: dimensionTotals(rows, (row) => row.surface),
    errors: errorTotals(rows),
    unmetDemand: Array.isArray(search.unmetDemand) ? search.unmetDemand : [],
  };
}

export async function fetchPgaEnvelope(path, { range, signal, fetchImpl = fetch } = {}) {
  const origin = globalThis.location?.origin || 'https://pga.playgarba.com';
  const url = new URL(path, origin);
  if (range && PGA_RANGES.includes(range)) url.searchParams.set('range', range);
  const response = await fetchImpl(url, { credentials: 'same-origin', cache: 'no-store', signal, headers: { accept: 'application/json' } });
  if (response.status === 401 || response.status === 403) return { transport: 'auth-expired', envelope: null };
  let envelope = null;
  try { envelope = await response.json(); } catch { /* non-JSON is a transport failure */ }
  if (!response.ok || !envelope) return { transport: 'error', envelope };
  return { transport: envelope.status === 'unavailable' ? 'unavailable' : 'ready', envelope };
}
