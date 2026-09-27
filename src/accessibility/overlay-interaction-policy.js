(function attachOverlayInteractionPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GARBA_OVERLAY_INTERACTION_POLICY = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOverlayInteractionPolicy() {
  'use strict';

  const VERSION = 1;
  const SONG_SHEET_MODES = new Set(['browse', 'search', 'queue', 'favourites']);
  const EDITABLE_TAGS = new Set(['input', 'textarea', 'select']);
  const CONTROL_TAGS = new Set(['button', 'a']);
  const CONTROL_ROLES = new Set([
    'button', 'link', 'slider', 'textbox', 'searchbox', 'combobox', 'spinbutton',
    'checkbox', 'radio', 'switch', 'menuitem', 'option', 'tab',
  ]);
  const GLOBAL_SHORTCUTS = new Map([
    ['code:Space', 'global-playback-toggle'],
    ['code:ArrowLeft', 'global-seek-backward'],
    ['code:ArrowRight', 'global-seek-forward'],
    ['key:/', 'global-search'],
    ['key:f', 'global-favourite'],
  ]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function invalid(reason, eventFacts = null) {
    return deepFreeze({
      version: VERSION,
      valid: false,
      reason,
      topmostSurfaceId: null,
      topmostModalId: null,
      backgroundInert: false,
      focusContainment: null,
      intent: null,
      restoreFocusTo: null,
      suppressGlobalShortcuts: true,
      event: eventFacts,
    });
  }

  function normaliseBoolean(value, fallback = false) {
    return value === true ? true : value === false ? false : fallback;
  }

  function normaliseSurface(surface) {
    if (!isPlainObject(surface) || surface.open === false) return { ignored: true };
    if (!nonEmptyString(surface.id) || !nonEmptyString(surface.kind)) {
      return { error: 'surface-invalid' };
    }

    const id = surface.id.trim();
    const kind = surface.kind.trim().toLowerCase();
    const modal = normaliseBoolean(surface.modal);
    const dismissible = normaliseBoolean(surface.dismissible, true);
    const ownsHistory = normaliseBoolean(surface.ownsHistory);
    const openerId = nonEmptyString(surface.openerId) ? surface.openerId.trim() : null;
    let mode = nonEmptyString(surface.mode) ? surface.mode.trim().toLowerCase() : null;

    if (kind === 'song-sheet') {
      if (surface.modal !== false) return { error: 'song-sheet-must-be-non-modal' };
      if (!SONG_SHEET_MODES.has(mode)) return { error: 'song-sheet-mode-invalid' };
    } else if (kind === 'nonstop-browser') {
      if (surface.modal !== true) return { error: 'nonstop-browser-must-be-modal' };
      mode = null;
    }

    return {
      surface: {
        id,
        kind,
        mode,
        modal,
        dismissible,
        ownsHistory,
        openerId,
      },
    };
  }

  function normaliseStack(surfaces) {
    if (!Array.isArray(surfaces)) return { error: 'surface-stack-invalid' };
    const stack = [];
    const ids = new Set();
    for (const raw of surfaces) {
      const parsed = normaliseSurface(raw);
      if (parsed.ignored) continue;
      if (parsed.error) return { error: parsed.error };
      if (ids.has(parsed.surface.id)) return { error: 'duplicate-surface-id' };
      ids.add(parsed.surface.id);
      stack.push(parsed.surface);
    }
    return { stack };
  }

  function eventFacts(event) {
    const source = isPlainObject(event) ? event : {};
    const type = nonEmptyString(source.type) ? source.type.trim().toLowerCase() : 'none';
    const key = typeof source.key === 'string' ? source.key : '';
    const code = typeof source.code === 'string' ? source.code : '';
    return {
      type,
      key,
      code,
      shiftKey: source.shiftKey === true,
      repeat: source.repeat === true,
      modified: source.altKey === true || source.ctrlKey === true || source.metaKey === true,
    };
  }

  function targetFacts(target) {
    if (!isPlainObject(target)) {
      return {
        tagName: '',
        role: '',
        contentEditable: false,
        overlayId: null,
        blocksGlobalShortcut: false,
      };
    }
    const tagName = nonEmptyString(target.tagName) ? target.tagName.trim().toLowerCase() : '';
    const role = nonEmptyString(target.role) ? target.role.trim().toLowerCase() : '';
    const contentEditable = target.contentEditable === true;
    const overlayId = nonEmptyString(target.overlayId) ? target.overlayId.trim() : null;
    const explicitlyEditable = target.editable === true;
    const control = EDITABLE_TAGS.has(tagName)
      || CONTROL_TAGS.has(tagName)
      || CONTROL_ROLES.has(role)
      || contentEditable
      || explicitlyEditable;
    return {
      tagName,
      role,
      contentEditable,
      overlayId,
      blocksGlobalShortcut: control,
    };
  }

  function globalShortcutIntent(event) {
    if (event.modified) return null;
    if (event.code && GLOBAL_SHORTCUTS.has(`code:${event.code}`)) {
      return GLOBAL_SHORTCUTS.get(`code:${event.code}`);
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return GLOBAL_SHORTCUTS.get(`key:${key}`) || null;
  }

  function interactionIntent(stack, event, target) {
    const topmost = stack.length ? stack[stack.length - 1] : null;
    const topmostModal = [...stack].reverse().find((surface) => surface.modal) || null;
    const targetOwnedByOverlay = Boolean(target.overlayId && stack.some((surface) => surface.id === target.overlayId));
    const suppressGlobalShortcuts = Boolean(topmostModal || target.blocksGlobalShortcut || targetOwnedByOverlay);

    if (event.type === 'history-back') {
      if (topmost && topmost.ownsHistory) {
        return {
          topmost,
          topmostModal,
          suppressGlobalShortcuts,
          intent: { id: 'dismiss-surface', owner: topmost.id, via: 'history-back' },
          restoreFocusTo: topmost.openerId,
        };
      }
      return { topmost, topmostModal, suppressGlobalShortcuts, intent: null, restoreFocusTo: null };
    }

    if (event.type !== 'keyboard') {
      return { topmost, topmostModal, suppressGlobalShortcuts, intent: null, restoreFocusTo: null };
    }

    if (event.key === 'Tab' && topmostModal) {
      return {
        topmost,
        topmostModal,
        suppressGlobalShortcuts: true,
        intent: {
          id: 'contain-focus',
          owner: topmostModal.id,
          direction: event.shiftKey ? 'backward' : 'forward',
        },
        restoreFocusTo: null,
      };
    }

    if (event.key === 'Escape') {
      if (topmost && topmost.dismissible) {
        return {
          topmost,
          topmostModal,
          suppressGlobalShortcuts: true,
          intent: { id: 'dismiss-surface', owner: topmost.id, via: 'escape' },
          restoreFocusTo: topmost.openerId,
        };
      }
      return { topmost, topmostModal, suppressGlobalShortcuts: Boolean(topmostModal), intent: null, restoreFocusTo: null };
    }

    const globalIntent = globalShortcutIntent(event);
    if (!globalIntent) {
      return { topmost, topmostModal, suppressGlobalShortcuts, intent: null, restoreFocusTo: null };
    }
    if (suppressGlobalShortcuts) {
      return {
        topmost,
        topmostModal,
        suppressGlobalShortcuts: true,
        intent: { id: 'suppress-global-shortcut', owner: topmostModal?.id || target.overlayId || 'focused-control', shortcut: globalIntent },
        restoreFocusTo: null,
      };
    }
    return {
      topmost,
      topmostModal,
      suppressGlobalShortcuts: false,
      intent: { id: globalIntent, owner: 'player-global' },
      restoreFocusTo: null,
    };
  }

  function buildOverlayInteractionPolicy({ surfaces = [], event = null } = {}) {
    const facts = eventFacts(event);
    const parsed = normaliseStack(surfaces);
    if (parsed.error) return invalid(parsed.error, facts);

    const target = targetFacts(isPlainObject(event) ? event.target : null);
    const interaction = interactionIntent(parsed.stack, facts, target);
    return deepFreeze({
      version: VERSION,
      valid: true,
      reason: null,
      topmostSurfaceId: interaction.topmost?.id || null,
      topmostModalId: interaction.topmostModal?.id || null,
      backgroundInert: Boolean(interaction.topmostModal),
      focusContainment: interaction.topmostModal
        ? { surfaceId: interaction.topmostModal.id, mode: 'contain' }
        : null,
      intent: interaction.intent,
      restoreFocusTo: interaction.restoreFocusTo,
      suppressGlobalShortcuts: interaction.suppressGlobalShortcuts,
      event: {
        ...facts,
        target,
      },
    });
  }

  return {
    VERSION,
    buildOverlayInteractionPolicy,
  };
});
