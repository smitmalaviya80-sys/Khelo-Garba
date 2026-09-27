import { setTimeout as delay } from 'node:timers/promises';

const LIVE_ORIGIN = normaliseOrigin(process.env.PLAYGARBA_LIVE_ORIGIN || 'https://playgarba.com');
const PUBLIC_ORIGIN = normaliseOrigin(process.env.PLAYGARBA_PUBLIC_ORIGIN || 'https://playgarba.com');
const WWW_ORIGIN = normaliseOrigin(process.env.PLAYGARBA_WWW_ORIGIN || 'https://www.playgarba.com');
const ATTEMPTS = positiveInt(process.env.SMOKE_ATTEMPTS, 6);
const RETRY_DELAY_MS = positiveInt(process.env.SMOKE_RETRY_DELAY_MS, 5000);
const REQUEST_TIMEOUT_MS = positiveInt(process.env.SMOKE_TIMEOUT_MS, 12000);
const MODE = process.argv[2] || 'live';

function normaliseOrigin(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeXmlText(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textContent(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attributeFromTag(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag).match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '').trim() : null;
}

function metaContent(html, attribute, expectedValue) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const value = attributeFromTag(tag, attribute);
    if (!value || value.toLowerCase() !== String(expectedValue).toLowerCase()) continue;
    const content = attributeFromTag(tag, 'content');
    if (content !== null) return content;
  }
  return null;
}

function canonicalFrom(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = attributeFromTag(tag, 'rel');
    if (!rel || !rel.toLowerCase().split(/\s+/).includes('canonical')) continue;
    const href = attributeFromTag(tag, 'href');
    if (href) return href;
  }
  return null;
}

function pageMetadata(html) {
  const title = textContent(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const h1 = textContent(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  return {
    title,
    h1,
    canonical: canonicalFrom(html),
    description: metaContent(html, 'name', 'description'),
    robots: metaContent(html, 'name', 'robots'),
    ogUrl: metaContent(html, 'property', 'og:url'),
    ogTitle: metaContent(html, 'property', 'og:title'),
  };
}

function parseCanonicalSitemap(xml, origin = LIVE_ORIGIN) {
  const rawLocs = [...String(xml).matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXmlText(match[1]).trim())
    .filter(Boolean);

  assert(rawLocs.length > 0, 'Sitemap contains no <loc> entries');

  const seen = new Set();
  const urls = [];
  for (const rawLoc of rawLocs) {
    let url;
    try {
      url = new URL(rawLoc);
    } catch {
      throw new Error(`Sitemap URL must be absolute: ${rawLoc}`);
    }

    assert(url.protocol === 'https:', `Sitemap URL must use HTTPS: ${rawLoc}`);
    assert(url.origin === origin.origin, `Sitemap URL escaped canonical origin ${origin.origin}: ${rawLoc}`);
    assert(!url.search && !url.hash, `Sitemap URL must not contain query/hash state: ${rawLoc}`);
    assert(url.pathname === '/' || (url.pathname.startsWith('/') && url.pathname.endsWith('/')), `Sitemap URL must use a trailing-slash route: ${rawLoc}`);
    assert(!url.pathname.includes('//'), `Sitemap URL contains a malformed path: ${rawLoc}`);
    assert(!seen.has(url.href), `Sitemap contains duplicate <loc>: ${url.href}`);

    seen.add(url.href);
    urls.push(url);
  }

  return urls;
}

function validateSearchHtml(html, expectedUrl) {
  assert(/<html\b/i.test(html), `${expectedUrl.pathname} did not return HTML`);
  assert(/PlayGarba|GARBA/i.test(html), `${expectedUrl.pathname} is missing the PlayGarba product marker`);

  const metadata = pageMetadata(html);
  assert(metadata.title, `${expectedUrl.pathname} is missing a non-empty <title>`);
  assert(metadata.description?.trim(), `${expectedUrl.pathname} is missing a non-empty meta description`);
  assert(metadata.h1, `${expectedUrl.pathname} is missing a non-empty <h1>`);
  assert(metadata.canonical === expectedUrl.href, `${expectedUrl.pathname} canonical was ${metadata.canonical || 'missing'}, expected ${expectedUrl.href}`);
  assert(metadata.ogUrl === expectedUrl.href, `${expectedUrl.pathname} og:url was ${metadata.ogUrl || 'missing'}, expected ${expectedUrl.href}`);
  assert(metadata.ogTitle?.trim(), `${expectedUrl.pathname} is missing a non-empty og:title`);
  assert(!String(metadata.robots || '').toLowerCase().split(/[\s,]+/).includes('noindex'), `${expectedUrl.pathname} is noindex but appears in the production sitemap`);
  return metadata;
}

function expectFailure(name, fn, expectedPattern) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expectedPattern.test(message), `${name} failed for the wrong reason: ${message}`);
    return;
  }
  throw new Error(`${name} unexpectedly passed`);
}

