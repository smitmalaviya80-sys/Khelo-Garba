import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadDiscoverySets(root, catalogueIndex) {
  const setsIndexPath = catalogueIndex?.discovery?.setsIndex;
  if (!setsIndexPath) throw new Error('Catalogue discovery manifest does not define setsIndex');
  const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const setsIndex = await readJson(setsIndexPath);
  const setsDir = path.posix.dirname(setsIndexPath);
  const sets = [];
  for (const chunkName of setsIndex.chunks || []) {
    const chunkPath = path.posix.join(setsDir, chunkName);
    const payload = await readJson(chunkPath);
    for (const set of Array.isArray(payload?.sets) ? payload.sets : []) sets.push({ ...set, __chunk: chunkName });
  }
  return { sets, setsIndex, setsIndexPath };
}
