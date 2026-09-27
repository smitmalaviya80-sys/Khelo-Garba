(() => {
  const app = document.getElementById('app');
  if (!app || window.GARBA_LOCAL_BACKGROUND) return;

  const DB_NAME = 'playgarba-local-media';
  const DB_VERSION = 1;
  const STORE_NAME = 'backgrounds';
  const BACKGROUND_KEY = 'player-background';
  const STYLE_ID = 'garbaLocalBackgroundStyles';
  const CONTROL_ID = 'garbaLocalBackgroundControl';
  const MENU_ID = 'garbaLocalBackgroundMenu';
  const GALLERY_ID = 'garbaLocalBackgroundGallery';
  const LIBRARY_BASE = 'assets/backgrounds/library/';
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const LIBRARY_BACKGROUNDS = [
    ['01-bollywood-garba-courtyard.webp', 'Bollywood courtyard'],
    ['02-rhythmic-drums-courtyard-a.webp', 'Rhythmic drums courtyard'],
    ['03-devotional-garba-courtyard.webp', 'Devotional courtyard'],
    ['04-colourful-garba-courtyard-a.webp', 'Colourful courtyard'],
    ['05-fusion-gujarati-neon.webp', 'Gujarati neon'],
    ['06-fusion-abstract-neon.webp', 'Abstract neon'],
    ['07-dandiya-purple-courtyard.webp', 'Purple dandiya courtyard'],
    ['08-colourful-garba-courtyard-b.webp', 'Colourful garba courtyard'],
    ['09-warm-stage-courtyard.webp', 'Warm stage courtyard'],
    ['10-dandiya-silhouette-courtyard.webp', 'Dandiya silhouette courtyard'],
    ['11-master-dark-courtyard.webp', 'Dark courtyard'],
    ['12-rhythmic-drums-courtyard-b.webp', 'Rhythmic drums courtyard two'],
    ['13-traditional-marigold-courtyard.webp', 'Marigold courtyard'],
    ['14-gujarati-folk-courtyard.webp', 'Gujarati folk courtyard'],
    ['15-traditional-canopy-courtyard.webp', 'Traditional canopy courtyard'],
  ];

  const state = {
    objectUrl: '',
    fileName: '',
    source: '',
    selectedLibraryFile: '',
    persistent: false,
    picker: null,
    trigger: null,
    menu: null,
    resetButton: null,
    exploreButton: null,
    gallery: null,
    galleryHydrated: false,
    observer: null,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #app[data-custom-background="true"] .world-layer {
        background-image: var(--garba-custom-background) !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
      }
      .atmosphere-local-background {
        display:flex;
        justify-content:flex-end;
        margin-top:14px;
        padding-top:12px;
        border-top:1px solid rgba(246,236,215,.09);
      }
      .atmosphere-local-background-control {
        position:relative;
        display:inline-flex;
      }
      .atmosphere-local-background-trigger,
      .atmosphere-local-background-action {
        min-height:34px;
        border:1px solid rgba(246,236,215,.13);
        border-radius:999px;
        color:#f6ecd7;
        background:rgba(246,236,215,.055);
        font:600 11px/1 var(--sans,system-ui);
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }
      .atmosphere-local-background-trigger {
        min-width:94px;
        padding:0 14px;
      }
      .atmosphere-local-background-trigger[data-active="true"] {
        border-color:rgba(246,236,215,.26);
        background:rgba(246,236,215,.10);
      }
      .atmosphere-local-background-trigger:hover,
      .atmosphere-local-background-action:hover:not(:disabled) {
        background:rgba(246,236,215,.10);
      }
      .atmosphere-local-background-trigger:active,
      .atmosphere-local-background-action:active:not(:disabled) {
        transform:scale(.98);
      }
      .atmosphere-local-background-trigger:focus-visible,
      .atmosphere-local-background-action:focus-visible,
      .atmosphere-local-background-thumb:focus-visible {
        outline:2px solid var(--accent);
        outline-offset:3px;
      }
      .atmosphere-local-background-menu {
        position:absolute;
        right:0;
        bottom:calc(100% + 8px);
        z-index:12;
        width:min(310px,calc(100vw - 32px));
        max-height:min(420px,70vh);
        overflow:auto;
        overscroll-behavior:contain;
        padding:7px;
        border:1px solid rgba(246,236,215,.12);
        border-radius:22px;
        background:rgba(17,15,20,.94);
        box-shadow:0 14px 38px rgba(0,0,0,.32);
        backdrop-filter:blur(16px);
        -webkit-backdrop-filter:blur(16px);
      }
      .atmosphere-local-background-menu[hidden],
      .atmosphere-local-background-gallery[hidden] {
        display:none !important;
      }
      .atmosphere-local-background-actions {
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:6px;
      }
      .atmosphere-local-background-action {
        width:100%;
        padding:0 12px;
        white-space:nowrap;
      }
      .atmosphere-local-background-action:disabled {
        opacity:.38;
        cursor:default;
        transform:none;
      }
      .atmosphere-local-background-action[aria-expanded="true"] {
        background:rgba(246,236,215,.12);
      }
      .atmosphere-local-background-gallery {
        display:grid;
        grid-template-columns:repeat(5,minmax(0,1fr));
        gap:6px;
        margin-top:7px;
        padding-top:7px;
        border-top:1px solid rgba(246,236,215,.08);
      }
      .atmosphere-local-background-thumb {
        position:relative;
        aspect-ratio:1/.78;
        min-width:0;
        overflow:hidden;
        padding:0;
        border:1px solid rgba(246,236,215,.12);
        border-radius:12px;
        background:rgba(246,236,215,.04);
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }
      .atmosphere-local-background-thumb img {
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }
      .atmosphere-local-background-thumb:hover {
        border-color:rgba(246,236,215,.34);
      }
      .atmosphere-local-background-thumb[aria-pressed="true"] {
        border-color:#f6ecd7;
        box-shadow:inset 0 0 0 1px #f6ecd7;
      }
      .atmosphere-local-background-thumb[aria-pressed="true"]::after {
        content:'✓';
        position:absolute;
        right:4px;
        bottom:4px;
        display:grid;
        place-items:center;
        width:17px;
        height:17px;
        border-radius:999px;
        color:#17141c;
        background:#f6ecd7;
        font:800 10px/1 var(--sans,system-ui);
      }
      @media (max-width:350px) {
        .atmosphere-local-background-gallery { grid-template-columns:repeat(4,minmax(0,1fr)); }
      }
      @media (prefers-reduced-motion:reduce) {
        .atmosphere-local-background-trigger:active,
        .atmosphere-local-background-action:active { transform:none; }
      }
    `;
    document.head.append(style);
  }

  function announce(message) {
    const status = document.querySelector('#atmospherePanel .atmosphere-status');
    if (status) status.textContent = message;
  }

  function focusTrigger() {
    try {
      state.trigger?.focus({ preventScroll: true });
    } catch {
      state.trigger?.focus();
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        return reject(error);
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local background storage'));
      request.onblocked = () => reject(new Error('Local background storage is blocked'));
    });
  }

  async function withStore(mode, operation) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let request;
        try {
          request = operation(store);
        } catch (error) {
          return reject(error);
        }
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error || request?.error || new Error('Local background storage failed'));
        transaction.onabort = () => reject(transaction.error || new Error('Local background storage was cancelled'));
      });
    } finally {
      database.close();
    }
  }

  const readStoredBackground = () => withStore('readonly', (store) => store.get(BACKGROUND_KEY));
  const saveStoredBackground = (record) => withStore('readwrite', (store) => store.put(record, BACKGROUND_KEY));
  const deleteStoredBackground = () => withStore('readwrite', (store) => store.delete(BACKGROUND_KEY));

  function releaseObjectUrl() {
    if (!state.objectUrl) return;
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = '';
  }

  function syncControls() {
    const active = app.dataset.customBackground === 'true';
    if (state.resetButton) state.resetButton.disabled = !active;
    if (state.trigger) state.trigger.dataset.active = String(active);
    if (!state.galleryHydrated || !state.gallery) return;
    state.gallery.querySelectorAll('[data-library-background]').forEach((button) => {
      const selected = state.source === 'library' && button.dataset.libraryBackground === state.selectedLibraryFile;
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function closeMenu() {
    if (!state.menu || state.menu.hidden) return;
    state.menu.hidden = true;
    state.trigger?.setAttribute('aria-expanded', 'false');
    if (state.gallery) state.gallery.hidden = true;
    state.exploreButton?.setAttribute('aria-expanded', 'false');
  }

  function applyBackground(value, fileName, source, persistent, message) {
    state.fileName = fileName;
    state.source = source;
    state.persistent = persistent;
    app.style.setProperty('--garba-custom-background', `url("${value}")`);
    app.dataset.customBackground = 'true';
    app.dataset.customBackgroundSource = source;
    syncControls();
    if (message) announce(message);
  }

  function isSafeImageBlob(blob) {
    const type = String(blob?.type || '').toLowerCase();
    return blob instanceof Blob && type.startsWith('image/') && type !== 'image/svg+xml';
  }

  function applyBackgroundBlob(blob, fileName = '', { persistent = false, announceChange = true } = {}) {
    if (!isSafeImageBlob(blob)) return false;
    releaseObjectUrl();
    state.selectedLibraryFile = '';
    state.objectUrl = URL.createObjectURL(blob);
    applyBackground(
      state.objectUrl,
      fileName,
      'upload',
      persistent,
      announceChange ? (persistent ? 'Background saved on this device.' : 'Background added for this session.') : '',
    );
    return true;
  }

  function libraryMatch(fileName) {
    return LIBRARY_BACKGROUNDS.find(([file]) => file === fileName) || null;
  }

  function libraryUrl(fileName) {
    return `${LIBRARY_BASE}${fileName}`;
  }

  function imageUrlLoads(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }

  async function applyLibraryBackground(fileName, { persistent = false, announceChange = true } = {}) {
    const match = libraryMatch(fileName);
    if (!match) return false;
    const url = libraryUrl(match[0]);
    if (!await imageUrlLoads(url)) {
      if (announceChange) announce('That PlayGarba background is not available right now.');
      return false;
    }
    releaseObjectUrl();
    state.selectedLibraryFile = match[0];
    applyBackground(
      url,
      match[1],
      'library',
      persistent,
      announceChange ? (persistent ? 'Background saved on this device.' : 'Background selected for this session.') : '',
    );
    return true;
  }

  function restoreBuiltInBackground() {
    releaseObjectUrl();
    state.fileName = '';
    state.source = '';
    state.selectedLibraryFile = '';
    state.persistent = false;
    app.style.removeProperty('--garba-custom-background');
    delete app.dataset.customBackground;
    delete app.dataset.customBackgroundSource;
    syncControls();
  }

  function validateUpload(file) {
    const type = String(file?.type || '').toLowerCase();
    if (!file || !type.startsWith('image/')) return 'Choose a photo or image file.';
    if (type === 'image/svg+xml') return 'SVG backgrounds are not supported. Choose a photo or raster image.';
    if (!file.size) return 'That image is empty. Choose another image.';
    if (file.size > MAX_UPLOAD_BYTES) return 'Choose an image smaller than 20 MB.';
    return '';
  }

  function imageFileDecodes(file) {
    return new Promise((resolve) => {
      const temporaryUrl = URL.createObjectURL(file);
      const image = new Image();
      const finish = (valid) => {
        URL.revokeObjectURL(temporaryUrl);
        resolve(Boolean(valid));
      };
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
      image.onerror = () => finish(false);
      image.src = temporaryUrl;
    });
  }

  async function chooseFile(file) {
    if (!file) return;
    const validationMessage = validateUpload(file);
    if (validationMessage) {
      announce(validationMessage);
      return;
    }
    if (!await imageFileDecodes(file)) {
      announce('That image cannot be displayed by this browser. Choose another image.');
      return;
    }

    const blob = file.slice(0, file.size, file.type);
    applyBackgroundBlob(blob, file.name, { announceChange: false });
    try {
      await saveStoredBackground({ kind: 'upload', blob, name: file.name || '', type: file.type || blob.type || '', updatedAt: Date.now() });
      state.persistent = true;
      announce('Background saved on this device.');
    } catch {
      state.persistent = false;
      announce('Background added for this session.');
    }
  }

  async function chooseLibraryBackground(fileName) {
    if (!await applyLibraryBackground(fileName, { announceChange: false })) {
      announce('That PlayGarba background is not available right now.');
      return;
    }
    try {
      await saveStoredBackground({ kind: 'library', file: fileName, updatedAt: Date.now() });
      state.persistent = true;
      announce('Background saved on this device.');
    } catch {
      state.persistent = false;
      announce('Background selected for this session.');
    }
    syncControls();
  }

  async function clearBackground() {
    restoreBuiltInBackground();
    try {
      await deleteStoredBackground();
      announce('PlayGarba background restored.');
    } catch {
      announce('PlayGarba background restored for this session.');
    }
  }

  async function restoreStoredBackground() {
    try {
      const record = await readStoredBackground();
      if (record?.kind === 'library' && typeof record.file === 'string') {
        await applyLibraryBackground(record.file, { persistent: true, announceChange: false });
        return;
      }
      if (!isSafeImageBlob(record?.blob)) {
        if (record?.blob) await deleteStoredBackground().catch(() => {});
        return;
      }
      applyBackgroundBlob(record.blob, record.name || '', { persistent: true, announceChange: false });
    } catch {
      // Storage-disabled contexts still support session-only uploads and library choices.
    }
  }

  function galleryMarkup() {
    return LIBRARY_BACKGROUNDS.map(([file, label]) => `
      <button
        class="atmosphere-local-background-thumb"
        type="button"
        data-library-background="${file}"
        aria-label="${label}"
        aria-pressed="false"
        title="${label}"
      ><img src="${LIBRARY_BASE}${file}" alt="" loading="lazy" decoding="async" fetchpriority="low" /></button>
    `).join('');
  }

  function hydrateGallery() {
    if (!state.gallery || state.galleryHydrated) return;
    state.gallery.innerHTML = galleryMarkup();
    state.galleryHydrated = true;
    syncControls();
  }

  function mountControls() {
    if (document.getElementById(CONTROL_ID)) return true;
    const panel = document.getElementById('atmospherePanel');
    if (!panel) return false;

    const row = document.createElement('div');
    row.id = CONTROL_ID;
    row.className = 'atmosphere-local-background';
    row.setAttribute('aria-label', 'Background image');
    row.innerHTML = `
      <div class="atmosphere-local-background-control">
        <button
          class="atmosphere-local-background-trigger"
          type="button"
          aria-haspopup="dialog"
          aria-controls="${MENU_ID}"
          aria-expanded="false"
          data-action="toggle-background-menu"
        >Background</button>
        <div id="${MENU_ID}" class="atmosphere-local-background-menu" role="dialog" aria-label="Background options" hidden>
          <div class="atmosphere-local-background-actions">
            <button class="atmosphere-local-background-action" type="button" data-action="upload-background">Upload</button>
            <button class="atmosphere-local-background-action" type="button" data-action="reset-background" disabled>Reset</button>
            <button class="atmosphere-local-background-action" type="button" aria-controls="${GALLERY_ID}" aria-expanded="false" data-action="explore-backgrounds">Explore</button>
          </div>
          <div id="${GALLERY_ID}" class="atmosphere-local-background-gallery" aria-label="Explore backgrounds" hidden></div>
        </div>
        <input type="file" accept="image/*" data-local-background-picker hidden />
      </div>
    `;

    const status = panel.querySelector('.atmosphere-status');
    if (status) panel.insertBefore(row, status);
    else panel.append(row);

    state.picker = row.querySelector('[data-local-background-picker]');
    state.trigger = row.querySelector('[data-action="toggle-background-menu"]');
    state.menu = row.querySelector('.atmosphere-local-background-menu');
    state.resetButton = row.querySelector('[data-action="reset-background"]');
    state.exploreButton = row.querySelector('[data-action="explore-backgrounds"]');
    state.gallery = row.querySelector('.atmosphere-local-background-gallery');

    state.trigger.addEventListener('click', () => {
      const opening = state.menu.hidden;
      closeMenu();
      if (!opening) return;
      state.menu.hidden = false;
      state.trigger.setAttribute('aria-expanded', 'true');
    });

    row.querySelector('[data-action="upload-background"]').addEventListener('click', () => {
      closeMenu();
      state.picker.click();
    });

    state.resetButton.addEventListener('click', () => {
      closeMenu();
      void clearBackground().finally(focusTrigger);
    });

    state.exploreButton.addEventListener('click', () => {
      const opening = state.gallery.hidden;
      if (opening) hydrateGallery();
      state.gallery.hidden = !opening;
      state.exploreButton.setAttribute('aria-expanded', String(opening));
    });

    state.gallery.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('[data-library-background]');
      if (!button) return;
      const fileName = button.dataset.libraryBackground || '';
      closeMenu();
      void chooseLibraryBackground(fileName).finally(focusTrigger);
    });

    state.picker.addEventListener('change', () => {
      const file = state.picker.files?.[0] || null;
      state.picker.value = '';
      void chooseFile(file).finally(focusTrigger);
    });

    document.addEventListener('pointerdown', (event) => {
      if (!row.contains(event.target)) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !state.menu || state.menu.hidden) return;
      event.preventDefault();
      closeMenu();
      focusTrigger();
    });

    syncControls();
    return true;
  }

  function watchForAtmospherePanel() {
    if (mountControls()) return;
    state.observer = new MutationObserver(() => {
      if (!mountControls()) return;
      state.observer?.disconnect();
      state.observer = null;
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  injectStyles();
  watchForAtmospherePanel();
  void restoreStoredBackground();

  window.GARBA_LOCAL_BACKGROUND = {
    get active() { return app.dataset.customBackground === 'true'; },
    get persistent() { return state.persistent; },
    get fileName() { return state.fileName; },
    get source() { return state.source; },
    pick() { state.picker?.click(); },
    explore() {
      if (!state.menu || !state.exploreButton || !state.gallery) return;
      state.menu.hidden = false;
      state.trigger?.setAttribute('aria-expanded', 'true');
      hydrateGallery();
      state.gallery.hidden = false;
      state.exploreButton.setAttribute('aria-expanded', 'true');
    },
    clear: clearBackground,
  };
})();