function runSelfTests() {
  const validXml = `<?xml version="1.0"?><urlset><url><loc>${LIVE_ORIGIN.href}</loc></url><url><loc>${new URL('/explore/', LIVE_ORIGIN).href}</loc></url></urlset>`;
  const urls = parseCanonicalSitemap(validXml);
  assert(urls.length === 2, `valid sitemap should expose 2 URLs, got ${urls.length}`);

  expectFailure(
    'duplicate sitemap URL',
    () => parseCanonicalSitemap(`<?xml version="1.0"?><urlset><url><loc>${LIVE_ORIGIN.href}</loc></url><url><loc>${LIVE_ORIGIN.href}</loc></url></urlset>`),
    /duplicate/i,
  );
  expectFailure(
    'query sitemap URL',
    () => parseCanonicalSitemap(`<?xml version="1.0"?><urlset><url><loc>${new URL('/explore/?genre=folk', LIVE_ORIGIN).href}</loc></url></urlset>`),
    /query\/hash/i,
  );
  expectFailure(
    'off-origin sitemap URL',
    () => parseCanonicalSitemap('<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>'),
    /escaped canonical origin/i,
  );

  const expected = new URL('/guide/', LIVE_ORIGIN);
  const validHtml = `<!doctype html><html><head><title>Guide | PlayGarba</title><meta name="description" content="Useful guide"><link rel="canonical" href="${expected.href}"><meta property="og:url" content="${expected.href}"><meta property="og:title" content="Guide | PlayGarba"></head><body><h1>Guide</h1></body></html>`;
  validateSearchHtml(validHtml, expected);
  expectFailure('missing description', () => validateSearchHtml(validHtml.replace('<meta name="description" content="Useful guide">', ''), expected), /meta description/i);
  expectFailure('wrong canonical', () => validateSearchHtml(validHtml.replace(expected.href, LIVE_ORIGIN.href), expected), /canonical was/i);

  console.log('Production smoke self-tests passed (7 cases).');
}

