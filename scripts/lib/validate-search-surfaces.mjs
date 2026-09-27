import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL_ORIGIN = 'https://playgarba.com';
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseAttributes(tag = '') {
  const attrs = new Map();
  const source = String(tag).replace(/^<\/?[a-z0-9:-]+\s*/i, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attrs;
}

function collectTags(html, tagName) {
  return [...String(html).matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((match) => ({
    raw: match[0],
    attrs: parseAttributes(match[0]),
  }));
}

function extractPageMetadata(html) {
  const titles = [...String(html).matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) => cleanText(match[1])).filter(Boolean);
  const h1s = [...String(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => cleanText(match[1])).filter(Boolean);
  const links = collectTags(html, 'link');
  const anchors = collectTags(html, 'a');
  const metas = collectTags(html, 'meta');
  const canonicals = links
    .filter(({ attrs }) => String(attrs.get('rel') || '').toLowerCase().split(/\s+/).includes('canonical'))
    .map(({ attrs }) => String(attrs.get('href') || '').trim())
    .filter(Boolean);
  const hrefs = anchors
    .map(({ attrs }) => String(attrs.get('href') || '').trim())
    .filter(Boolean);

  const metaByName = new Map();
  const metaByProperty = new Map();
  for (const { attrs } of metas) {
    const content = String(attrs.get('content') || '').trim();
    const name = String(attrs.get('name') || '').toLowerCase();
    const property = String(attrs.get('property') || '').toLowerCase();
    if (name && !metaByName.has(name)) metaByName.set(name, content);
    if (property && !metaByProperty.has(property)) metaByProperty.set(property, content);
  }

  return {
    titles,
    h1s,
    canonicals,
    hrefs,
    description: metaByName.get('description') || '',
    robots: metaByName.get('robots') || '',
    ogUrl: metaByProperty.get('og:url') || '',
    ogTitle: metaByProperty.get('og:title') || '',
    ogImage: metaByProperty.get('og:image') || '',
  };
}

function normalizeRoute(route) {
  const value = String(route || '').trim();
  if (!value || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function canonicalUrlForRoute(route) {
  return `${CANONICAL_ORIGIN}${normalizeRoute(route)}`;
}

function crawlTargetUrl(href, sourceRoute) {
  try {
    const parsed = new URL(String(href || '').trim(), canonicalUrlForRoute(sourceRoute));
    if (parsed.protocol !== 'https:' || parsed.origin !== CANONICAL_ORIGIN || parsed.search || parsed.hash) return null;
    const pathname = parsed.pathname.endsWith('/index.html')
      ? parsed.pathname.slice(0, -'index.html'.length)
      : parsed.pathname;
    return canonicalUrlForRoute(pathname);
  } catch {
    return null;
  }
}

function validateCanonicalUrl(raw, label, errors) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${label}: invalid absolute URL: ${raw || '(missing)'}`);
    return null;
  }
  if (parsed.protocol !== 'https:') errors.push(`${label}: canonical URL must use https: ${raw}`);
  if (parsed.origin !== CANONICAL_ORIGIN) errors.push(`${label}: canonical URL must use ${CANONICAL_ORIGIN}: ${raw}`);
  if (parsed.search || parsed.hash) errors.push(`${label}: canonical URL must not contain query/hash state: ${raw}`);
  if (parsed.pathname !== '/' && !parsed.pathname.endsWith('/')) errors.push(`${label}: canonical page URL must end with '/': ${raw}`);
  if (parsed.pathname.includes('//')) errors.push(`${label}: canonical path must not contain duplicate slashes: ${raw}`);
  return parsed;
}

function robotsTokens(value = '') {
  return new Set(String(value).toLowerCase().split(/[\s,]+/).filter(Boolean));
}

function parseSitemap(xml, errors) {
  if (!/<urlset\b/i.test(xml)) errors.push('sitemap.xml: missing <urlset> root');
  const urls = [...String(xml).matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => cleanText(match[1])).filter(Boolean);
  if (!urls.length) errors.push('sitemap.xml: no <loc> entries found');
  const seen = new Set();
  for (const url of urls) {
    if (seen.has(url)) errors.push(`sitemap.xml: duplicate <loc>: ${url}`);
    seen.add(url);
    validateCanonicalUrl(url, 'sitemap.xml', errors);
  }
  return urls;
}

function parseRobots(text, errors) {
  const lines = String(text).split(/\r?\n/).map((line) => line.replace(/\s*#.*$/, '').trim()).filter(Boolean);
  const sitemapLines = lines.filter((line) => /^sitemap\s*:/i.test(line)).map((line) => line.replace(/^sitemap\s*:\s*/i, '').trim());
  if (!sitemapLines.includes(`${CANONICAL_ORIGIN}/sitemap.xml`)) {
    errors.push(`robots.txt: missing canonical Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
  }

  let appliesToWildcard = false;
  let wildcardSeen = false;
  let wildcardAllowsRoot = false;
  for (const line of lines) {
    const userAgent = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (userAgent) {
      appliesToWildcard = userAgent[1].trim() === '*';
      if (appliesToWildcard) wildcardSeen = true;
      continue;
    }
    if (!appliesToWildcard) continue;
    const disallow = line.match(/^disallow\s*:\s*(.*)$/i);
    if (disallow && disallow[1].trim() === '/') errors.push('robots.txt: wildcard crawler policy must not disallow the entire site');
    const allow = line.match(/^allow\s*:\s*(.*)$/i);
    if (allow && allow[1].trim() === '/') wildcardAllowsRoot = true;
  }
  if (!wildcardSeen) errors.push('robots.txt: missing User-agent: * policy');
  if (!wildcardAllowsRoot) errors.push('robots.txt: wildcard policy must explicitly Allow: /');
}

function deployedRouteSources(workflow, rootDir, errors) {
  const routes = new Map([
    ['/', 'index.html'],
    ['/explore/', 'src/catalogue/index.html'],
    ['/catalogue/', 'src/catalogue/index.html'],
  ]);

  const lines = String(workflow).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== 'cp -R \\') continue;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (line === '_site/' || line.endsWith(' _site/')) break;
      const match = line.match(/^public-site\/([^\s\\]+)\s*\\?$/);
      if (!match) continue;
      const name = match[1].replace(/\/$/, '');
      if (!name || name.includes('.')) continue;
      routes.set(normalizeRoute(name), `public-site/${name}/index.html`);
    }
  }

  for (const [route, source] of routes) {
    if (!fs.existsSync(path.join(rootDir, source))) errors.push(`deployment: ${route} maps to missing source ${source}`);
  }
  return routes;
}

