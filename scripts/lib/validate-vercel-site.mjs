import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const SITE = resolve(process.argv[2] || '_site');
const CONFIG = resolve(process.argv[3] || 'vercel.json');

function fail(message) {
  throw new Error(message);
}

function requireFile(relativePath) {
  const path = join(SITE, relativePath);
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`Missing deployed file: ${relativePath}`);
  }
  return path;
}

function requireDirectory(relativePath) {
  const path = join(SITE, relativePath);
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail(`Missing deployed directory: ${relativePath}`);
  }
  return path;
}

function text(relativePath) {
  return readFileSync(requireFile(relativePath), 'utf8');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    fail(`Expected PNG: ${path}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

for (const runtime of [
  'index.html',
  'app.js',
  'simple-runtime.js',
  'provider-runtime.js',
  'player-continuity.js',
  'youtube-player-runtime.js',
  'nonstop-browser.js',
  'sw.js',
  'manifest.webmanifest',
  'offline.html',
  'robots.txt',
  'sitemap.xml',
  'styles.css',
  'favicon.ico',
  'build-info.json',
]) {
  requireFile(runtime);
}

const app = text('app.js');
if (!app.includes('GARBA_SEEK_STATE_RUNTIME')) fail('Seek-state runtime is missing from deployed app.js.');
if (!app.includes('GARBA_CONTINUOUS_SET_RUNTIME')) fail('Continuous-set runtime is missing from deployed app.js.');
if (text('styles.css').includes('@import')) fail('Production styles.css still contains @import.');

for (const route of [
  'catalogue',
  'explore',
  'about',
  'dandiya-raas',
  'faq',
  'garba-attire-and-craft',
  'garba-music',
  'garba-vs-dandiya',
  'garbo',
  'history-of-garba',
  'how-to-use',
  'install',
  'learn',
  'live',
  'navratri-2026',
  'navratri-and-garba',
  'what-is-garba',
]) {
  requireFile(`${route}/index.html`);
}

for (const route of [
  'catalogue',
  'explore',
]) {
  for (const file of [
    'catalogue.css',
    'catalogue.js',
    'listening-library.js',
    'explore-continuity-bridge.js',
  ]) {
    requireFile(`${route}/${file}`);
  }
}

if (existsSync(join(SITE, 'songs'))) fail('Standalone song pages must not be deployed.');
if (existsSync(join(SITE, 'releases'))) fail('Standalone release pages must not be deployed.');

const homepage = text('index.html');
if (!homepage.includes('href="./explore/"')) fail('Homepage Explore link is missing.');
if (!homepage.includes('<span>Explore</span>')) fail('Homepage Explore label is missing.');
if (/id="browseButton"[^>]*aria-controls/.test(homepage)) fail('Explore retained obsolete song-sheet semantics.');

if (!homepage.includes('<link rel="canonical" href="https://playgarba.com/"')) {
  fail('Player canonical must remain on https://playgarba.com/.');
}
if (!text('explore/index.html').includes('<link rel="canonical" href="https://playgarba.com/explore/"')) {
  fail('Explore canonical must remain on https://playgarba.com/explore/.');
}
if (!text('navratri-2026/index.html').includes('<link rel="canonical" href="https://playgarba.com/navratri-2026/"')) {
  fail('Navratri 2026 canonical is invalid.');
}

const robots = text('robots.txt');
if (!robots.includes('Sitemap: https://playgarba.com/sitemap.xml')) {
  fail('robots.txt is missing the canonical sitemap.');
}

const sitemap = text('sitemap.xml');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!sitemapUrls.length) fail('sitemap.xml contains no canonical URLs.');

for (const url of sitemapUrls) {
  if (!url.startsWith('https://playgarba.com/')) fail(`Sitemap URL uses the wrong origin: ${url}`);
  if (url.includes('?') || url.includes('#')) fail(`Sitemap URL contains application state: ${url}`);

  const pathname = new URL(url).pathname;
  const relativePath = pathname === '/'
    ? 'index.html'
    : `${pathname.replace(/^\/|\/$/g, '')}/index.html`;
  requireFile(relativePath);
}

const library = requireDirectory('assets/backgrounds/library');
const webps = readdirSync(library).filter((name) => name.endsWith('.webp'));
if (webps.length !== 15) fail(`Expected 15 expanded background WebPs, found ${webps.length}.`);

const backgrounds = requireDirectory('assets/backgrounds');
const deployedZips = readdirSync(backgrounds).filter((name) => /^garba15-.*\.zip$/i.test(name));
if (deployedZips.length) fail(`Background source packs leaked into deployment: ${deployedZips.join(', ')}`);

for (const [file, width, height] of [
  ['assets/icons/favicon-16.png', 16, 16],
  ['assets/icons/favicon-32.png', 32, 32],
  ['assets/icons/favicon-48.png', 48, 48],
  ['assets/icons/apple-touch-icon-152.png', 152, 152],
  ['assets/icons/apple-touch-icon-167.png', 167, 167],
  ['assets/icons/apple-touch-icon.png', 180, 180],
  ['assets/icons/icon-192.png', 192, 192],
  ['assets/icons/icon-512.png', 512, 512],
  ['assets/icons/mstile-150x150.png', 150, 150],
  ['assets/icons/mstile-310x310.png', 310, 310],
  ['assets/icons/maskable-192.png', 192, 192],
  ['assets/icons/maskable-512.png', 512, 512],
  ['assets/social/garba-og-card.png', 1200, 630],
]) {
  const dimensions = pngDimensions(requireFile(file));
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(`${file} is ${dimensions.width}x${dimensions.height}, expected ${width}x${height}.`);
  }
}

const htmlFiles = [];
function collectHtml(directory, prefix = '') {
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const stats = statSync(absolute);
    if (stats.isDirectory()) collectHtml(absolute, relative);
    else if (name.endsWith('.html')) htmlFiles.push(relative);
  }
}
collectHtml(SITE);

for (const file of htmlFiles) {
  const content = text(file);
  if (!content.includes('https://playgarba.com/assets/social/garba-og-card.png')) {
    fail(`Universal social preview missing from ${file}.`);
  }
  if (!content.includes('apple-touch-icon-167.png')) {
    fail(`Brand icon metadata missing from ${file}.`);
  }
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
if (config.outputDirectory !== '_site') fail('vercel.json must deploy _site.');
if (config.buildCommand !== 'node scripts/build-vercel-site.mjs') {
  fail('vercel.json must use the audited Vercel site builder.');
}
if (config.installCommand !== '') fail('vercel.json must not add an unrelated package install step.');

const configText = JSON.stringify(config);
if (/\bimmutable\b/i.test(configText)) {
  fail('Current stable-named assets must not be marked immutable.');
}

const headerRules = Array.isArray(config.headers) ? config.headers : [];
function cacheValueFor(source, key = 'Cache-Control') {
  const rule = headerRules.find((candidate) => candidate.source === source);
  const header = rule?.headers?.find((candidate) => candidate.key === key);
  return header?.value || '';
}

for (const source of [
  '/',
  '/explore/',
  '/catalogue/',
  '/sw.js',
  '/build-info.json',
  '/manifest.webmanifest',
  '/data/(.*)',
  '/(.*)\\.js',
  '/(.*)\\.css',
]) {
  const value = cacheValueFor(source);
  if (!value.includes('max-age=0') || !value.includes('must-revalidate')) {
    fail(`Missing revalidation cache policy for ${source}.`);
  }
}

for (const source of [
  '/assets/backgrounds/(.*)',
  '/assets/genre-icons/(.*)',
  '/favicon.ico',
  '/assets/icons/(.*)',
  '/assets/social/(.*)',
]) {
  const browserValue = cacheValueFor(source);
  const edgeValue = cacheValueFor(source, 'Vercel-CDN-Cache-Control');
  if (!browserValue.includes('max-age=3600')) {
    fail(`Expected bounded browser cache for ${source}.`);
  }
  if (!edgeValue.includes('max-age=604800')) {
    fail(`Expected bounded Vercel CDN cache for ${source}.`);
  }
}

console.log(`Vercel artifact validation passed for ${SITE}.`);
