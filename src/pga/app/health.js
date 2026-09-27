import { fetchPgaEnvelope } from './analytics.js';

const PRESENTATION_SCHEMA = 'pga-health-presentation/v1';
const SNAPSHOT_SCHEMA = 'pga-health-snapshot/v1';
const VALID_STATUSES = new Set(['healthy', 'degraded', 'stale', 'unknown', 'failed']);
const STATUS_PRIORITY = Object.freeze({ failed: 5, degraded: 4, stale: 3, unknown: 2, healthy: 1 });
const CANONICAL_ORDER = Object.freeze(['production', 'playback', 'deployment', 'ci', 'catalogue', 'telemetry', 'rollups', 'pwa']);
const SAFE_SOURCE_HOSTS = Object.freeze(['github.com', 'pga.playgarba.com', 'playgarba.com', 'www.playgarba.com']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value, max = 180) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function safeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return VALID_STATUSES.has(status) ? status : 'unknown';
}

function safeTimestamp(value) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  try { return new Date(parsed).toISOString(); } catch { return null; }
}

function safeSourceUrl(value) {
  const text = safeText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !SAFE_SOURCE_HOSTS.includes(url.hostname.toLowerCase())) return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function safeSource(value) {
  if (!isObject(value)) return Object.freeze({ kind: null, id: null, url: null });
  return Object.freeze({
    kind: safeText(value.kind, 80),
    id: safeText(value.id, 120),
    url: safeSourceUrl(value.url),
  });
}

function safeFreshness(value) {
  if (!isObject(value)) return Object.freeze({ checkedAt: null, dataThroughAt: null, observedAt: null, text: 'Freshness unavailable' });
  return Object.freeze({
    checkedAt: safeTimestamp(value.checkedAt),
    dataThroughAt: safeTimestamp(value.dataThroughAt),
    observedAt: safeTimestamp(value.observedAt),
    text: safeText(value.text, 140) || 'Freshness unavailable',
  });
}

function safeReasons(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = [];
  for (const item of value) {
    const text = safeText(item, 180);
    if (text && !unique.includes(text)) unique.push(text);
    if (unique.length === 4) break;
  }
  return Object.freeze(unique);
}

function normaliseSubsystem(row) {
  if (!isObject(row)) return null;
  const name = safeText(row.name ?? row.subsystem, 80);
  if (!name) return null;
  const status = safeStatus(row.status);
  return Object.freeze({
    name,
    label: safeText(row.label, 80) || name,
    status,
    statusLabel: safeText(row.statusLabel, 40) || status[0].toUpperCase() + status.slice(1),
    criticality: safeText(row.criticality, 40) || 'supporting',
    summary: safeText(row.summary, 180) || 'Current evidence is unavailable.',
    reasons: safeReasons(row.reasons),
    action: safeText(row.action, 180),
    source: safeSource(row.source),
    freshness: safeFreshness(row.freshness),
  });
}

function orderSubsystems(rows) {
  const index = new Map(CANONICAL_ORDER.map((name, position) => [name, position]));
  return Object.freeze([...rows].sort((left, right) => {
    const statusDifference = (STATUS_PRIORITY[right.status] || 0) - (STATUS_PRIORITY[left.status] || 0);
    if (statusDifference) return statusDifference;
    return (index.get(left.name) ?? 99) - (index.get(right.name) ?? 99);
  }));
}

function normaliseCanonicalPresentation(value) {
  if (!isObject(value) || value.schemaVersion !== PRESENTATION_SCHEMA) return null;
  const subsystems = Array.isArray(value.subsystems)
    ? value.subsystems.map(normaliseSubsystem).filter(Boolean)
    : [];
  const problems = Array.isArray(value.problems)
    ? value.problems.map(normaliseSubsystem).filter(Boolean)
    : subsystems.filter((row) => row.status !== 'healthy');
  const status = safeStatus(value.status);
  const complete = value.complete === true && CANONICAL_ORDER.every((name) => subsystems.some((row) => row.name === name));
  const truthfulStatus = complete ? status : 'unknown';
  return Object.freeze({
    schemaVersion: PRESENTATION_SCHEMA,
    mode: 'canonical',
    complete,
    status: truthfulStatus,
    statusLabel: safeText(value.statusLabel, 80) || (truthfulStatus === 'healthy' ? 'Healthy' : truthfulStatus === 'failed' ? 'Failed' : truthfulStatus === 'degraded' ? 'Attention needed' : truthfulStatus === 'stale' ? 'Stale' : 'Unknown'),
    summary: complete
      ? safeText(value.summary, 220) || 'Canonical health evidence is available.'
      : 'Health evidence is incomplete, so current system health cannot be confirmed.',
    generatedAt: safeTimestamp(value.generatedAt),
    evaluatedAt: safeTimestamp(value.evaluatedAt),
    accessibilitySummary: safeText(value.accessibilitySummary, 500),
    subsystems: orderSubsystems(subsystems),
    problems: orderSubsystems(problems),
  });
}

