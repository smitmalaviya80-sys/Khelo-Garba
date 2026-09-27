import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

const [index, intake, ledger, directAudio] = await Promise.all([
  readJson("data/catalogue/index.json"),
  readJson("data/master-intake.json"),
  readJson("data/hosting-rights.json"),
  readJson("data/direct-audio.json"),
]);

const songs = (await Promise.all(index.songChunks.map(readJson))).flat();
const songIds = new Set(songs.map((song) => song.id));
const records = intake?.tracks || {};
const allowedStates = new Set(intake?.allowedStates || []);
const rightsRecords = ledger?.tracks || {};
const directTracks = directAudio?.tracks || {};

const requiredStates = ["received", "checksum-verified", "rights-verified", "encode-ready", "published", "rejected"];
const authorityTypes = new Set(["rights-holder", "authorised-distributor", "authorised-licensee", "commissioned-master"]);
const masterFormats = new Set(["wav", "flac"]);
const offlineStates = new Set(["allowed", "prohibited", "unspecified"]);
const rightsProgressStates = new Set(["licence-review", "cleared"]);
const advancedStates = new Set(["rights-verified", "encode-ready", "published"]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ""));
const isIsrc = (value) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
const nonEmpty = (value) => Boolean(String(value ?? "").trim());

for (const state of requiredStates) {
  if (!allowedStates.has(state)) fail(`data/master-intake.json allowedStates is missing ${state}`);
}

const shaOwners = new Map();

for (const [songId, record] of Object.entries(records)) {
  if (!songIds.has(songId)) fail(`${songId}: master-intake record does not match a catalogue song`);
  if (!record || typeof record !== "object") {
    fail(`${songId}: master-intake record must be an object`);
    continue;
  }

  const state = record.state;
  if (!allowedStates.has(state)) fail(`${songId}: invalid master-intake state ${JSON.stringify(state)}`);

  if (state === "rejected") {
    if (!nonEmpty(record.reason)) fail(`${songId}: rejected intake requires a reason`);
    continue;
  }

  const hostingState = rightsRecords[songId]?.state;
  if (!rightsProgressStates.has(hostingState)) {
    fail(`${songId}: source master intake requires hosting-rights state licence-review or cleared, got ${JSON.stringify(hostingState || null)}`);
  }

  const source = record.source || {};
  if (!authorityTypes.has(source.authorityType)) {
    fail(`${songId}: source.authorityType must identify a rights holder or authorised source`);
  }
  if (!nonEmpty(source.suppliedBy)) fail(`${songId}: missing source.suppliedBy`);
  if (!nonEmpty(source.evidenceRef)) fail(`${songId}: missing source.evidenceRef`);
  if (!isDate(source.receivedAt)) fail(`${songId}: source.receivedAt must be YYYY-MM-DD`);

  const master = record.master || {};
  const format = String(master.format || "").toLowerCase();
  const sha256 = String(master.sha256 || "").toLowerCase();
  if (!masterFormats.has(format)) fail(`${songId}: master.format must be wav or flac`);
  if (!isSha256(sha256)) fail(`${songId}: master.sha256 must be a 64-character hexadecimal digest`);
  if (isSha256(sha256)) {
    if (shaOwners.has(sha256) && shaOwners.get(sha256) !== songId) {
      fail(`${songId}: master.sha256 duplicates ${shaOwners.get(sha256)}; resolve duplicate recording identity before intake`);
    } else {
      shaOwners.set(sha256, songId);
    }
  }
  if (!Number.isInteger(master.sampleRateHz) || master.sampleRateHz < 8000 || master.sampleRateHz > 384000) {
    fail(`${songId}: master.sampleRateHz must be an integer between 8000 and 384000`);
  }
  if (![16, 24, 32].includes(master.bitDepth)) fail(`${songId}: master.bitDepth must be 16, 24, or 32`);
  if (master.isrc != null && !isIsrc(master.isrc)) fail(`${songId}: master.isrc must be a valid 12-character ISRC when supplied`);

  const rights = record.rights || {};
  if (!offlineStates.has(rights.offlinePlayback)) {
    fail(`${songId}: rights.offlinePlayback must be allowed, prohibited, or unspecified`);
  }
  if (!Array.isArray(rights.territories) || !rights.territories.length || rights.territories.some((item) => !nonEmpty(item))) {
    fail(`${songId}: rights.territories must be a non-empty array`);
  }
  if (!nonEmpty(rights.evidenceRef)) fail(`${songId}: missing rights.evidenceRef`);
  if (rights.perpetual !== true) {
    if (!isDate(rights.termStart)) fail(`${songId}: non-perpetual rights require termStart YYYY-MM-DD`);
    if (!isDate(rights.termEnd)) fail(`${songId}: non-perpetual rights require termEnd YYYY-MM-DD`);
    if (isDate(rights.termStart) && isDate(rights.termEnd) && rights.termEnd < rights.termStart) {
      fail(`${songId}: rights.termEnd cannot be before termStart`);
    }
  }

  if (advancedStates.has(state)) {
    if (rights.directStreamingAllowed !== true) fail(`${songId}: ${state} requires rights.directStreamingAllowed=true`);
    if (rights.transcodingAllowed !== true) fail(`${songId}: ${state} requires rights.transcodingAllowed=true`);
    if (rights.ordinaryCacheAllowed !== true) fail(`${songId}: ${state} requires rights.ordinaryCacheAllowed=true`);
  }

  if (["checksum-verified", "rights-verified", "encode-ready", "published"].includes(state) && record.checksumVerified !== true) {
    fail(`${songId}: ${state} requires checksumVerified=true`);
  }

  if (state === "published") {
    if (hostingState !== "cleared") fail(`${songId}: published requires hosting-rights state cleared`);
    const direct = directTracks[songId];
    if (!direct) fail(`${songId}: published requires a matching data/direct-audio.json entry`);

    const publication = record.publication || {};
    if (!isSha256(publication.encodedSha256)) fail(`${songId}: published requires publication.encodedSha256`);
    if (!nonEmpty(publication.audioUrl)) fail(`${songId}: published requires publication.audioUrl`);
    if (!nonEmpty(publication.profileId)) fail(`${songId}: published requires publication.profileId`);
    if (!isDate(publication.publishedAt)) fail(`${songId}: published requires publication.publishedAt YYYY-MM-DD`);

    if (direct) {
      if (String(publication.encodedSha256 || "").toLowerCase() !== String(direct.sha256 || "").toLowerCase()) {
        fail(`${songId}: publication.encodedSha256 must equal data/direct-audio.json sha256`);
      }
      if (String(publication.audioUrl || "").trim() !== String(direct.audioUrl || "").trim()) {
        fail(`${songId}: publication.audioUrl must equal data/direct-audio.json audioUrl`);
      }
    }
  } else if (directTracks[songId]) {
    fail(`${songId}: direct-audio entry exists while master-intake state is ${state}; publish state atomically with the direct entry`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${Object.keys(records).length} authorised master-intake records are valid`);
console.log("✓ source masters are restricted to WAV/FLAC from rights-holder or authorised supply paths");
console.log("✓ published records bind the exact encoded checksum and audio URL to cleared rights and direct audio");
