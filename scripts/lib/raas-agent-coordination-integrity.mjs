import { createHash } from 'node:crypto';

const CLAIM_RE = /<!--\s*agent-claim\s*\n([\s\S]*?)-->/i;
const RELEASE_RE = /<!--\s*agent-release\s*\n([\s\S]*?)-->/i;
const OVERRIDE_RE = /<!--\s*agent-claim-override\s*\n([\s\S]*?)-->/i;
const INTEGRITY_RE = /<!--\s*agent-claim-integrity\s*\n([\s\S]*?)-->/ig;
const INTEGRITY_ONE_RE = /<!--\s*agent-claim-integrity\s*\n([\s\S]*?)-->/i;

function field(block, name) {
  const match = String(block || '').match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'mi'));
  return match ? match[1].trim() : '';
}

export function parseCoordinationEvent(comment) {
  const body = comment?.body || '';
  const override = body.match(OVERRIDE_RE);
  if (override) {
    return {
      type: 'override',
      reason: field(override[1], 'reason'),
      author: comment?.user?.login || 'unknown',
      commentId: Number(comment?.id),
    };
  }

  const release = body.match(RELEASE_RE);
  if (release) {
    return {
      type: 'release',
      agent: field(release[1], 'agent'),
      branch: field(release[1], 'branch'),
      author: comment?.user?.login || 'unknown',
      commentId: Number(comment?.id),
    };
  }

  const claim = body.match(CLAIM_RE);
  if (claim) {
    return {
      type: 'claim',
      agent: field(claim[1], 'agent'),
      branch: field(claim[1], 'branch'),
      scope: field(claim[1], 'scope'),
      files: field(claim[1], 'files'),
      author: comment?.user?.login || 'unknown',
      commentId: Number(comment?.id),
    };
  }
  return null;
}

export function validClaim(event) {
  return Boolean(event?.type === 'claim' && event.agent && event.branch && event.scope && event.files);
}

export function sameOwner(a, b) {
  return Boolean(a && b && a.agent === b.agent && a.branch === b.branch);
}

export function deriveOwnershipState(comments, ownerLogin) {
  let active = null;
  let conflicts = [];
  for (const comment of [...(comments || [])].sort((a, b) => Number(a.id) - Number(b.id))) {
    const event = parseCoordinationEvent(comment);
    if (!event) continue;
    if (event.type === 'override') {
      if (event.author === ownerLogin) {
        active = null;
        conflicts = [];
      }
      continue;
    }
    if (event.type === 'release') {
      if (active && sameOwner(active, event)) {
        active = null;
        conflicts = [];
      } else {
        conflicts = conflicts.filter(conflict => !sameOwner(conflict, event));
      }
      continue;
    }
    if (!validClaim(event)) continue;
    if (!active) {
      active = event;
      conflicts = [];
    } else if (sameOwner(active, event)) {
      active = event;
    } else {
      conflicts.push(event);
    }
  }
  return { active, conflicts };
}

function canonicalEvent(event) {
  if (!event) return null;
  if (event.type === 'claim') {
    return {
      type: 'claim', agent: event.agent || '', branch: event.branch || '',
      scope: event.scope || '', files: event.files || '', author: event.author || '',
    };
  }
  if (event.type === 'release') {
    return { type: 'release', agent: event.agent || '', branch: event.branch || '', author: event.author || '' };
  }
  return { type: 'override', reason: event.reason || '', author: event.author || '' };
}

function acceptedOriginalEvent(event, beforeState, ownerLogin) {
  if (!event) return false;
  if (event.type === 'claim') {
    return validClaim(event) && (!beforeState.active || sameOwner(beforeState.active, event));
  }
  if (event.type === 'release') {
    return Boolean(
      (beforeState.active && sameOwner(beforeState.active, event)) ||
      beforeState.conflicts.some(conflict => sameOwner(conflict, event))
    );
  }
  return event.type === 'override' && event.author === ownerLogin;
}

