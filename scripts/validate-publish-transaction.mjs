import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

const [index, ledger, intake, directAudio] = await Promise.all([
  readJson("data/catalogue/index.json"),
  readJson("data/hosting-rights.json"),
  readJson("data/master-intake.json"),
  readJson("data/direct-audio.json"),
]);

const songs = (await Promise.all(index.songChunks.map(readJson))).flat();
const songIds = new Set(songs.map((song) => song.id));
const rightsTracks = ledger?.tracks || {};
const intakeTracks = intake?.tracks || {};
const directTracks = directAudio?.tracks || {};
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));

const transactionIds = new Set([
  ...Object.keys(directTracks),
  ...Object.entries(rightsTracks).filter(([, record]) => record?.state === "cleared").map(([songId]) => songId),
  ...Object.entries(intakeTracks).filter(([, record]) => record?.state === "published").map(([songId]) => songId),
]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };

for (const songId of transactionIds) {
  if (!songIds.has(songId)) {
    fail(`${songId}: publication transaction does not match a catalogue song`);
    continue;
  }

  const rights = rightsTracks[songId];
  const master = intakeTracks[songId];
  const direct = directTracks[songId];

  if (!direct) fail(`${songId}: publication transaction requires data/direct-audio.json entry`);
  if (rights?.state !== "cleared") fail(`${songId}: publication transaction requires hosting-rights state cleared`);
  if (master?.state !== "published") fail(`${songId}: publication transaction requires master-intake state published`);

  if (!direct) continue;
  const encodedSha = String(direct.sha256 || "").toLowerCase();
  if (!isSha256(encodedSha)) fail(`${songId}: published direct audio requires encoded-file sha256`);

  const publication = master?.publication || {};
  if (!isSha256(publication.encodedSha256)) {
    fail(`${songId}: published master-intake record requires publication.encodedSha256`);
  } else if (encodedSha && publication.encodedSha256.toLowerCase() !== encodedSha) {
    fail(`${songId}: publication.encodedSha256 does not match direct-audio sha256`);
  }

  const audioUrl = String(direct.audioUrl || "").trim();
  if (!String(publication.audioUrl || "").trim()) {
    fail(`${songId}: published master-intake record requires publication.audioUrl`);
  } else if (String(publication.audioUrl).trim() !== audioUrl) {
    fail(`${songId}: publication.audioUrl does not match direct-audio audioUrl`);
  }

  if (!String(publication.profileId || "").trim()) {
    fail(`${songId}: published master-intake record requires publication.profileId`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(publication.publishedAt || ""))) {
    fail(`${songId}: published master-intake record requires publication.publishedAt YYYY-MM-DD`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${transactionIds.size} publication transaction(s) are atomic across rights, master intake, and direct audio`);
console.log("✓ no direct-audio track can exist without cleared rights and a published authorised master");
