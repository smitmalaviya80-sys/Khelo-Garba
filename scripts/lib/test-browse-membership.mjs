import assert from 'node:assert/strict';
import {
  belongsToVisualGenre,
  browseVisualGenres,
  taxonomyIdsForSong,
} from '../../src/catalogue/browse-membership.js';

const taxonomyById = new Map([
  ['traditional-garba', { id: 'traditional-garba', visualGenre: 'traditional' }],
  ['dandiya-raas', { id: 'dandiya-raas', visualGenre: 'dandiya' }],
  ['folk-lokgeet', { id: 'folk-lokgeet', visualGenre: 'folk' }],
  ['traditional-variant', { id: 'traditional-variant', visualGenre: 'traditional' }],
]);

const secondaryStyles = Object.freeze([
  'dandiya-raas',
  'traditional-variant',
  'dandiya-raas',
  '',
]);

const mixedSong = Object.freeze({
  id: 'fixture-mixed',
  genre: 'traditional',
  category: 'traditional-garba',
  taxonomyStyles: secondaryStyles,
});

assert.deepEqual(
  taxonomyIdsForSong(mixedSong),
  ['traditional-garba', 'dandiya-raas', 'traditional-variant'],
  'taxonomy IDs should be stable, trimmed and de-duplicated without mutating the song',
);

assert.deepEqual(
  [...browseVisualGenres(mixedSong, taxonomyById)],
  ['traditional', 'dandiya'],
  'primary visual identity must stay first while verified secondary taxonomy may broaden browse membership',
);

assert.equal(
  belongsToVisualGenre(mixedSong, 'traditional', taxonomyById),
  true,
  'primary visual genre should always remain a browse membership',
);

assert.equal(
  belongsToVisualGenre(mixedSong, 'dandiya', taxonomyById),
  true,
  'verified secondary taxonomy should add its canonical visual genre',
);

assert.equal(
  belongsToVisualGenre(mixedSong, 'folk', taxonomyById),
  false,
  'unrelated taxonomy must not be inferred from title, artist or any other free text',
);

const unknownTaxonomySong = Object.freeze({
  id: 'fixture-unknown',
  genre: 'folk',
  category: 'unknown-category',
  taxonomyStyles: Object.freeze(['also-unknown']),
});

assert.deepEqual(
  [...browseVisualGenres(unknownTaxonomySong, taxonomyById)],
  ['folk'],
  'unknown taxonomy tokens must not invent broader visual membership',
);

const primaryOnlySong = Object.freeze({
  id: 'fixture-primary-only',
  genre: 'sanedo',
});

assert.deepEqual(
  taxonomyIdsForSong(primaryOnlySong),
  [],
  'missing optional category/style fields should remain empty rather than synthesized',
);

assert.deepEqual(
  [...browseVisualGenres(primaryOnlySong, taxonomyById)],
  ['sanedo'],
  'a song with only a primary genre should remain primary-only',
);

const taxonomyOnlySong = Object.freeze({
  id: 'fixture-taxonomy-only',
  category: 'folk-lokgeet',
  taxonomyStyles: Object.freeze([]),
});

assert.deepEqual(
  [...browseVisualGenres(taxonomyOnlySong, taxonomyById)],
  ['folk'],
  'the pure helper may resolve verified taxonomy defensively even when upstream validation later rejects a missing primary genre',
);

const objectLookup = {
  'traditional-garba': { visualGenre: 'traditional' },
  'dandiya-raas': { visualGenre: 'dandiya' },
};

assert.deepEqual(
  [...browseVisualGenres({
    genre: 'traditional',
    category: 'traditional-garba',
    taxonomyStyles: ['dandiya-raas'],
  }, objectLookup)],
  ['traditional', 'dandiya'],
  'plain-object taxonomy lookups should behave identically to Map lookups for lightweight consumers',
);

assert.equal(
  belongsToVisualGenre(mixedSong, '   ', taxonomyById),
  false,
  'blank browse targets must never match',
);

assert.deepEqual(
  secondaryStyles,
  ['dandiya-raas', 'traditional-variant', 'dandiya-raas', ''],
  'the helper must not mutate taxonomyStyles[]',
);

console.log('✓ browse membership preserves primary identity and broadens only through canonical taxonomy mappings');
console.log('✓ duplicate, unknown, missing and object-lookup fixtures are deterministic and non-mutating');
