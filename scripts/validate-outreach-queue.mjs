import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

const [queue, contacts] = await Promise.all([
  readJson("data/rights-acquisition/outreach-queue.json"),
  readJson("data/rights-acquisition/wave-01-contacts.json"),
]);

const allowedStates = new Set(queue?.allowedStates || []);
const contactIds = new Set((contacts?.contacts || []).map((item) => item.batchId));
const requiredStates = [
  "route-discovery",
  "authority-confirmation",
  "ready-to-contact",
  "contacted",
  "awaiting-response",
  "negotiating",
  "closed-no-deal",
  "agreement-executed",
];
const sentStates = new Set(["contacted", "awaiting-response", "negotiating", "closed-no-deal", "agreement-executed"]);
const responseStates = new Set(["negotiating", "closed-no-deal", "agreement-executed"]);

let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const isTimestamp = (value) => !Number.isNaN(Date.parse(String(value || "")));
const nonEmpty = (value) => Boolean(String(value ?? "").trim());

for (const state of requiredStates) {
  if (!allowedStates.has(state)) fail(`outreach queue allowedStates is missing ${state}`);
}

const ids = new Set();
const priorities = new Set();
for (const item of queue?.items || []) {
  const id = String(item?.id || "");
  if (!id) {
    fail("outreach item is missing id");
    continue;
  }
  if (ids.has(id)) fail(`${id}: duplicate outreach id`);
  ids.add(id);

  if (!contactIds.has(item.contactBatchId)) fail(`${id}: contactBatchId does not exist in wave-01-contacts.json`);
  if (!allowedStates.has(item.state)) fail(`${id}: invalid state ${JSON.stringify(item.state)}`);
  if (!nonEmpty(item.entity)) fail(`${id}: missing entity`);
  if (!nonEmpty(item.objective)) fail(`${id}: missing objective`);
  if (!Number.isInteger(item.priority) || item.priority < 1) fail(`${id}: priority must be a positive integer`);
  if (priorities.has(item.priority)) fail(`${id}: priority ${item.priority} is duplicated`);
  priorities.add(item.priority);

  const signal = item.catalogueSignal || {};
  if (signal.metadataSignalOnly !== true) fail(`${id}: catalogueSignal.metadataSignalOnly must be true`);
  for (const key of ["rows", "releases"]) {
    if (signal[key] != null && (!Number.isInteger(signal[key]) || signal[key] < 0)) {
      fail(`${id}: catalogueSignal.${key} must be a non-negative integer or null`);
    }
  }

  const request = item.request || {};
  for (const key of [
    "catalogueExport",
    "directInteractiveStreaming",
    "directHosting",
    "technicalTranscoding",
    "ordinaryStreamingCache",
    "offlinePlaybackQuoteSeparately",
    "losslessMasters",
  ]) {
    if (request[key] !== true) fail(`${id}: request.${key} must be true for the standard GARBA licensing brief`);
  }
  if (!Array.isArray(request.pilotTrackCounts) || !request.pilotTrackCounts.length || request.pilotTrackCounts.some((n) => !Number.isInteger(n) || n < 1)) {
    fail(`${id}: request.pilotTrackCounts must be a non-empty array of positive integers`);
  }
  if (!Array.isArray(request.requiredRecordingFields) || !request.requiredRecordingFields.includes("isrc") || !request.requiredRecordingFields.includes("phonogramOwner")) {
    fail(`${id}: requiredRecordingFields must include isrc and phonogramOwner`);
  }

  if (sentStates.has(item.state)) {
    if (!isTimestamp(item.sentAt)) fail(`${id}: state ${item.state} requires sentAt ISO timestamp`);
    if (!nonEmpty(item.sentVia)) fail(`${id}: state ${item.state} requires sentVia`);
  } else if (item.sentAt != null || item.sentVia != null) {
    fail(`${id}: unsent state ${item.state} cannot carry sentAt/sentVia`);
  }

  if (responseStates.has(item.state) && !isTimestamp(item.lastResponseAt)) {
    fail(`${id}: state ${item.state} requires lastResponseAt ISO timestamp`);
  }

  if (item.state === "agreement-executed") {
    if (!nonEmpty(item.agreementEvidenceRef)) fail(`${id}: agreement-executed requires agreementEvidenceRef`);
    if (!isDate(item.agreementExecutedAt)) fail(`${id}: agreement-executed requires agreementExecutedAt YYYY-MM-DD`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${(queue?.items || []).length} licensing outreach item(s) are schema-valid`);
console.log("✓ no unsent outreach item can masquerade as contacted or negotiated");
console.log("✓ an executed outreach agreement still remains separate from track-level clearance");
