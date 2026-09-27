const normaliseId = (value) => typeof value === 'string' ? value.trim() : '';

const uniqueIds = (values) => {
  const seen = new Set();
  const ids = [];
  for (const value of values) {
    const id = normaliseId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const taxonomyEntryFor = (taxonomyById, id) => {
  if (!taxonomyById || !id) return null;
  if (typeof taxonomyById.get === 'function') return taxonomyById.get(id) || null;
  if (typeof taxonomyById === 'object' && Object.prototype.hasOwnProperty.call(taxonomyById, id)) {
    return taxonomyById[id] || null;
  }
  return null;
};

export const taxonomyIdsForSong = (song) => uniqueIds([
  song?.category,
  ...(Array.isArray(song?.taxonomyStyles) ? song.taxonomyStyles : []),
]);

export function browseVisualGenres(song, taxonomyById) {
  const genres = new Set();
  const primaryGenre = normaliseId(song?.genre);
  if (primaryGenre) genres.add(primaryGenre);

  taxonomyIdsForSong(song).forEach((taxonomyId) => {
    const visualGenre = normaliseId(taxonomyEntryFor(taxonomyById, taxonomyId)?.visualGenre);
    if (visualGenre) genres.add(visualGenre);
  });

  return genres;
}

export function belongsToVisualGenre(song, genreId, taxonomyById) {
  const target = normaliseId(genreId);
  return Boolean(target) && browseVisualGenres(song, taxonomyById).has(target);
}