function mutationKey({ issueNumber, sourceCommentId, action, updatedAt, oldBody, newBody }) {
  const material = JSON.stringify({
    issueNumber: Number(issueNumber),
    sourceCommentId: Number(sourceCommentId),
    action: String(action || ''),
    updatedAt: String(updatedAt || ''),
    oldBody: String(oldBody || ''),
    newBody: String(newBody || ''),
  });
  return createHash('sha256').update(material).digest('hex');
}

export function parseIntegrityRecord(comment) {
  const match = String(comment?.body || '').match(INTEGRITY_ONE_RE);
  if (!match) return null;
  return {
    key: field(match[1], 'key'),
    sourceCommentId: Number(field(match[1], 'source-comment') || 0),
    mutation: field(match[1], 'mutation'),
    originalEvent: field(match[1], 'original-event'),
    actor: field(match[1], 'actor'),
    holdAgent: field(match[1], 'hold-agent'),
    holdBranch: field(match[1], 'hold-branch'),
    holdFiles: field(match[1], 'hold-files'),
    commentId: Number(comment?.id || 0),
  };
}

export function latestUnreconciledIntegrityHold(comments, ownerLogin) {
  let pending = null;
  for (const comment of [...(comments || [])].sort((a, b) => Number(a.id) - Number(b.id))) {
    const integrity = parseIntegrityRecord(comment);
    if (integrity?.key && integrity.holdAgent && integrity.holdBranch) pending = integrity;
    const event = parseCoordinationEvent(comment);
    if (pending && event?.type === 'override' && event.author === ownerLogin) pending = null;
  }
  return pending;
}

export function integrityKeys(comments) {
  const keys = new Set();
  for (const comment of comments || []) {
    const body = String(comment?.body || '');
    INTEGRITY_RE.lastIndex = 0;
    let match;
    while ((match = INTEGRITY_RE.exec(body))) {
      const key = field(match[1], 'key');
      if (key) keys.add(key);
    }
  }
  return keys;
}

function changedCoordinationMeaning(oldEvent, newEvent, action) {
  if (action === 'deleted') return Boolean(oldEvent);
  if (!oldEvent) return false;
  return JSON.stringify(canonicalEvent(oldEvent)) !== JSON.stringify(canonicalEvent(newEvent));
}

function ownershipAnchor(oldEvent, beforeState) {
  if (oldEvent?.type === 'claim') return oldEvent;
  if (oldEvent?.type === 'release') {
    return beforeState.active && sameOwner(beforeState.active, oldEvent)
      ? beforeState.active
      : beforeState.conflicts.find(conflict => sameOwner(conflict, oldEvent)) || null;
  }
  if (oldEvent?.type === 'override') return beforeState.active || null;
  return beforeState.active || null;
}

function affectedFiles(oldEvent, beforeState) {
  if (oldEvent?.type === 'claim' && oldEvent.files) return oldEvent.files;
  if (oldEvent?.type === 'release') {
    const match = beforeState.active && sameOwner(beforeState.active, oldEvent)
      ? beforeState.active
      : beforeState.conflicts.find(conflict => sameOwner(conflict, oldEvent));
    if (match?.files) return match.files;
  }
  if (oldEvent?.type === 'override' && beforeState.active?.files) return beforeState.active.files;
  return beforeState.active?.files || 'integrity-hold';
}