function rollupStateFromEnvelope(envelope) {
  const rows = Array.isArray(envelope?.data?.rollups) ? envelope.data.rollups : [];
  const latest = isObject(rows[0]) ? rows[0] : null;
  const latestStatus = String(latest?.status || '').trim().toLowerCase();
  const rollupStatus = latestStatus === 'complete' ? 'healthy' : latest ? 'degraded' : 'unknown';
  const dataThroughAt = safeTimestamp(envelope?.dataThrough) || safeTimestamp(envelope?.dataThroughMs);
  const generatedAt = safeTimestamp(envelope?.generatedAt);
  const rollup = Object.freeze({
    name: 'rollups',
    label: 'Rollups',
    status: rollupStatus,
    statusLabel: rollupStatus === 'healthy' ? 'Healthy' : rollupStatus === 'degraded' ? 'Degraded' : 'Unknown',
    criticality: 'supporting',
    summary: latest
      ? latestStatus === 'complete' ? 'Latest D1 rollup run completed.' : 'Latest D1 rollup run is not complete.'
      : 'No rollup run was supplied by the protected Health endpoint.',
    reasons: Object.freeze([]),
    action: null,
    source: Object.freeze({ kind: 'pga-api', id: 'rollups', url: null }),
    freshness: Object.freeze({
      checkedAt: generatedAt,
      dataThroughAt,
      observedAt: dataThroughAt || generatedAt,
      text: dataThroughAt ? 'Protected rollup freshness is available.' : 'Rollup freshness unavailable',
    }),
  });

  return Object.freeze({
    schemaVersion: PRESENTATION_SCHEMA,
    mode: 'rollup-only',
    complete: false,
    status: 'unknown',
    statusLabel: 'Unknown',
    summary: 'Only rollup evidence is connected. Overall PlayGarba health cannot be confirmed yet.',
    generatedAt,
    evaluatedAt: generatedAt,
    accessibilitySummary: `PlayGarba Health: Unknown. Only rollup evidence is connected. Rollups: ${rollup.statusLabel}.`,
    subsystems: Object.freeze([rollup]),
    problems: rollup.status === 'healthy' ? Object.freeze([]) : Object.freeze([rollup]),
  });
}

export function normaliseHealthResult(result) {
  const transport = safeText(result?.transport, 40) || 'unavailable';
  if (transport === 'auth-expired') return Object.freeze({ transport, presentation: null });
  if (transport === 'error' || transport === 'unavailable') return Object.freeze({ transport, presentation: null });
  const envelope = isObject(result?.envelope) ? result.envelope : null;
  if (!envelope) return Object.freeze({ transport: 'error', presentation: null });

  const candidates = [envelope.data?.presentation, envelope.data, envelope.presentation];
  for (const candidate of candidates) {
    const presentation = normaliseCanonicalPresentation(candidate);
    if (presentation) return Object.freeze({ transport: 'ready', presentation });
  }

  if (envelope.data?.snapshot?.schemaVersion === SNAPSHOT_SCHEMA || envelope.data?.rollups) {
    return Object.freeze({ transport: 'ready', presentation: rollupStateFromEnvelope(envelope) });
  }
  return Object.freeze({ transport: 'unavailable', presentation: null });
}

function formatTimestamp(value) {
  if (!value) return 'Freshness unavailable';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Freshness unavailable';
  return `${new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(parsed)} IST`;
}

function setHealthState(state, title, body, { hideContent = true } = {}) {
  const node = document.querySelector('#healthState');
  if (node) {
    node.hidden = false;
    node.dataset.state = state;
    node.querySelector('strong').textContent = title;
    node.querySelector('p').textContent = body;
  }
  const content = document.querySelector('#healthContent');
  if (content && hideContent) content.hidden = true;
}

function makeSourceLink(source) {
  if (!source?.url) return null;
  const link = document.createElement('a');
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Evidence';
  link.setAttribute('aria-label', 'Open health evidence in a new tab');
  return link;
}

function renderRows(targetId, rows) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'health-empty';
    empty.textContent = 'No items in this section.';
    target.append(empty);
    return;
  }
  for (const row of rows) {
    const article = document.createElement('article');
    article.className = 'health-row';
    article.dataset.status = row.status;

    const heading = document.createElement('div');
    heading.className = 'health-row-heading';
    const label = document.createElement('strong');
    label.textContent = row.label;
    const status = document.createElement('span');
    status.className = 'health-status';
    status.textContent = row.statusLabel;
    heading.append(label, status);

    const summary = document.createElement('p');
    summary.textContent = row.summary;

    const meta = document.createElement('div');
    meta.className = 'health-row-meta';
    const freshness = document.createElement('span');
    freshness.textContent = row.freshness?.text || 'Freshness unavailable';
    meta.append(freshness);
    const link = makeSourceLink(row.source);
    if (link) meta.append(link);

    article.append(heading, summary, meta);
    if (row.reasons?.length) {
      const reason = document.createElement('small');
      reason.textContent = row.reasons[0];
      article.append(reason);
    }
    if (row.action) {
      const action = document.createElement('p');
      action.className = 'health-action';
      action.textContent = row.action;
      article.append(action);
    }
    target.append(article);
  }
}

