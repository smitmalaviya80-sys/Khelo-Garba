import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const source = await readFile(path.join(root, 'nonstop-browser.js'), 'utf8');

let failed = false;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failed = true;
};

for (const marker of [
  'function visualGenreForSet(set)',
  "['raas-dandiya', 'dandiya']",
  "['mataji-devotional', 'devotional']",
  "['folk-lokgeet', 'folk']",
  "['sanedo', 'sanedo']",
  "['electronic-fusion', 'fusion']",
  'genre: visualGenreForSet(set)',
  'function syncMainTransport(active)',
  "queueButton.setAttribute('aria-label', 'Choose Nonstop recording')",
  '.app[data-play-mode=\"nonstop\"] #prevButton',
  "queueBadge?.classList.remove('show')",
  "target.closest('#queueButton')",
  'function captureNonstopKeyboard(event)',
  "document.addEventListener('keydown', captureNonstopKeyboard, { capture: true })",
  "state.metadataObserver.observe(queueBadge, { childList: true, characterData: true, subtree: true })",
  'function recordingPresentation(set)',
  "label: 'Chaptered recording'",
  "label: 'Full recording'",
  'One recording · ${chapterCount} chapter',
  'One full recording · no chapter map',
  'One full recording · ${tracklistCount} songs listed · no timestamps',
  'const eyebrowText = `Nonstop · ${recording.label}`',
  'album: recording.mediaAlbum',
  'function verifiedChaptersForSet(set)',
  'segment?.startSeconds',
  'function currentChapterIndexFor(chapters, elapsedSeconds)',
  'function seekNonstopChapter(chapter, chapterIndex)',
  'window.GARBA_YOUTUBE_PLAYER?.seekTo?.(current.startSeconds)',
  'function renderChapterNavigation()',
  'id="nonstopBrowserChapters" hidden',
  'data-nonstop-chapter-index',
  "button.setAttribute('aria-current', 'true')",
  'function watchChapterTime()',
  'state.chapterObserver.observe(elapsed, { childList: true, characterData: true, subtree: true })',
  'watchChapterTime();',
]) {
  if (!source.includes(marker)) fail(`Nonstop UX contract is missing: ${marker}`);
}

for (const marker of [
  'grid-template-columns:max-content minmax(0,1fr) 44px',
  'grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px 14px',
  'font-variant-numeric:tabular-nums',
  'id="nonstopBrowserSearch" type="search"',
  'aria-label="Search Nonstop Garba" placeholder="Search"',
  'class="nonstop-set-duration" aria-hidden="true"',
  "panel.setAttribute('tabindex', '-1')",
  'requestAnimationFrame(() => panel?.focus({ preventScroll: true }))',
  'Loading Nonstop Garba…',
  'No Nonstop Garba matches this search.',
]) {
  if (!source.includes(marker)) fail(`Clean Nonstop chooser contract is missing: ${marker}`);
}

const chooserStart = source.indexOf('function ensureBrowser()');
const chooserEnd = source.indexOf('\n  function focusableElements()', chooserStart);
const chooser = chooserStart >= 0 && chooserEnd > chooserStart
  ? source.slice(chooserStart, chooserEnd)
  : '';
if (!chooser) fail('Nonstop chooser render block is missing');
for (const removed of [
  'Continuous YouTube listening',
  'nonstopBrowserSummary',
  'nonstop-set-recording',
  'nonstop-set-badges',
  'nonstop-set-badge youtube',
  'one choice = one recording',
]) {
  if (chooser.includes(removed)) fail(`Normal Nonstop chooser must not render removed presentation: ${removed}`);
}

const chapterBuilderStart = source.indexOf('function verifiedChaptersForSet(set)');
const chapterBuilderEnd = source.indexOf('\n  function ', chapterBuilderStart + 1);
const chapterBuilder = chapterBuilderStart >= 0
  ? source.slice(chapterBuilderStart, chapterBuilderEnd > chapterBuilderStart ? chapterBuilderEnd : undefined)
  : '';