async function requestWithRetry(url, { as = 'text', redirect = 'follow', requireOk = true } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'cache-control': 'no-cache',
          'user-agent': 'PlayGarba-production-smoke/1.2',
        },
        redirect,
        signal: controller.signal,
      });

      if (requireOk && !response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const body = as === 'buffer'
        ? Buffer.from(await response.arrayBuffer())
        : await response.text();

      clearTimeout(timer);
      return { response, body };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Attempt ${attempt}/${ATTEMPTS} failed for ${url}: ${message}`);
      if (attempt < ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }

  throw new Error(`Unable to fetch ${url} after ${ATTEMPTS} attempts: ${lastError?.message || lastError}`);
}

async function fetchFromOrigin(origin, path, options) {
  const requested = new URL(path, origin);
  const result = await requestWithRetry(requested, options);
  const finalUrl = new URL(result.response.url);
  assert(finalUrl.origin === origin.origin, `${requested} unexpectedly redirected off ${origin.origin} to ${finalUrl}`);
  return { ...result, requested, finalUrl };
}

async function verifyPlayerHtml(path, expectedCanonical = LIVE_ORIGIN.href) {
  const { body: html } = await fetchFromOrigin(LIVE_ORIGIN, path);
  assert(/<html\b/i.test(html), `${path} did not return HTML`);
  assert(/PlayGarba/i.test(html), `${path} is missing the PlayGarba product marker`);
  const canonical = canonicalFrom(html);
  assert(canonical === expectedCanonical, `${path} canonical was ${canonical || 'missing'}, expected ${expectedCanonical}`);
  assert(html.includes('https://playgarba.com/'), `${path} does not expose the canonical apex origin`);
  return html;
}

async function verifyCanonicalSearchSurface(origin = LIVE_ORIGIN) {
  const sitemapUrl = new URL('/sitemap.xml', origin);
  const { body: robots } = await fetchFromOrigin(origin, '/robots.txt');
  assert(robots.includes(`Sitemap: ${sitemapUrl.href}`), 'robots.txt does not advertise the canonical sitemap');

  const { body: sitemap, finalUrl: finalSitemapUrl } = await fetchFromOrigin(origin, '/sitemap.xml');
  assert(finalSitemapUrl.href === sitemapUrl.href, `sitemap.xml unexpectedly resolved to ${finalSitemapUrl.href}`);
  const urls = parseCanonicalSitemap(sitemap, origin);

  for (const url of urls) {
    const { body: html, finalUrl } = await requestWithRetry(url).then(({ response, body }) => ({ body, finalUrl: new URL(response.url) }));
    assert(finalUrl.origin === origin.origin, `${url.href} redirected off ${origin.origin} to ${finalUrl.href}`);
    assert(finalUrl.href === url.href, `${url.href} resolved to ${finalUrl.href} instead of its canonical sitemap URL`);
    validateSearchHtml(html, url);
  }

  console.log(`Production search surface passed for ${urls.length} canonical sitemap route(s).`);
  return urls.length;
}

async function verifyLive() {
  console.log(`Verifying canonical production origin: ${LIVE_ORIGIN.href}`);

  const root = await verifyPlayerHtml('/');
  assert(/rel=["']manifest["']/i.test(root), 'Player root is missing its web app manifest link');

  await verifyPlayerHtml('/?genre=traditional');
  await verifyPlayerHtml('/?nonstop=1');
  await verifyPlayerHtml('/?browse=1');
  await verifyPlayerHtml('/explore/', new URL('/explore/', LIVE_ORIGIN).href);

  const sitemapRouteCount = await verifyCanonicalSearchSurface(LIVE_ORIGIN);

  const manifestUrl = new URL('/manifest.webmanifest', LIVE_ORIGIN);
  const { body: manifestText, response: manifestResponse } = await fetchFromOrigin(LIVE_ORIGIN, '/manifest.webmanifest');
  const manifest = JSON.parse(manifestText);
  assert(/json/i.test(manifestResponse.headers.get('content-type') || '') || manifestText.trim().startsWith('{'), 'Manifest did not look like JSON');
  assert(manifest.name === 'PlayGarba', `Unexpected manifest name: ${manifest.name}`);
  assert(manifest.display === 'standalone', `Manifest display must remain standalone, got ${manifest.display}`);
  assert(typeof manifest.start_url === 'string' && manifest.start_url.length > 0, 'Manifest start_url is missing');
  assert(typeof manifest.scope === 'string' && manifest.scope.length > 0, 'Manifest scope is missing');
  assert(new URL(manifest.start_url, manifestUrl).origin === LIVE_ORIGIN.origin, 'Manifest start_url escaped the canonical production origin');
  assert(new URL(manifest.scope, manifestUrl).origin === LIVE_ORIGIN.origin, 'Manifest scope escaped the canonical production origin');
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest icons are incomplete');
  assert(manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')), 'Manifest is missing a maskable icon');

  const { body: serviceWorker } = await fetchFromOrigin(LIVE_ORIGIN, '/sw.js');
  assert(serviceWorker.length > 500, 'Service worker response is unexpectedly small');
  assert(/addEventListener\s*\(\s*['"]fetch['"]/i.test(serviceWorker), 'Service worker is missing its fetch handler');

  const { body: offline } = await fetchFromOrigin(LIVE_ORIGIN, '/offline.html');
  assert(/<html\b/i.test(offline), 'Offline shell did not return HTML');

  const { body: socialCard, response: socialResponse } = await fetchFromOrigin(LIVE_ORIGIN, '/assets/social/garba-og-card.png', { as: 'buffer' });
  assert((socialResponse.headers.get('content-type') || '').includes('image/png'), 'OG card did not return image/png');
  assert(socialCard.length > 10000, `OG card is unexpectedly small (${socialCard.length} bytes)`);

  console.log(`Canonical production smoke passed, including ${sitemapRouteCount} sitemap route(s), player deep links and PWA resources.`);
}

async function verifyPublic() {
  console.log(`Verifying public search surface origin: ${PUBLIC_ORIGIN.href}`);
  await verifyCanonicalSearchSurface(PUBLIC_ORIGIN);
  console.log('Public website production search smoke passed.');
}

async function verifyWww() {
  console.log(`Verifying www redirect: ${WWW_ORIGIN.href} → ${PUBLIC_ORIGIN.href}`);
  const { response } = await requestWithRetry(WWW_ORIGIN, {
    redirect: 'manual',
    requireOk: false,
  });

  assert([301, 308].includes(response.status), `www must use a permanent redirect (301 or 308), got HTTP ${response.status}`);
  const location = response.headers.get('location');
  assert(location, 'www redirect is missing a Location header');
  const target = new URL(location, WWW_ORIGIN);
  assert(target.href === PUBLIC_ORIGIN.href, `www redirects to ${target.href}, expected ${PUBLIC_ORIGIN.href}`);

  console.log('www permanent redirect verification passed.');
}

try {
  if (MODE === 'self-test') runSelfTests();
  else if (MODE === 'live') await verifyLive();
  else if (MODE === 'public') await verifyPublic();
  else if (MODE === 'www') await verifyWww();
  else throw new Error(`Unknown mode "${MODE}". Use "self-test", "live", "public" or "www".`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
