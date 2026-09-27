(() => {
  if (document.body?.dataset.page !== 'install') return;

  const ua = navigator.userAgent || '';
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const platform = /iPhone|iPad|iPod/i.test(ua) || isIPadDesktopMode
    ? 'ios'
    : /Android/i.test(ua)
      ? 'android'
      : 'desktop';

  const browser = /CriOS/i.test(ua)
    ? 'chrome-ios'
    : /Edg\//i.test(ua)
      ? 'edge'
      : /Chrome\//i.test(ua)
        ? 'chrome'
        : /Safari\//i.test(ua) && !/Chrome\//i.test(ua)
          ? 'safari'
          : 'other';

  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.browser = browser;

  const readout = document.getElementById('platformReadout');
  const title = document.getElementById('platformTitle');
  const copy = document.getElementById('platformCopy');
  const badge = document.getElementById('platformBadge');

  const guidance = {
    ios: {
      title: 'iPhone or iPad detected',
      copy: browser === 'chrome-ios'
        ? 'You can add PlayGarba from Chrome, but Safari gives the clearest web-app route with Add to Home Screen → Open as Web App.'
        : 'Open the live player in Safari, then use Share → Add to Home Screen → Open as Web App.',
      badge: browser === 'chrome-ios' ? 'Safari recommended' : 'Safari route',
    },
    android: {
      title: 'Android detected',
      copy: 'Open the live player in Chrome, then use the browser menu → Install and create shortcut → Install.',
      badge: 'Chrome route',
    },
    desktop: {
      title: 'Desktop browser detected',
      copy: browser === 'edge'
        ? 'In Edge, open the live player and use Settings and more → More tools → Apps → Install this site as an app.'
        : browser === 'safari'
          ? 'In Safari on Mac, open the live player, then use Share → Add to Dock.'
          : browser === 'chrome'
            ? 'In Chrome, open the live player and use the Install icon or More → Cast, save, and share → Install page as app.'
            : 'Use your browser’s install or create-shortcut option if available. On Mac, Safari supports Share → Add to Dock; Chrome and Edge also provide site-install options on supported desktop systems.',
      badge: browser === 'edge'
        ? 'Edge route'
        : browser === 'safari'
          ? 'Safari route'
          : browser === 'chrome'
            ? 'Chrome route'
            : 'Browser-dependent',
    },
  };

  const selected = guidance[platform];
  if (readout && title && copy && badge && selected) {
    title.textContent = selected.title;
    copy.textContent = selected.copy;
    badge.textContent = selected.badge;
    readout.hidden = false;
  }
})();
