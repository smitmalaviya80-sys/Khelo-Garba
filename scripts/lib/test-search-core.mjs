import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleSource = await readFile(new URL('../../assets/runtime/search-core.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
const {
  createSearchDocument,
  foldLatinDiacritics,
  normalizeSearchText,
  normalizeSearchVariants,
  rankSearchRecords,
  scoreSearchRecord,
} = await import(moduleUrl);

function ids(results) {
  return results.map(({ record }) => record.id);
}

// Gujarati letters and vowel/sign marks survive normalization; punctuation becomes space.
assert.equal(
  normalizeSearchText('  ઢોલીડા, ઢોલ રે વાગડ!  '),
  'ઢોલીડા ઢોલ રે વાગડ',
);
assert.ok(scoreSearchRecord({ id: 'gujarati', title: 'ઢોલીડા ઢોલ રે વાગડ' }, 'ઢોલીડા'));

// Ordinary punctuation/spacing normalize without changing word order.
assert.equal(normalizeSearchText('Non-Stop   Garba / Raas'), 'non stop garba raas');

// Latin diacritics fold for matching, while Gujarati marks remain intact.
assert.equal(foldLatinDiacritics('Gītā Garbā'), 'Gita Garba');
assert.equal(foldLatinDiacritics('ગુજરાતી ગરબા'), 'ગુજરાતી ગરબા');
assert.deepEqual(normalizeSearchVariants('Gītā'), ['gītā', 'gita']);
assert.equal(scoreSearchRecord({ id: 'folded', title: 'Gītā Garbā' }, 'gita garba')?.score, 120);

// Reviewed aliases are consumed as supplied. This fixture is search test data, not a catalogue claim.
const reviewedAlias = scoreSearchRecord({
  id: 'reviewed-alias',
  title: 'Festival Set',
  artist: 'Kirtidan Gadhvi',
  artistAliases: ['Kirtidan Gadhavi'],
}, 'Kirtidan Gadhavi');
assert.equal(reviewedAlias?.matchedBy, 'artist-alias-exact');

// Relevance hierarchy: exact title > reviewed title alias > artist > taxonomy > release.
const hierarchy = [
  { id: 'release', title: 'Other', releaseTerms: ['Raas'] },
  { id: 'taxonomy', title: 'Other', taxonomyTerms: ['Raas'] },
  { id: 'artist', title: 'Other', artist: 'Raas' },
  { id: 'alias', title: 'Other', titleAliases: ['Raas'] },
  { id: 'title', title: 'Raas' },
];
assert.deepEqual(ids(rankSearchRecords(hierarchy, 'raas')), [
  'title',
  'alias',
  'artist',
  'taxonomy',
  'release',
]);

// Same-title records keep distinct identity and receive a deterministic canonical-ID tie break.
assert.deepEqual(ids(rankSearchRecords([
  { id: 'z-recording', title: 'Dholida', artist: 'Singer' },
  { id: 'a-recording', title: 'Dholida', artist: 'Singer' },
], 'dholida')), ['a-recording', 'z-recording']);

// A bounded one-edit fallback exists for Latin tokens only and stays below direct field matches.
const typo = scoreSearchRecord({ id: 'typo', title: 'Garba' }, 'garva');
assert.equal(typo?.matchedBy, 'latin-one-edit');
assert.equal(typo?.score, 4);
assert.equal(scoreSearchRecord({ id: 'short', title: 'Bar' }, 'gar'), null);
assert.equal(scoreSearchRecord({ id: 'non-latin-typo', title: 'ગરબા' }, 'ગરકા'), null);

// Playability/provider-looking fields never affect relevance. Equal matches sort by identity only.
const availabilityNeutral = rankSearchRecords([
  { id: 'a-reference', title: 'Maa', artist: 'Singer', playbackReady: false },
  {
    id: 'z-playable',
    title: 'Maa',
    artist: 'Singer',
    playbackReady: true,
    youtubeId: 'example',
    audioUrl: 'https://example.invalid/audio',
  },
], 'maa');
assert.deepEqual(ids(availabilityNeutral), ['a-reference', 'z-playable']);
assert.equal(availabilityNeutral[0].score, availabilityNeutral[1].score);

// Multi-term matching may span supplied fields, but unmatched records remain absent.
assert.ok(scoreSearchRecord({
  id: 'multi-field',
  title: 'Navratri Night',
  artist: 'Singer',
  taxonomyTerms: ['Dandiya'],
}, 'night dandiya'));
assert.equal(scoreSearchRecord({ id: 'missing', title: 'Navratri Night' }, 'night folk'), null);

// The document exposes only normalized search fields, and ranking never mutates caller data/order.
const input = [
  { id: 'b', title: 'Beta', aliases: ['Second'] },
  { id: 'a', title: 'Alpha', aliases: ['First'] },
];
const before = JSON.stringify(input);
const document = createSearchDocument(input[0]);
assert.deepEqual(document.titleAliases, ['second']);
rankSearchRecords(input, 'first');
assert.equal(JSON.stringify(input), before);
assert.deepEqual(input.map(({ id }) => id), ['b', 'a']);

// Exercise the loaded-index path with an ASCII-heavy catalogue while preserving relevance and mutation contracts.
const loadedIndex = Array.from({ length: 1800 }, (_, index) => ({
  id: `archive-${index}`,
  title: `Archive Garba ${index}`,
  artist: `Singer ${index}`,
  taxonomyTerms: ['Traditional Garba'],
  releaseTerms: [`Archive Collection ${Math.floor(index / 20)}`],
}));
loadedIndex.splice(913, 0, {
  id: 'khalasi',
  title: 'Khalasi',
  artist: 'Aditya Gadhvi',
  taxonomyTerms: ['Folk Lokgeet'],
});
const loadedIndexBefore = JSON.stringify(loadedIndex);
const loadedIndexResults = rankSearchRecords(loadedIndex, 'Khalasi');
assert.equal(loadedIndexResults[0]?.record.id, 'khalasi');
assert.equal(loadedIndexResults[0]?.matchedBy, 'title-exact');
assert.equal(JSON.stringify(loadedIndex), loadedIndexBefore);

console.log('search core regression fixtures passed');
