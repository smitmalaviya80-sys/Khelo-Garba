const DEFAULT_CANONICAL_ORIGIN = 'https://playgarba.com';
const SITEMAP_CHANGEFREQS = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);

function decodeXmlText(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeXmlText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeRoute(route) {
  const value = String(route || '').trim();
  if (!value || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function isCanonicalRouteShape(route) {
  if (route === '/') return true;
  return route.startsWith('/') && route.endsWith('/') && !route.includes('//') && !route.includes('?') && !route.includes('#');
}

function publishedEntries(policy) {
  return Array.isArray(policy?.publishedSitemapEntries) ? policy.publishedSitemapEntries : [];
}

export function parseSitemapLocs(xml = '') {
  return [...String(xml).matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXmlText(match[1]).trim())
    .filter(Boolean);
}

export function renderSearchSitemap(policy = {}) {
  const canonicalOrigin = String(policy.canonicalOrigin || '').replace(/\/$/, '');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const entry of publishedEntries(policy)) {
    const route = String(entry?.route || '').trim();
    const changefreq = String(entry?.changefreq || '').trim();
    const priority = Number(entry?.priority);
    lines.push(
      '  <url>',
      `    <loc>${escapeXmlText(`${canonicalOrigin}${route}`)}</loc>`,
      `    <changefreq>${escapeXmlText(changefreq)}</changefreq>`,
      `    <priority>${Number.isFinite(priority) ? priority.toFixed(1) : String(entry?.priority ?? '')}</priority>`,
      '  </url>',
    );
  }

  lines.push('</urlset>');
  return `${lines.join('\n')}\n`;
}

export function validateSearchSurfacePolicy({ policy, sitemapXml }) {
  const errors = [];
  const warnings = [];

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { ok: false, errors: ['policy must be a JSON object'], warnings, sitemapRoutes: [] };
  }

  if (policy.version !== 1) errors.push(`policy.version must be 1, found ${String(policy.version)}`);

  const canonicalOrigin = String(policy.canonicalOrigin || '').replace(/\/$/, '');
  if (canonicalOrigin !== DEFAULT_CANONICAL_ORIGIN) {
    errors.push(`policy.canonicalOrigin must be ${DEFAULT_CANONICAL_ORIGIN}`);
  }

  const admitted = Array.isArray(policy.admittedSitemapRoutes) ? policy.admittedSitemapRoutes : [];
  const published = publishedEntries(policy);
  const forbidden = Array.isArray(policy.forbiddenRoutePrefixes) ? policy.forbiddenRoutePrefixes : [];
  if (!admitted.length) errors.push('policy.admittedSitemapRoutes must contain at least one route');
  if (!published.length) errors.push('policy.publishedSitemapEntries must contain at least one route');
  if (!forbidden.length) errors.push('policy.forbiddenRoutePrefixes must contain at least one route prefix');

  const admittedSet = new Set();
  for (const rawRoute of admitted) {
    const route = String(rawRoute || '').trim();
    if (normalizeRoute(route) !== route || !isCanonicalRouteShape(route)) {
      errors.push(`admitted route must use canonical leading/trailing-slash form without query/hash: ${route || '(empty)'}`);
      continue;
    }
    if (admittedSet.has(route)) errors.push(`duplicate admitted route: ${route}`);
    admittedSet.add(route);
  }

  const forbiddenSet = new Set();
  for (const rawPrefix of forbidden) {
    const prefix = String(rawPrefix || '').trim();
    if (prefix === '/' || normalizeRoute(prefix) !== prefix || !isCanonicalRouteShape(prefix)) {
      errors.push(`forbidden route prefix must be a non-root canonical path prefix: ${prefix || '(empty)'}`);
      continue;
    }
    if (forbiddenSet.has(prefix)) errors.push(`duplicate forbidden route prefix: ${prefix}`);
    forbiddenSet.add(prefix);
  }

  for (const route of admittedSet) {
    for (const prefix of forbiddenSet) {
      if (route === prefix || route.startsWith(prefix)) {
        errors.push(`forbidden route family cannot be admitted: ${route} matches ${prefix}`);
      }
    }
  }

  const publishedSet = new Set();
  const publishedRoutes = [];
  for (const entry of published) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push('published sitemap entry must be an object');
      continue;
    }

    const route = String(entry.route || '').trim();
    if (normalizeRoute(route) !== route || !isCanonicalRouteShape(route)) {
      errors.push(`published route must use canonical leading/trailing-slash form without query/hash: ${route || '(empty)'}`);
    } else {
      if (publishedSet.has(route)) errors.push(`duplicate published route: ${route}`);
      publishedSet.add(route);
      publishedRoutes.push(route);
      if (!admittedSet.has(route)) errors.push(`published route must be admitted by search-surface policy: ${route}`);
      for (const prefix of forbiddenSet) {
        if (route === prefix || route.startsWith(prefix)) {
          errors.push(`published route uses forbidden entity-page family ${prefix}: ${route}`);
        }
      }
    }

    const changefreq = String(entry.changefreq || '').trim();
    if (!SITEMAP_CHANGEFREQS.has(changefreq)) {
      errors.push(`published route has invalid changefreq ${changefreq || '(empty)'}: ${route || '(empty)'}`);
    }

    const priority = entry.priority;
    if (typeof priority !== 'number' || !Number.isFinite(priority) || priority < 0 || priority > 1 || Math.round(priority * 10) !== priority * 10) {
      errors.push(`published route priority must be a number from 0.0 to 1.0 with at most one decimal place: ${route || '(empty)'}`);
    }
  }

  const sitemapLocs = parseSitemapLocs(sitemapXml);
  if (!sitemapLocs.length) errors.push('sitemap.xml contains no <loc> entries');

  const seenLocs = new Set();
  const sitemapRoutes = [];
  for (const loc of sitemapLocs) {
    if (seenLocs.has(loc)) errors.push(`duplicate sitemap <loc>: ${loc}`);
    seenLocs.add(loc);

    let parsed;
    try {
      parsed = new URL(loc);
    } catch {
      errors.push(`sitemap URL must be absolute: ${loc}`);
      continue;
    }

    if (parsed.protocol !== 'https:' || parsed.origin !== canonicalOrigin) {
      errors.push(`sitemap URL must use canonical origin ${canonicalOrigin}: ${loc}`);
    }
    if (parsed.search || parsed.hash) errors.push(`sitemap URL must not contain query/hash state: ${loc}`);

    const route = parsed.pathname || '/';
    if (normalizeRoute(route) !== route || !isCanonicalRouteShape(route)) {
      errors.push(`sitemap route must use canonical leading/trailing-slash form: ${route}`);
      continue;
    }
    sitemapRoutes.push(route);

    for (const prefix of forbiddenSet) {
      if (route === prefix || route.startsWith(prefix)) {
        errors.push(`sitemap route uses forbidden entity-page family ${prefix}: ${route}`);
      }
    }

    if (!admittedSet.has(route)) {
      errors.push(`sitemap route is not admitted by search-surface policy: ${route}`);
    }
  }

  const expectedSitemapXml = renderSearchSitemap(policy);
  if (String(sitemapXml) !== expectedSitemapXml) {
    errors.push('sitemap.xml must exactly match the deterministic published-route rendering');
  }

  if (!admittedSet.has('/')) warnings.push('policy does not admit the canonical player root /');
  if (!admittedSet.has('/explore/')) warnings.push('policy does not admit the canonical Explore route /explore/');
  if (!publishedSet.has('/')) warnings.push('policy does not publish the canonical player root /');
  if (!publishedSet.has('/explore/')) warnings.push('policy does not publish the canonical Explore route /explore/');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sitemapRoutes,
    admittedRoutes: [...admittedSet],
    publishedRoutes,
    forbiddenPrefixes: [...forbiddenSet],
    expectedSitemapXml,
  };
}
