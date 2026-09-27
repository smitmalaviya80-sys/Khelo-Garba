import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [pages, sw, bootstrap, manifest, socialSource, socialInjector, brandInjector, browserconfig, cataloguePage, catalogueRuntime, catalogueCss, listeningRuntime] = await Promise.all([
  read('.github/workflows/pages.yml'),
  read('sw.js'),
  read('simple-runtime.js'),
  read('manifest.webmanifest'),
  read('assets/social/playgarba-og-card.svg'),
  read('scripts/lib/inject-social-preview.mjs'),
  read('scripts/lib/inject-brand-metadata.mjs'),
  read('assets/icons/browserconfig.xml'),
  read('src/catalogue/index.html'),
  read('src/catalogue/catalogue.js'),
  read('src/catalogue/catalogue.css'),
  read('src/catalogue/listening-library.js'),
]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const runtimeFiles = [
  'simple-runtime.js',
  'provider-runtime.js',
  'player-continuity.js',
  'youtube-player-runtime.js',
  'nonstop-browser.js',
  'app.js',
  'sw.js',
];

for (const file of runtimeFiles) {
  if (!pages.includes(file)) fail(`Pages artifact contract does not mention ${file}`);
}

for (const file of ['provider-runtime.js', 'player-continuity.js', 'youtube-player-runtime.js']) {
  if (!sw.includes(`'./${file}'`)) fail(`PWA core shell does not cache ${file}`);
  if (!sw.includes(`'/${file}'`)) fail(`PWA fresh-runtime list does not include ${file}`);
}

for (const file of ['provider-runtime.js', 'player-continuity.js', 'youtube-player-runtime.js']) {
  if (!bootstrap.includes(file)) fail(`Fast bootstrap must load ${file}`);
}
const providerIndex = bootstrap.indexOf('provider-runtime.js');
const continuityIndex = bootstrap.indexOf('player-continuity.js');
const youtubeIndex = bootstrap.indexOf('youtube-player-runtime.js');
if (!(providerIndex >= 0 && continuityIndex > providerIndex && youtubeIndex > continuityIndex)) {
  fail('Playback runtime order must be provider-runtime.js → player-continuity.js → youtube-player-runtime.js');
}

for (const marker of [
  'shareCurrentTrack',
  'setupKeyboardGuard',
  'syncSheetModal',
  'syncNetworkStatus',
  'aria-valuetext',
  'data-save-data',
  'page-hidden',
]) {
  if (!bootstrap.includes(marker)) fail(`Fast bootstrap is missing interaction-hardening marker: ${marker}`);
}

// Garba Circle modules are imported by app.js from assets/runtime, which Pages copies whole.
const appSource = await read('app.js');
for (const file of ['assets/runtime/garba-circle.js', 'assets/runtime/garba-circle-controller.js', 'assets/runtime/qr-code.js', 'assets/runtime/live-sync.js', 'assets/runtime/sync-correction.js', 'assets/runtime/playable-order.js', 'assets/runtime/my-songs.js']) {
  if (!sw.includes(`'./${file}'`)) fail(`PWA core shell does not cache ${file}`);
  if (!sw.includes(`'/${file}'`)) fail(`PWA fresh-runtime list does not include ${file}`);
}
if (!appSource.includes("from './assets/runtime/garba-circle-controller.js'")) fail('app.js must load the Garba Circle controller from assets/runtime');
for (const module of ['live-sync.js', 'playable-order.js', 'my-songs.js']) {
  if (!appSource.includes(`from './assets/runtime/${module}'`)) fail(`app.js must load ${module} from assets/runtime`);
}
if (!pages.includes('cp -R assets data _site/')) fail('Pages must ship assets/runtime for app.js module imports');
// The Immersive view runtime loads from index.html, not app.js; Pages ships it with assets/ and the PWA keeps it fresh.
if (!sw.includes("'./assets/runtime/immersive-view.js?v=20260926-4'")) fail('PWA core shell does not cache the current versioned assets/runtime/immersive-view.js runtime');
if (!sw.includes("'/assets/runtime/immersive-view.js'")) fail('PWA fresh-runtime list does not include assets/runtime/immersive-view.js');

const q90Pack = 'garba15-2048-q90.zip';
const q90Sha = '4690046d30ecd5400b3fc953a2a93f877d64921a69955d2b5dc6aa0bd65a769d';
const legacyPack = 'garba15-2k.zip';
const q82Pack = 'garba15-2k-q82.zip';
for (const marker of [q90Pack, q90Sha, legacyPack, q82Pack, 'Deploying visual pack: $PACK']) {
  if (!pages.includes(marker)) fail(`Pages visual-pack contract is missing ${marker}`);
}
const q90Index = pages.indexOf(q90Pack);
const legacyIndex = pages.indexOf(legacyPack);
const q82Index = pages.indexOf(q82Pack);
if (!(q90Index >= 0 && legacyIndex > q90Index && q82Index > legacyIndex)) {
  fail('Pages must prefer Q90, then current 2K, then named Q82 fallback');
}
if (!pages.includes("rm -f _site/assets/backgrounds/library/*.webp")) {
  fail('Pages must clear stale extracted WebPs before unpacking the selected visual pack');
}
if (!pages.includes("test \"$WEBP_COUNT\" -eq 15")) {
  fail('Pages must require exactly 15 extracted WebPs');
}
if (!pages.includes("file \"$image\" | grep -q 'Web/P image'")) {
  fail('Pages must validate every extracted artwork file as WebP data');
}
if (!pages.includes('rm -f _site/assets/backgrounds/garba15-*.zip')) {
  fail('Pages must remove source visual-pack archives from the public artifact');
}

for (const marker of [
  'librsvg2-bin',
  'webp',
  'fonts-gfs-didot',
  '04-colourful-garba-courtyard-a.webp',
  'dwebp "$OG_BACKGROUND"',
  '_site/assets/social/playgarba-og-card.svg',
  '_site/assets/social/garba-og-card.png',
  'rsvg-convert -w 1200 -h 630',
  'PNG image data, 1200 x 630',
  'node scripts/lib/inject-social-preview.mjs _site',
  'SOCIAL_META_COUNT',
  'summary_large_image',
]) {
  if (!pages.includes(marker)) fail(`Pages social-preview contract is missing: ${marker}`);
}
for (const marker of [
  'width="1200" height="630"',
  'href="og-background.png"',
  'font-family="GFS Didot',
  'id="text-backdrop"',
  'feDropShadow',
  '>Play<tspan fill="#f2c744">Garba</tspan>.com</text>',
  '>All the Garba in the world.</text>',
]) {
  if (!socialSource.includes(marker)) fail(`Social preview source is missing: ${marker}`);
}
if (socialSource.includes('All Garba there is in the world')) {
  fail('Social preview source must not contain retired tagline copy');
}
if (socialSource.includes('Validation compatibility for')) {
  fail('Social preview source must not rely on hidden validation compatibility markers');
}
if (socialSource.includes('>PlayGarba.com</text>')) {
  fail('Social preview headline must use the current split Play/Garba/.com structure');
}
const imageUrl = 'https://playgarba.com/assets/social/garba-og-card.png';
for (const marker of [
  imageUrl,
  'PlayGarba.com · All the Garba in the world',
  'collectHtmlFiles',
  'og:image',
  'og:image:width',
  'og:image:height',
  'summary_large_image',
  'twitter:image',
]) {
  if (!socialInjector.includes(marker)) fail(`Social metadata injector is missing: ${marker}`);
}
if (socialInjector.includes('ruddvz.github.io/garba')) fail('Social metadata must not regress to the old GitHub Pages URL');

const pwaIcons = [
  ['assets/icons/icon-192.png', '192x192', 'any'],
  ['assets/icons/icon-512.png', '512x512', 'any'],
  ['assets/icons/maskable-192.png', '192x192', 'maskable'],
  ['assets/icons/maskable-512.png', '512x512', 'maskable'],
];
for (const [src, sizes, purpose] of pwaIcons) {
  for (const marker of [src, `\"sizes\": \"${sizes}\"`, `\"purpose\": \"${purpose}\"`]) {
    if (!manifest.includes(marker)) fail(`PWA manifest is missing icon contract marker: ${marker}`);
  }
  if (!sw.includes(`'./${src}'`)) fail(`PWA core shell does not cache ${src}`);
}

for (const marker of [
  'src/catalogue/index.html _site/catalogue/index.html',
  'src/catalogue/catalogue.css _site/catalogue/catalogue.css',
  'src/catalogue/catalogue.js _site/catalogue/catalogue.js',
  'src/catalogue/listening-library.js _site/catalogue/listening-library.js',
  'Return-user listening companion is missing',
]) {
  if (!pages.includes(marker)) fail(`Pages Explore contract is missing: ${marker}`);
}
for (const marker of [
  "'./explore/'",
  "'./explore/index.html'",
  "'./catalogue/catalogue.css'",
  "'./catalogue/catalogue.js'",
  "'./catalogue/listening-library.js'",
  "'/catalogue/catalogue.css'",
  "'/catalogue/catalogue.js'",
  "'/catalogue/listening-library.js'",
  'const isCatalogueNavigation = (pathname) =>',
  "pathname.endsWith('/catalogue/')",
  "pathname.endsWith('/explore/')",
  "const fallback = isCatalogueNavigation(url.pathname) ? './explore/index.html' : './index.html';",
  "const isJsonData = (pathname) => pathname.includes('/data/') && pathname.endsWith('.json');",
  'if (isJsonData(url.pathname)) {',
]) {
  if (!sw.includes(marker)) fail(`Explore PWA/offline contract is missing: ${marker}`);
}

for (const marker of [
  'id="catalogueSearch"',
  'id="catalogueCount"',
  'id="collectionHome"',
  'id="collectionDetail"',
  'id="backToCollections"',
  'id="releaseRail"',
  'id="catalogueSongList"',
  'src="listening-library.js"',
]) {
  if (!cataloguePage.includes(marker)) fail(`Explore page is missing required control: ${marker}`);
}
for (const marker of [
  'const SONG_BATCH_SIZE = 160;',
  'const RELEASE_BATCH_SIZE = 40;',
  'function renderReleases(songs, { limit = RELEASE_BATCH_SIZE } = {})',
  "function renderSongs(songs, title='All songs', { limit = SONG_BATCH_SIZE } = {})",
  "more.className = 'release-more';",
  "more.className = 'song-more';",
  'renderSongs(songs, title, { limit: limit + SONG_BATCH_SIZE })',
  'renderReleases(songs, { limit: limit + RELEASE_BATCH_SIZE })',
]) {
  if (!catalogueRuntime.includes(marker)) fail(`Explore progressive-render contract is missing: ${marker}`);
}
if (catalogueRuntime.includes('songs.slice(0, 300)')) fail('Explore must not silently truncate every song list at 300 rows');
if (catalogueRuntime.includes('items.slice(0, 40).forEach')) fail('Explore must not silently truncate every release rail at 40 cards');
for (const marker of [
  "const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');",
  "const motionBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';",
  'behavior:motionBehavior()',
  'function returnToCollections()',
  'if (history.state?.collection || history.state?.search)',
  "if (history.state?.search) history.replaceState({search:q},'',nextUrl);",
  "else history.pushState({search:q},'',nextUrl);",
  "if (event.key !== 'Escape' || els.detail.hidden) return;",
  'function renderLoadFailure(error)',
  "retry.className = 'retry-button';",
  "retry.textContent = 'Retry catalogue';",
  "window.addEventListener('online', () => {",
  'if (state.loadFailed) void start();',
]) {
  if (!catalogueRuntime.includes(marker)) fail(`Explore resilient UX contract is missing: ${marker}`);
}
for (const marker of [
  '.release-more',
  '.song-more',
  '.retry-button',
  '.catalogue-error',
  '.song-more:focus-visible',
  '.retry-button:focus-visible',
  '.release-more:focus-visible',
]) {
  if (!catalogueCss.includes(marker)) fail(`Explore resilient-state styling is missing: ${marker}`);
}

for (const marker of [
  "const SESSION_KEY = 'garba:session';",
  "const FAVOURITES_KEY = 'garba:favourites';",
  "heading.textContent = 'My Garba';",
  "kicker.textContent = kind === 'continue' ? 'Continue listening' : 'Saved';",
  'if (!hasListeningState(stored)) return;',
  'primeFavouriteSession(song)',
  'elapsed: 0',
  'sections.prepend(section)',
]) {
  if (!listeningRuntime.includes(marker)) fail(`Return-user Explore contract is missing: ${marker}`);
}

const renderedIcons = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-48.png', 48],
  ['apple-touch-icon-152.png', 152],
  ['apple-touch-icon-167.png', 167],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['mstile-150x150.png', 150],
  ['mstile-310x310.png', 310],
];
for (const [file, size] of renderedIcons) {
  if (!pages.includes(`rsvg-convert -w ${size} -h ${size} assets/icons/icon.svg -o _site/assets/icons/${file}`)) {
    fail(`Pages must render ${file} from the canonical icon.svg source`);
  }
}
for (const marker of [
  'icoutils',
  'icotool -c -o _site/favicon.ico',
  'MS Windows icon resource',
  'rsvg-convert -w 192 -h 192 assets/icons/maskable.svg',
  'rsvg-convert -w 512 -h 512 assets/icons/maskable.svg',
  'Maskable 192 icon is invalid',
  'Maskable 512 icon is invalid',
  'node scripts/lib/inject-brand-metadata.mjs _site',
  'BRAND_META_COUNT',
]) {
  if (!pages.includes(marker)) fail(`Pages icon-branding contract is missing: ${marker}`);
}
for (const marker of [
  'href="/favicon.ico"',
  'favicon-32.png',
  'favicon-16.png',
  'apple-touch-icon-152.png',
  'apple-touch-icon-167.png',
  'apple-touch-icon.png',
  'msapplication-TileColor',
  'msapplication-config',
  '/assets/icons/browserconfig.xml',
]) {
  if (!brandInjector.includes(marker)) fail(`Brand metadata injector is missing: ${marker}`);
}
for (const marker of [
  'square150x150logo',
  '/assets/icons/mstile-150x150.png',
  'square310x310logo',
  '/assets/icons/mstile-310x310.png',
  '<TileColor>#111323</TileColor>',
]) {
  if (!browserconfig.includes(marker)) fail(`browserconfig.xml is missing: ${marker}`);
}
for (const file of [
  'favicon.ico',
  'assets/icons/browserconfig.xml',
  'assets/icons/favicon-16.png',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon-48.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/apple-touch-icon-152.png',
  'assets/icons/apple-touch-icon-167.png',
  'assets/icons/mstile-150x150.png',
  'assets/icons/mstile-310x310.png',
]) {
  if (!sw.includes(`'./${file}'`)) fail(`PWA core shell does not cache ${file}`);
}