function renderHealth(presentation) {
  const status = document.querySelector('#healthOverallStatus');
  const summary = document.querySelector('#healthOverallSummary');
  const mode = document.querySelector('#healthCoverage');
  const freshness = document.querySelector('#healthFreshness');
  const state = document.querySelector('#healthState');
  const content = document.querySelector('#healthContent');

  if (status) {
    status.textContent = presentation.statusLabel;
    status.dataset.status = presentation.status;
  }
  if (summary) summary.textContent = presentation.summary;
  if (mode) mode.textContent = presentation.mode === 'canonical'
    ? presentation.complete ? 'Eight canonical checks connected' : 'Canonical evidence incomplete'
    : 'Rollup-only evidence';
  if (freshness) freshness.textContent = presentation.evaluatedAt
    ? `Evaluated ${formatTimestamp(presentation.evaluatedAt)}`
    : presentation.generatedAt ? `Generated ${formatTimestamp(presentation.generatedAt)}` : 'Freshness unavailable';

  if (state) {
    state.hidden = presentation.complete && presentation.status === 'healthy';
    state.dataset.state = presentation.status;
    state.querySelector('strong').textContent = presentation.complete ? presentation.statusLabel : 'Incomplete health evidence';
    state.querySelector('p').textContent = presentation.complete ? presentation.summary : 'Available evidence is shown below, but missing subsystems remain unknown.';
  }
  if (content) content.hidden = false;

  const problems = presentation.problems || [];
  const problemsSection = document.querySelector('#healthProblemsSection');
  if (problemsSection) problemsSection.hidden = problems.length === 0;
  renderRows('healthProblems', problems);
  renderRows('healthSubsystems', presentation.subsystems || []);

  const announcer = document.querySelector('#announcer');
  if (announcer) announcer.textContent = presentation.accessibilitySummary || `PlayGarba Health: ${presentation.statusLabel}. ${presentation.summary}`;
}

export function mountHealth({ fetchEnvelope = fetchPgaEnvelope, autoLoad = true, fixtureMode = false } = {}) {
  if (typeof document === 'undefined') return null;
  const section = document.querySelector('[data-view="health"]');
  if (!section) return null;
  let controller = null;
  let generation = 0;
  let hasSnapshot = false;
  const isActive = () => !section.hidden;

  async function load({ force = false } = {}) {
    if (!force && hasSnapshot) return;

    const token = ++generation;
    controller?.abort();
    controller = null;

    if (!navigator.onLine) {
      setHealthState('offline', 'Offline', hasSnapshot ? 'Showing the last loaded Health snapshot. Fresh evidence cannot refresh offline.' : 'Health evidence cannot refresh while this device is offline.', { hideContent: !hasSnapshot });
      return;
    }

    controller = new AbortController();
    const signal = controller.signal;
    setHealthState('loading', 'Loading Health evidence', 'Fetching the protected Health response without assuming missing checks are healthy.', { hideContent: !hasSnapshot });

    let result;
    try {
      result = await fetchEnvelope('/api/health', { signal });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      result = { transport: 'error', envelope: null };
    }
    if (token !== generation || signal.aborted) return;

    const normalised = normaliseHealthResult(result);
    if (normalised.transport === 'auth-expired') {
      hasSnapshot = false;
      setHealthState('auth-expired', 'Access expired', 'PGA cannot show private Health evidence until Cloudflare Access is restored.');
      return;
    }
    if (!normalised.presentation) {
      hasSnapshot = false;
      setHealthState('error', 'Health unavailable', 'The protected Health endpoint did not return trustworthy health evidence. Unknown is not shown as healthy.');
      return;
    }
    hasSnapshot = true;
    renderHealth(normalised.presentation);
  }

  if (!fixtureMode) {
    for (const button of document.querySelectorAll('[data-nav="health"]')) {
      button.addEventListener('click', () => load());
    }
    document.querySelector('#refreshButton')?.addEventListener('click', () => { if (isActive()) load({ force: true }); });
    window.addEventListener('hashchange', () => { if (location.hash === '#health') load(); });
    window.addEventListener('online', () => { if (isActive()) load({ force: true }); });
    window.addEventListener('offline', () => { if (isActive()) load({ force: true }); });
  }

  if (autoLoad && isActive()) load({ force: true });
  return Object.freeze({ reload: () => load({ force: true }), render: renderHealth });
}

if (typeof document !== 'undefined') {
  const fixtureAllowed = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const controller = mountHealth({ autoLoad: !fixtureAllowed, fixtureMode: fixtureAllowed });
  if (fixtureAllowed && controller) window.PGA_HEALTH_TEST = controller;
}
