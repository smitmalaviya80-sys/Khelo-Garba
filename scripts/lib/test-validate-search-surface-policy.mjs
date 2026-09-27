import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderSearchSitemap, validateSearchSurfacePolicy } from './validate-search-surface-policy.mjs';

const ORIGIN = 'https://playgarba.com';

function policy(overrides = {}) {
  return {
    version: 1,
    canonicalOrigin: ORIGIN,
    admittedSitemapRoutes: ['/', '/explore/', '/what-is-garba/', '/navratri-2026/'],
    publishedSitemapEntries: [
      { route: '/', changefreq: 'daily', priority: 1.0 },
      { route: '/explore/', changefreq: 'daily', priority: 0.8 },
      { route: '/navratri-2026/', changefreq: 'weekly', priority: 0.8 },
    ],
    forbiddenRoutePrefixes: ['/songs/', '/artists/', '/releases/', '/nonstop/'],
    ...overrides,
  };
}

function expectValid(name, input) {
  const result = validateSearchSurfacePolicy(input);
  assert.equal(result.ok, true, `${name}: ${result.errors.join(' | ')}`);
}

function expectInvalid(name, input, expected) {
  const result = validateSearchSurfacePolicy(input);
  assert.equal(result.ok, false, `${name}: expected failure`);
  assert.match(result.errors.join('\n'), expected, `${name}: ${result.errors.join(' | ')}`);
}

export function runSearchSurfacePolicySelfTests() {
  const currentStyle = policy();
  expectValid('published contract renders canonical sitemap', {
    policy: currentStyle,
    sitemapXml: renderSearchSitemap(currentStyle),
  });

  const admittedButUnpublished = policy({
    admittedSitemapRoutes: ['/', '/explore/', '/what-is-garba/', '/navratri-2026/', '/history-of-garba/'],
  });
  expectValid('admitted route does not have to be published', {
    policy: admittedButUnpublished,
    sitemapXml: renderSearchSitemap(admittedButUnpublished),
  });

  const unpublishedAdmission = policy({
    publishedSitemapEntries: [
      ...currentStyle.publishedSitemapEntries,
      { route: '/new-keyword-page/', changefreq: 'monthly', priority: 0.4 },
    ],
  });
  expectInvalid('published route must first be admitted', {
    policy: unpublishedAdmission,
    sitemapXml: renderSearchSitemap(unpublishedAdmission),
  }, /published route must be admitted/);

  const forbidden = policy({
    admittedSitemapRoutes: ['/', '/explore/', '/songs/foo/'],
    publishedSitemapEntries: [
      { route: '/', changefreq: 'daily', priority: 1.0 },
      { route: '/explore/', changefreq: 'daily', priority: 0.8 },
      { route: '/songs/foo/', changefreq: 'monthly', priority: 0.2 },
    ],
  });
  expectInvalid('forbidden entity family remains forbidden even if admitted and published', {
    policy: forbidden,
    sitemapXml: renderSearchSitemap(forbidden),
  }, /forbidden route family cannot be admitted|forbidden entity-page family/);

  expectInvalid('wrong canonical origin', {
    policy: currentStyle,
    sitemapXml: renderSearchSitemap(currentStyle).replace(`${ORIGIN}/explore/`, 'https://www.playgarba.com/explore/'),
  }, /must use canonical origin/);

  expectInvalid('query canonical state', {
    policy: currentStyle,
    sitemapXml: renderSearchSitemap(currentStyle).replace(`${ORIGIN}/explore/`, `${ORIGIN}/explore/?genre=folk`),
  }, /must not contain query\/hash state/);

  const duplicateAdmitted = policy({ admittedSitemapRoutes: ['/', '/explore/', '/explore/'] });
  expectInvalid('duplicate admitted route', {
    policy: duplicateAdmitted,
    sitemapXml: renderSearchSitemap(duplicateAdmitted),
  }, /duplicate admitted route/);

  expectInvalid('duplicate sitemap URL', {
    policy: currentStyle,
    sitemapXml: renderSearchSitemap(currentStyle).replace(
      '</urlset>',
      `  <url>\n    <loc>${ORIGIN}/explore/</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`,
    ),
  }, /duplicate sitemap <loc>/);

  const duplicatePublished = policy({
    publishedSitemapEntries: [...currentStyle.publishedSitemapEntries, currentStyle.publishedSitemapEntries[1]],
  });
  expectInvalid('duplicate published route', {
    policy: duplicatePublished,
    sitemapXml: renderSearchSitemap(duplicatePublished),
  }, /duplicate published route/);

  const badChangefreq = policy({
    publishedSitemapEntries: currentStyle.publishedSitemapEntries.map((entry, index) => index === 1 ? { ...entry, changefreq: 'sometimes' } : entry),
  });
  expectInvalid('invalid publication changefreq', {
    policy: badChangefreq,
    sitemapXml: renderSearchSitemap(badChangefreq),
  }, /invalid changefreq/);

  const badPriority = policy({
    publishedSitemapEntries: currentStyle.publishedSitemapEntries.map((entry, index) => index === 1 ? { ...entry, priority: 1.2 } : entry),
  });
  expectInvalid('invalid publication priority', {
    policy: badPriority,
    sitemapXml: renderSearchSitemap(badPriority),
  }, /priority must be a number from 0\.0 to 1\.0/);

  expectInvalid('committed sitemap output cannot drift from publication contract', {
    policy: currentStyle,
    sitemapXml: `${renderSearchSitemap(currentStyle)}\n`,
  }, /must exactly match the deterministic published-route rendering/);

  return 12;
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const count = runSearchSurfacePolicySelfTests();
  console.log(`✓ Search surface policy self-tests passed (${count} cases).`);
}
