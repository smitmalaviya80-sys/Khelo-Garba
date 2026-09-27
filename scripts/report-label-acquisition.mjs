import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(await readFile(resolve(root, "data/catalogue/index.json"), "utf8"));

async function merge(paths = []) {
  const parts = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"))));
  return parts.flat();
}

function normaliseLabel(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/private\s+limited/g, "pvt ltd")
    .replace(/pvt\.?\s*limited/g, "pvt ltd")
    .replace(/pvt\.?\s*ltd\.?/g, "pvt ltd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const songs = await merge(index.songChunks);
const releases = await merge(index.releaseChunks);
const releaseById = new Map(releases.map((release) => [release.id, release]));
const batches = new Map();
let missingRelease = 0;
let missingLabel = 0;

for (const song of songs) {
  const release = releaseById.get(song.releaseId);
  if (!release) {
    missingRelease += 1;
    continue;
  }

  const label = String(release.label || "").trim();
  if (!label) {
    missingLabel += 1;
    continue;
  }

  const key = normaliseLabel(label);
  if (!key) {
    missingLabel += 1;
    continue;
  }

  if (!batches.has(key)) {
    batches.set(key, {
      key,
      labels: new Map(),
      songIds: new Set(),
      releaseIds: new Set(),
      artists: new Set(),
    });
  }

  const batch = batches.get(key);
  batch.labels.set(label, (batch.labels.get(label) || 0) + 1);
  batch.songIds.add(song.id);
  batch.releaseIds.add(release.id);
  if (song.artist) batch.artists.add(song.artist);
}

const rows = [...batches.values()].map((batch) => {
  const preferredLabel = [...batch.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || batch.key;
  return {
    label: preferredLabel,
    songs: batch.songIds.size,
    releases: batch.releaseIds.size,
    artistCredits: batch.artists.size,
    aliases: [...batch.labels.keys()].sort(),
  };
}).sort((a, b) => b.songs - a.songs || b.releases - a.releases || a.label.localeCompare(b.label));

console.log(`GARBA label acquisition report · catalogue ${index.version}`);
console.log(`Catalogue songs: ${songs.length}`);
console.log(`Songs with release-label metadata: ${songs.length - missingRelease - missingLabel}`);
console.log(`Songs missing release: ${missingRelease}`);
console.log(`Songs whose release has no label: ${missingLabel}`);
console.log("Top label-level catalogue batches (metadata signal only, not proof of rights):");
for (const row of rows.slice(0, 25)) {
  const aliasNote = row.aliases.length > 1 ? ` · aliases ${row.aliases.join(" | ")}` : "";
  console.log(`${String(row.songs).padStart(4)} songs · ${String(row.releases).padStart(3)} releases · ${String(row.artistCredits).padStart(3)} artist credits · ${row.label}${aliasNote}`);
}