if (!chapterBuilder) fail('Verified Nonstop chapter builder is missing');
if (!chapterBuilder.includes('segment?.startSeconds')) fail('Nonstop chapters must use published segment startSeconds');
if (!chapterBuilder.includes('segment?.title')) fail('Nonstop chapters must preserve published segment titles');
if (!chapterBuilder.includes('return invalid ? [] : chapters')) fail('Incomplete or non-monotonic chapter maps must fail closed');
for (const inferredBoundary of ['endSeconds', 'durationSeconds', 'tracklist']) {
  if (chapterBuilder.includes(inferredBoundary)) fail(`Nonstop chapter navigation must not infer boundaries from ${inferredBoundary}`);
}

const chapterSeekStart = source.indexOf('function seekNonstopChapter(chapter, chapterIndex)');
const chapterSeekEnd = source.indexOf('\n  function ', chapterSeekStart + 1);
const chapterSeek = chapterSeekStart >= 0
  ? source.slice(chapterSeekStart, chapterSeekEnd > chapterSeekStart ? chapterSeekEnd : undefined)
  : '';
if (!chapterSeek.includes('GARBA_YOUTUBE_PLAYER?.seekTo?.(current.startSeconds)')) fail('Chapter jumps must use the existing public YouTube seek contract');
for (const transport of ['#prevButton', '#nextButton', '#miniPrev', '#miniNext']) {
  if (chapterSeek.includes(transport)) fail(`Chapter jumps must not repurpose ordinary transport: ${transport}`);
}

const trackForSetStart = source.indexOf('function trackForSet(set)');
const trackForSetEnd = source.indexOf('\n  function ', trackForSetStart + 1);
const trackForSet = trackForSetStart >= 0
  ? source.slice(trackForSetStart, trackForSetEnd > trackForSetStart ? trackForSetEnd : undefined)
  : '';
if (!trackForSet) fail('Nonstop synthetic-track builder is missing');
if (trackForSet.includes("genre: 'traditional'")) fail('Nonstop synthetic tracks must not hard-code every set as Traditional');

const navigationStart = source.indexOf('function captureMainNavigation(event)');
const navigationEnd = source.indexOf('\n  function ', navigationStart + 1);
const navigation = navigationStart >= 0
  ? source.slice(navigationStart, navigationEnd > navigationStart ? navigationEnd : undefined)
  : '';
if (!navigation.includes('openBrowser();')) fail('Nonstop chooser action must open the Nonstop chooser');
for (const retiredControl of ['#prevButton', '#nextButton', '#miniPrev', '#miniNext']) {
  if (navigation.includes(retiredControl)) fail(`Nonstop previous/next control must not be repurposed as chooser navigation: ${retiredControl}`);
}
if (source.includes("Choose another Nonstop recording")) fail('Nonstop previous/next controls must not be relabeled as set chooser actions');
if (navigation.includes("announce('Nonstop Garba plays continuously.")) fail('Nonstop transport must not stop at a toast instead of offering the chooser');

if (/\b(?:tracks?|songs?)\s+up\s+next\b/i.test(source)) {
  fail('Nonstop UI must not describe chapters inside one recording as queued tracks/songs');
}

if (failed) process.exit(1);
console.log('✓ Nonstop keeps one truthful chooser action and hides misleading previous/next affordances');
console.log('✓ chooser rows stay minimal: title, artist/year and duration only');
console.log('✓ Now Playing and Media Session metadata identify the active Nonstop recording format');
console.log('✓ chooser header, gutters, mobile two-column rows and dialog focus are regression-guarded');
console.log('✓ Nonstop synthetic tracks derive their visual genre from verified set categories');
console.log('✓ Nonstop queue accessibility state is reasserted when ordinary queue metadata changes');
console.log('✓ verified Nonstop chapters fail closed on incomplete timestamps, track elapsed playback, and jump through the existing seek contract');