function readRequired(rootDir, relativePath, errors) {
  const fullPath = path.join(rootDir, relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    errors.push(`missing required file: ${relativePath}`);
    return '';
  }
}

export function validateSearchSurfaces(rootDir = DEFAULT_ROOT, { quiet = false } = {}) {
  const root = path.resolve(rootDir);
  const errors = [];
  const warnings = [];

  const robots = readRequired(root, 'robots.txt', errors);
  const sitemap = readRequired(root, 'sitemap.xml', errors);
  const workflow = readRequired(root, '.github/workflows/pages.yml', errors);
  if (robots) parseRobots(robots, errors);
  const sitemapUrls = sitemap ? parseSitemap(sitemap, errors) : [];
  const routeSources = workflow ? deployedRouteSources(workflow, root, errors) : new Map();
  const sitemapSet = new Set(sitemapUrls);
  const deployedUrlSet = new Set([...routeSources.keys()].map(canonicalUrlForRoute));
  const canonicalGroups = new Map();
  const pageRecords = [];

  for (const [route, source] of routeSources) {
    const html = readRequired(root, source, errors);
    if (!html) continue;
    const meta = extractPageMetadata(html);
    const label = `${route} (${source})`;

    if (meta.titles.length !== 1) errors.push(`${label}: expected exactly one non-empty <title>, found ${meta.titles.length}`);
    if (!meta.description) errors.push(`${label}: missing non-empty meta description`);
    if (!meta.h1s.length) errors.push(`${label}: missing non-empty <h1>`);
    if (meta.canonicals.length !== 1) errors.push(`${label}: expected exactly one canonical link, found ${meta.canonicals.length}`);

    const canonical = meta.canonicals[0] || '';
    const parsedCanonical = canonical ? validateCanonicalUrl(canonical, label, errors) : null;
    if (meta.ogUrl && canonical && meta.ogUrl !== canonical) errors.push(`${label}: og:url must match canonical (${meta.ogUrl} != ${canonical})`);
    if (meta.ogImage) {
      try {
        const imageUrl = new URL(meta.ogImage);
        if (imageUrl.protocol !== 'https:' || imageUrl.origin !== CANONICAL_ORIGIN) {
          errors.push(`${label}: og:image must use the canonical HTTPS origin: ${meta.ogImage}`);
        }
      } catch {
        errors.push(`${label}: og:image must be an absolute URL: ${meta.ogImage}`);
      }
    }

    const tokens = robotsTokens(meta.robots);
    const indexable = !tokens.has('noindex');
    const routeUrl = canonicalUrlForRoute(route);
    const selfCanonical = canonical === routeUrl;

    if (parsedCanonical) {
      const group = canonicalGroups.get(canonical) || [];
      group.push({ route, source, routeUrl, selfCanonical, indexable });
      canonicalGroups.set(canonical, group);
    }

    if (sitemapSet.has(routeUrl)) {
      if (!indexable) errors.push(`${label}: sitemap route must not be noindex`);
      if (!selfCanonical) errors.push(`${label}: sitemap route must be self-canonical (${canonical || 'missing canonical'})`);
      if (!meta.robots) warnings.push(`${label}: sitemap route has no explicit robots meta`);
      if (meta.robots && !tokens.has('index')) warnings.push(`${label}: sitemap route robots meta does not explicitly include index`);
      if (!meta.ogUrl) errors.push(`${label}: sitemap route is missing og:url`);
      if (!meta.ogTitle) errors.push(`${label}: sitemap route is missing og:title`);
    }

    if (indexable && selfCanonical && !sitemapSet.has(routeUrl)) {
      warnings.push(`${label}: self-canonical indexable route is deployed but not listed in sitemap`);
    }
    if (!selfCanonical && sitemapSet.has(routeUrl)) errors.push(`${label}: canonical alias must not appear in sitemap`);
    if (!selfCanonical && canonical && !deployedUrlSet.has(canonical)) {
      errors.push(`${label}: canonical target is not a deployed public route: ${canonical}`);
    }

    pageRecords.push({ route, routeUrl, source, canonical, indexable, selfCanonical, hrefs: meta.hrefs });
  }

  for (const url of sitemapUrls) {
    if (!deployedUrlSet.has(url)) errors.push(`sitemap.xml: URL is not deployed by the Pages artifact: ${url}`);
  }

  for (const [canonical, group] of canonicalGroups) {
    if (group.length <= 1) continue;
    const selfCanonical = group.filter((entry) => entry.selfCanonical);
    if (selfCanonical.length !== 1) {
      errors.push(`canonical: ${canonical} is shared by ${group.length} deployed routes without exactly one self-canonical target`);
      continue;
    }
    for (const alias of group.filter((entry) => !entry.selfCanonical)) {
      if (sitemapSet.has(alias.routeUrl)) errors.push(`${alias.route}: compatibility alias sharing ${canonical} must not be in sitemap`);
    }
  }

  const inboundBySitemapUrl = new Map(sitemapUrls.map((url) => [url, new Set()]));
  for (const page of pageRecords) {
    if (!page.indexable || !page.selfCanonical) continue;
    for (const href of page.hrefs) {
      const targetUrl = crawlTargetUrl(href, page.route);
      if (!targetUrl || !sitemapSet.has(targetUrl) || targetUrl === page.routeUrl) continue;
      inboundBySitemapUrl.get(targetUrl)?.add(page.routeUrl);
    }
  }

  for (const url of sitemapUrls) {
    if (url === `${CANONICAL_ORIGIN}/`) continue;
    const inbound = inboundBySitemapUrl.get(url);
    if (!inbound?.size) {
      errors.push(`internal links: sitemap route has no inbound crawlable HTML link from another indexable self-canonical page: ${url}`);
    }
  }

  const result = {
    ok: errors.length === 0,
    errors,
    warnings,
    routes: pageRecords,
    sitemapUrls,
  };

  if (!quiet) {
    if (errors.length) {
      console.error(`✗ Search surface validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
      errors.forEach((error) => console.error(`  - ${error}`));
    } else {
      console.log(`✓ Search surfaces valid: ${pageRecords.length} deployed routes, ${sitemapUrls.length} sitemap URLs.`);
    }
    warnings.forEach((warning) => console.warn(`! ${warning}`));
  }
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const rootArg = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT;
  const result = validateSearchSurfaces(rootArg);
  if (!result.ok) process.exitCode = 1;
}