export function buildMutationPlan({
  action,
  issueNumber,
  sourceComment,
  oldBody,
  newBody,
  comments,
  ownerLogin,
}) {
  const sourceCommentId = Number(sourceComment?.id || 0);
  if (!sourceCommentId || !['edited', 'deleted'].includes(action)) return null;

  const oldComment = { ...sourceComment, body: String(oldBody || '') };
  const newComment = { ...sourceComment, body: String(newBody || '') };
  const oldEvent = parseCoordinationEvent(oldComment);
  const newEvent = action === 'deleted' ? null : parseCoordinationEvent(newComment);
  if (!changedCoordinationMeaning(oldEvent, newEvent, action)) return null;

  const beforeComments = (comments || []).filter(comment => Number(comment.id) < sourceCommentId);
  const beforeState = deriveOwnershipState(beforeComments, ownerLogin);
  if (!acceptedOriginalEvent(oldEvent, beforeState, ownerLogin)) return null;

  const key = mutationKey({
    issueNumber,
    sourceCommentId,
    action,
    updatedAt: sourceComment?.updated_at || sourceComment?.updatedAt || '',
    oldBody,
    newBody,
  });
  if (integrityKeys(comments).has(key)) return { duplicate: true, key };

  const currentState = deriveOwnershipState(comments || [], ownerLogin);
  const holdAgent = `raas-integrity-hold/${Number(issueNumber)}`;
  const anchor = ownershipAnchor(oldEvent, beforeState);
  const holdBranch = anchor?.branch || `integrity/issue-${Number(issueNumber)}`;
  const holdFiles = affectedFiles(oldEvent, beforeState);
  const currentIsHold = sameOwner(currentState.active, { agent: holdAgent, branch: holdBranch });

  return {
    duplicate: false,
    key,
    action,
    issueNumber: Number(issueNumber),
    sourceCommentId,
    oldEvent,
    newEvent,
    beforeState,
    currentState,
    hold: {
      agent: holdAgent,
      branch: holdBranch,
      files: holdFiles,
      scope: `Integrity hold after ${action} mutation of accepted ${oldEvent.type} comment ${sourceCommentId}; generation ${key.slice(0, 12)}. Repository-owner reconciliation is required before reassignment.`,
    },
    releaseCurrent: currentState.active && !currentIsHold ? currentState.active : null,
  };
}

export function buildReopenPlan({ issueNumber, comments, ownerLogin }) {
  const pending = latestUnreconciledIntegrityHold(comments, ownerLogin);
  if (!pending) return null;
  const currentState = deriveOwnershipState(comments || [], ownerLogin);
  const hold = {
    agent: pending.holdAgent,
    branch: pending.holdBranch,
    files: pending.holdFiles || 'integrity-hold',
    scope: `Integrity hold restored after issue reopen for unresolved generation ${pending.key.slice(0, 12)}. Repository-owner reconciliation is required before reassignment.`,
  };
  const currentIsHold = sameOwner(currentState.active, hold);
  return {
    issueNumber: Number(issueNumber),
    key: pending.key,
    hold,
    releaseCurrent: currentState.active && !currentIsHold ? currentState.active : null,
    alreadyHeld: currentIsHold,
  };
}

export function integrityRecordBody(plan, actor = 'unknown') {
  return [
    '<!-- agent-claim-integrity',
    `key: ${plan.key}`,
    `source-comment: ${plan.sourceCommentId}`,
    `mutation: ${plan.action}`,
    `original-event: ${plan.oldEvent?.type || 'unknown'}`,
    `actor: ${actor || 'unknown'}`,
    `hold-agent: ${plan.hold.agent}`,
    `hold-branch: ${plan.hold.branch}`,
    `hold-files: ${plan.hold.files}`,
    '-->',
    '### RAAS ownership integrity hold',
    '',
    `Accepted ownership source comment ${plan.sourceCommentId} was ${plan.action}.`,
    `Integrity generation: \`${plan.key}\`.`,
    '',
    'The lane is fail-closed. Existing ownership exposed by the mutated history is neutralised and a conservative integrity hold is installed. A repository-owner `agent-claim-override` reconciliation is required before another implementation claim can become authoritative.',
  ].join('\n');
}

export function releaseBody(ownerEvent, key) {
  return [
    '<!-- agent-release',
    `agent: ${ownerEvent.agent}`,
    `branch: ${ownerEvent.branch}`,
    '-->',
    `RELEASE: integrity generation ${key.slice(0, 12)} neutralises ownership exposed by mutated source history. This is a safety hold, not a normal owner release.`,
  ].join('\n');
}

export function holdClaimBody(hold, key) {
  return [
    '<!-- agent-claim',
    `agent: ${hold.agent}`,
    `branch: ${hold.branch}`,
    `scope: ${hold.scope}`,
    `files: ${hold.files}`,
    '-->',
    `INTEGRITY HOLD: generation ${key}. Do not implement or reassign this lane until the repository owner posts an explicit valid override/reconciliation event.`,
  ].join('\n');
}
