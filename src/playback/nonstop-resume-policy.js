'use strict';

const VERSION = 1;
const MAX_ENTRIES = 12;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const EVENT_KINDS = new Set(['progress', 'pause', 'ended', 'restart']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

function safeTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safePosition(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeDuration(value) {
  if (value == null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function emptyHistory() {
  return deepFreeze({ version: VERSION, entries: [] });
}

function publicResult({ valid, reason = null, history = null, issues = [], decision = null, changed = false }) {
  return deepFreeze({
    version: VERSION,
    valid,
    reason,
    history: history || emptyHistory(),
    issues: [...issues],
    decision,
    changed,
  });
}

function fail(reason, history = null, issues = []) {
  return publicResult({ valid: false, reason, history, issues, changed: false });
}

function normaliseEntry(raw) {
  if (!isPlainObject(raw)) return { error: 'history-entry-invalid' };
  const setId = safeId(raw.setId);
  const sourceId = safeId(raw.sourceId);
  const resumeRevision = safeId(raw.resumeRevision);
  if (!setId || !sourceId || !resumeRevision) return { error: 'history-entry-identity-invalid' };

  const positionSeconds = safePosition(raw.positionSeconds);
  if (positionSeconds == null) return { error: 'history-entry-position-invalid' };
  const durationSeconds = safeDuration(raw.durationSeconds);
  if (durationSeconds === undefined) return { error: 'history-entry-duration-invalid' };
  if (durationSeconds != null && positionSeconds > durationSeconds) return { error: 'history-entry-over-duration' };

  const observedAtMs = safeTimestamp(raw.observedAtMs);
  if (observedAtMs == null) return { error: 'history-entry-time-invalid' };
  if (typeof raw.completed !== 'boolean') return { error: 'history-entry-completed-invalid' };

  return {
    value: {
      setId,
      sourceId,
      resumeRevision,
      positionSeconds,
      durationSeconds,
      observedAtMs,
      completed: raw.completed,
    },
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.observedAtMs - a.observedAtMs || a.setId.localeCompare(b.setId));
}

function normaliseHistoryInternal(rawHistory, nowMs) {
  const now = safeTimestamp(nowMs);
  if (now == null) return { error: 'now-invalid', history: emptyHistory(), issues: [] };
  if (rawHistory == null) return { history: emptyHistory(), issues: [] };
  if (!isPlainObject(rawHistory) || rawHistory.version !== VERSION || !Array.isArray(rawHistory.entries)) {
    return { error: 'history-schema-invalid', history: emptyHistory(), issues: [] };
  }

  const seen = new Set();
  const validEntries = [];
  const issues = [];
  for (const rawEntry of rawHistory.entries) {
    const parsed = normaliseEntry(rawEntry);
    if (parsed.error) return { error: parsed.error, history: emptyHistory(), issues };
    const entry = parsed.value;
    if (seen.has(entry.setId)) return { error: 'history-duplicate-set', history: emptyHistory(), issues };
    seen.add(entry.setId);
    if (entry.observedAtMs > now) return { error: 'history-entry-future', history: emptyHistory(), issues };
    if (now - entry.observedAtMs >= MAX_AGE_MS) {
      issues.push('history-entry-expired');
      continue;
    }
    validEntries.push(entry);
  }

  const ordered = sortEntries(validEntries);
  if (ordered.length > MAX_ENTRIES) issues.push('history-compacted');
  const entries = ordered.slice(0, MAX_ENTRIES);
  return { history: deepFreeze({ version: VERSION, entries }), issues };
}

function normaliseResumeHistory(rawHistory, { nowMs } = {}) {
  const parsed = normaliseHistoryInternal(rawHistory, nowMs);
  if (parsed.error) return fail(parsed.error, parsed.history, parsed.issues);
  return publicResult({ valid: true, history: parsed.history, issues: parsed.issues, changed: parsed.issues.length > 0 });
}

function normaliseCurrentSet(raw) {
  if (!isPlainObject(raw)) return { error: 'current-set-invalid' };
  const setId = safeId(raw.setId);
  const sourceId = safeId(raw.sourceId);
  const resumeRevision = safeId(raw.resumeRevision);
  if (!setId || !sourceId || !resumeRevision) return { error: 'current-set-identity-invalid' };
  const durationSeconds = safeDuration(raw.durationSeconds);
  if (durationSeconds === undefined) return { error: 'current-set-duration-invalid' };
  if (typeof raw.available !== 'boolean' || typeof raw.seekable !== 'boolean') {
    return { error: 'current-set-capability-invalid' };
  }
  return {
    value: {
      setId,
      sourceId,
      resumeRevision,
      durationSeconds,
      available: raw.available,
      seekable: raw.seekable,
    },
  };
}

function normaliseObservation(raw, nowMs) {
  if (!isPlainObject(raw)) return { error: 'observation-invalid' };
  if (raw.authoritative !== true) return { error: 'observation-not-authoritative' };
  const setId = safeId(raw.setId);
  const sourceId = safeId(raw.sourceId);
  const resumeRevision = safeId(raw.resumeRevision);
  if (!setId || !sourceId || !resumeRevision) return { error: 'observation-identity-invalid' };
  const eventKind = typeof raw.eventKind === 'string' ? raw.eventKind.trim().toLowerCase() : '';
  if (!EVENT_KINDS.has(eventKind)) return { error: 'observation-event-invalid' };

  const positionSeconds = safePosition(raw.positionSeconds);
  if (positionSeconds == null) return { error: 'observation-position-invalid' };
  if (eventKind === 'restart' && positionSeconds !== 0) return { error: 'restart-position-invalid' };
  const durationSeconds = safeDuration(raw.durationSeconds);
  if (durationSeconds === undefined) return { error: 'observation-duration-invalid' };
  if (durationSeconds != null && positionSeconds > durationSeconds) return { error: 'observation-over-duration' };

  const observedAtMs = safeTimestamp(raw.observedAtMs);
  const now = safeTimestamp(nowMs);
  if (observedAtMs == null || now == null) return { error: 'observation-time-invalid' };
  if (observedAtMs > now) return { error: 'observation-future' };
  if (now - observedAtMs >= MAX_AGE_MS) return { error: 'observation-expired' };

  return {
    value: {
      setId,
      sourceId,
      resumeRevision,
      positionSeconds,
      durationSeconds,
      observedAtMs,
      completed: eventKind === 'ended',
      eventKind,
    },
  };
}

function recordNonstopObservation(rawHistory, rawObservation, { nowMs, currentSet } = {}) {
  const parsedHistory = normaliseHistoryInternal(rawHistory, nowMs);
  if (parsedHistory.error) return fail(parsedHistory.error, parsedHistory.history, parsedHistory.issues);
  const parsedCurrent = normaliseCurrentSet(currentSet);
  if (parsedCurrent.error) return fail(parsedCurrent.error, parsedHistory.history, parsedHistory.issues);
  const parsedObservation = normaliseObservation(rawObservation, nowMs);
  if (parsedObservation.error) return fail(parsedObservation.error, parsedHistory.history, parsedHistory.issues);

  const current = parsedCurrent.value;
  const observation = parsedObservation.value;
  if (
    observation.setId !== current.setId
    || observation.sourceId !== current.sourceId
    || observation.resumeRevision !== current.resumeRevision
  ) {
    return fail('observation-current-set-mismatch', parsedHistory.history, parsedHistory.issues);
  }
  if (!current.available) return fail('observation-current-set-unavailable', parsedHistory.history, parsedHistory.issues);
  if (
    observation.durationSeconds != null
    && current.durationSeconds != null
    && observation.durationSeconds !== current.durationSeconds
  ) {
    return fail('observation-duration-mismatch', parsedHistory.history, parsedHistory.issues);
  }
  if (observation.durationSeconds == null && current.durationSeconds != null) {
    observation.durationSeconds = current.durationSeconds;
    if (observation.positionSeconds > current.durationSeconds) {
      return fail('observation-over-duration', parsedHistory.history, parsedHistory.issues);
    }
  }

  const existing = parsedHistory.history.entries.find((entry) => entry.setId === observation.setId) || null;
  if (existing && observation.observedAtMs <= existing.observedAtMs) {
    return publicResult({
      valid: true,
      reason: 'stale-observation',
      history: parsedHistory.history,
      issues: parsedHistory.issues,
      changed: false,
    });
  }

  const sameBinding = existing
    && existing.sourceId === observation.sourceId
    && existing.resumeRevision === observation.resumeRevision;
  if (sameBinding && existing.completed && !['restart', 'ended'].includes(observation.eventKind)) {
    return publicResult({
      valid: true,
      reason: 'completed-terminal',
      history: parsedHistory.history,
      issues: parsedHistory.issues,
      changed: false,
    });
  }

  const entry = {
    setId: observation.setId,
    sourceId: observation.sourceId,
    resumeRevision: observation.resumeRevision,
    positionSeconds: observation.positionSeconds,
    durationSeconds: observation.durationSeconds,
    observedAtMs: observation.observedAtMs,
    completed: observation.eventKind === 'restart' ? false : observation.completed,
  };

  const nextEntries = parsedHistory.history.entries.filter((candidate) => candidate.setId !== entry.setId);
  nextEntries.push(entry);
  const ordered = sortEntries(nextEntries).slice(0, MAX_ENTRIES);
  const issues = [...parsedHistory.issues];
  if (nextEntries.length > MAX_ENTRIES) issues.push('history-compacted');
  if (existing && !sameBinding) issues.push('source-revision-replaced');

  return publicResult({
    valid: true,
    reason: existing && !sameBinding ? 'binding-replaced' : 'observation-recorded',
    history: deepFreeze({ version: VERSION, entries: ordered }),
    issues,
    changed: true,
  });
}

function emptyDecision(reason = 'no-record') {
  return deepFreeze({
    reason,
    resume: { available: false, positionSeconds: null, autoplay: false },
    startOver: { available: false, positionSeconds: 0, autoplay: false },
  });
}

function classifyNonstopResume(rawHistory, rawCurrentSet, { nowMs } = {}) {
  const parsedHistory = normaliseHistoryInternal(rawHistory, nowMs);
  if (parsedHistory.error) return fail(parsedHistory.error, parsedHistory.history, parsedHistory.issues);
  const parsedCurrent = normaliseCurrentSet(rawCurrentSet);
  if (parsedCurrent.error) return fail(parsedCurrent.error, parsedHistory.history, parsedHistory.issues);

  const current = parsedCurrent.value;
  const record = parsedHistory.history.entries.find((entry) => entry.setId === current.setId) || null;
  const startOverAvailable = current.available;
  const makeDecision = (reason, resumeAvailable = false, positionSeconds = null) => deepFreeze({
    reason,
    resume: { available: resumeAvailable, positionSeconds: resumeAvailable ? positionSeconds : null, autoplay: false },
    startOver: { available: startOverAvailable, positionSeconds: 0, autoplay: false },
  });

  let decision;
  if (!record) decision = makeDecision('no-record');
  else if (record.sourceId !== current.sourceId) decision = makeDecision('source-mismatch');
  else if (record.resumeRevision !== current.resumeRevision) decision = makeDecision('revision-mismatch');
  else if (record.durationSeconds != null && current.durationSeconds != null && record.durationSeconds !== current.durationSeconds) {
    decision = makeDecision('duration-mismatch');
  } else if (record.completed) decision = makeDecision('completed');
  else if (!current.available) decision = makeDecision('unavailable');
  else if (!current.seekable) decision = makeDecision('not-seekable');
  else if (record.positionSeconds <= 0) decision = makeDecision('no-progress');
  else if (current.durationSeconds != null && record.positionSeconds > current.durationSeconds) decision = makeDecision('position-over-duration');
  else decision = makeDecision('resume-available', true, record.positionSeconds);

  return publicResult({
    valid: true,
    history: parsedHistory.history,
    issues: parsedHistory.issues,
    decision,
    changed: parsedHistory.issues.length > 0,
  });
}

module.exports = Object.freeze({
  VERSION,
  MAX_ENTRIES,
  MAX_AGE_MS,
  createResumeHistory: emptyHistory,
  normaliseResumeHistory,
  recordNonstopObservation,
  classifyNonstopResume,
});