if (/['"]\.\/styles\/[^'"]+['"]/.test(sw)) {
  fail('PWA CORE_SHELL must not precache source CSS layers that Pages does not deploy');
}
const cacheGenerationMatch = sw.match(/const CACHE_NAME = `\$\{CACHE_PREFIX\}v(\d+)`;/);
const cacheGeneration = Number(cacheGenerationMatch?.[1]);
if (!Number.isInteger(cacheGeneration) || cacheGeneration < 16) {
  fail('PWA cache generation must be v16 or newer so an incoming worker can build a complete live cache before retiring the active generation');
}

if (failed) process.exit(1);
console.log('✓ Pages ships every direct and transitive playback runtime file');
console.log('✓ fast bootstrap contains production interaction hardening without adding another runtime request');
console.log('✓ PWA precache contains the YouTube engine and split playback runtime');
console.log('✓ Garba Circle, Live Radio sync, playable-first ordering and Add a song modules ship with assets/runtime and are precached network-first');
console.log('✓ provider route safety loads before the YouTube controllable engine');
console.log('✓ split playback runtime stays network-first across installed-app upgrades');
console.log('✓ Pages prefers the checksum-pinned Q90 visual pack and keeps legacy packs as fallback only');
console.log('✓ Pages verifies exactly 15 WebPs and strips source visual-pack ZIPs');
console.log('✓ Universal PlayGarba social preview uses the approved courtyard artwork and renders at 1200x630');
console.log('✓ PlayGarba ships regular and maskable 192/512 PWA icons and precaches the full install-icon matrix');
console.log('✓ Explore shell and return-user listening companion are precached with an offline navigation fallback');
console.log('✓ Browser favicons, Apple touch sizes and Windows tiles are generated from the canonical Garba emblem and injected across the deployed site');
console.log('✓ Explore long lists render progressively with explicit load-more controls instead of silent truncation');
console.log('✓ Explore history, Escape navigation, reduced motion and in-place catalogue recovery are regression-guarded');
console.log('✓ Return-user Explore only appears from real saved session/favourite state and favourite handoffs reset to 0:00');
