import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('styles/80-genre-icon-images.css', 'utf8');
const polish = readFileSync('styles/30-product-polish.css', 'utf8');
const uxNext = readFileSync('src/optional/ux-next.js', 'utf8');

const checks = [
  [app.includes('function reconcileGenreButtons'), 'genre controls must reconcile existing DOM nodes in place'],
  [!app.includes('function renderGenreButtons'), 'destructive genre renderer must stay removed'],
  [!app.includes("container.innerHTML = ''"), 'genre containers must not be cleared during state changes'],
  [app.includes('function revealGenreHorizontally'), 'genre reveal must be owned by the player runtime'],
  [!app.includes('scrollIntoView('), 'player runtime must not use generic two-axis scrollIntoView for genres'],
  [!html.includes("Object.defineProperty(button, 'scrollIntoView'"), 'page-level scrollIntoView monkey patch must stay removed'],
  [html.includes('app.js?v=20260908.2'), 'player runtime version token must include the interaction-stability update'],
  [css.includes('touch-action: pan-x;'), 'genre touch behavior must remain horizontal'],
  [css.includes('overflow-y: hidden !important;'), 'genre strips must not regain vertical overflow'],
  [css.includes('-webkit-line-clamp: 2;'), 'Now Playing title must remain visually bounded to two lines'],
  [css.includes('overflow-wrap: anywhere;') && css.includes('max-height: 1.96em;'), 'Now Playing title must safely wrap mixed-script and unbroken text inside its two-line slot'],
  [css.includes('font-size: clamp(40px, 4.1vw, 47px);'), 'desktop Now Playing title must keep a two-line-safe size cap'],
  [css.includes('grid-template-rows: 12px minmax(0, 1fr) 18px;'), 'short-landscape Now Playing rows must reserve independent title and artist slots'],
  [!polish.includes('html body .app .track-block .song-title') && !polish.includes('html body .app .track-block .artist-row'), 'product polish must not re-own Now Playing title or artist geometry'],
  [css.includes('.app .track-block {') && css.includes('height: 146px;') && css.includes('height: 126px;'), 'Now Playing frame must stay fixed on desktop and mobile'],
  [css.includes('.track-details-button') && css.includes('.track-details-panel'), 'clipped Now Playing metadata must have a dedicated in-frame disclosure presentation'],
  [css.includes('.track-block.has-track-details .artist-row') && css.includes('position: absolute;'), 'full-title disclosure must reserve an edge lane without adding a new layout row'],
  [css.includes('.track-details-button:focus-visible') && css.includes('outline: 2px solid var(--accent);'), 'full-title disclosure must keep a visible keyboard focus treatment'],
  [uxNext.includes("button.textContent = 'Details';") && uxNext.includes("button.setAttribute('aria-controls', 'nowPlayingDetails');"), 'full-title disclosure must use a named native button controlling the details surface'],
  [uxNext.includes("button.setAttribute('aria-expanded', 'true');") && uxNext.includes("button.setAttribute('aria-expanded', 'false');"), 'full-title disclosure must expose its open/closed state programmatically'],
  [uxNext.includes('element.scrollHeight > element.clientHeight + 1') && uxNext.includes('element.scrollWidth > element.clientWidth + 1'), 'full-title disclosure must detect actual rendered clipping rather than rewrite canonical metadata'],
  [uxNext.includes("event.key !== 'Escape' || panel.hidden") && uxNext.includes('closeNowPlayingDetails({ restoreFocus: true });'), 'full-title disclosure must support Escape dismissal with logical focus restoration'],
  [uxNext.includes("app.dataset.sheetSnap !== 'closed'") && uxNext.includes('closeNowPlayingDetails();'), 'opening a player sheet must close the temporary full-title disclosure'],
  [uxNext.includes("setTextIfChanged(detailTitle, title);") && uxNext.includes("setTextIfChanged(detailArtist, artist);"), 'full-title disclosure must present the exact current DOM title and artist credit'],
  [css.includes('.network-status.show {') && css.includes('font-size: 0;'), 'mobile offline state must not widen the utility row'],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error('Player layout stability validation failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('Player layout stability contract OK.');
