import assert from "node:assert/strict";
import {
  canonicaliseVendorTrack,
  findDuplicateIsrcs,
  matchVendorTrack,
  parseCsv,
  parseDurationSeconds,
  tokenSimilarity,
} from "./lib/catalogue-matcher.mjs";

const csv = 'Track Title,Primary Artist,Album,Duration,ISRC,Label\n"Maa, Pawa Te Gadhthi Aavi","Pamela Jain, Hemant Chauhan",Demo Album,2:49,IN-ABC-12-34567,Soor Mandir\n';
const rows = parseCsv(csv);
assert.equal(rows.length, 1);
assert.equal(rows[0].track_title, "Maa, Pawa Te Gadhthi Aavi");
assert.equal(rows[0].primary_artist, "Pamela Jain, Hemant Chauhan");

const vendor = canonicaliseVendorTrack(rows[0], 0);
assert.equal(vendor.durationSeconds, 169);
assert.equal(vendor.isrc, "INABC1234567");
assert.equal(parseDurationSeconds("01:02:03"), 3723);
assert.equal(parseDurationSeconds(169000, true), 169);
assert.equal(tokenSimilarity("Pamela Jain, Hemant Chauhan", "Hemant Chauhan & Pamela Jain"), 1);

const songs = [
  {
    id: "correct-recording",
    title: "Maa, Pawa Te Gadhthi Aavi",
    artist: "Hemant Chauhan & Pamela Jain",
    releaseId: "release-soor",
    durationSeconds: 170,
  },
  {
    id: "wrong-artist",
    title: "Maa, Pawa Te Gadhthi Aavi",
    artist: "Other Singer",
    releaseId: "release-other",
    durationSeconds: 169,
  },
  {
    id: "generic-one",
    title: "Dholida",
    artist: "Singer One",
    releaseId: "release-soor",
    durationSeconds: 200,
  },
  {
    id: "generic-two",
    title: "Dholida",
    artist: "Singer Two",
    releaseId: "release-soor",
    durationSeconds: 200,
  },
  {
    id: "ambiguous-a",
    title: "Long Demo Garba Title",
    artist: "Singer Alpha",
    releaseId: "release-soor",
    durationSeconds: 240,
  },
  {
    id: "ambiguous-b",
    title: "Long Demo Garba Title",
    artist: "Singer Beta",
    releaseId: "release-soor",
    durationSeconds: 240,
  },
];

const releasesById = new Map([
  ["release-soor", { id: "release-soor", title: "Demo Album", label: "Soor Mandir" }],
  ["release-other", { id: "release-other", title: "Demo Album", label: "Other Label" }],
]);

const exact = matchVendorTrack(vendor, songs, releasesById);
assert.equal(exact.state, "exact");
assert.equal(exact.best.songId, "correct-recording");
assert.equal(exact.best.labelAgreement, true);
assert.ok(exact.best.durationDifferenceSeconds <= 2);

const filtered = matchVendorTrack(vendor, songs, releasesById, { targetLabel: "Other Label" });
assert.notEqual(filtered.state, "exact");
assert.equal(filtered.best?.songId, "wrong-artist");

const shortGeneric = canonicaliseVendorTrack({ title: "Dholida" }, 1);
const shortResult = matchVendorTrack(shortGeneric, songs, releasesById);
assert.equal(shortResult.state, "unmatched");

const ambiguousVendor = canonicaliseVendorTrack({
  title: "Long Demo Garba Title",
  artist: "Singer Alpha Singer Beta",
  duration: "4:00",
  label: "Soor Mandir",
}, 2);
const ambiguous = matchVendorTrack(ambiguousVendor, songs, releasesById);
assert.equal(ambiguous.state, "ambiguous");
assert.equal(ambiguous.candidates.length, 2);

const duplicateIsrcs = findDuplicateIsrcs([
  canonicaliseVendorTrack({ title: "One", isrc: "IN-AAA-26-00001" }, 0),
  canonicaliseVendorTrack({ title: "Two", isrc: "INAAA2600001" }, 1),
  canonicaliseVendorTrack({ title: "Three", isrc: "IN-BBB-26-00002" }, 2),
]);
assert.deepEqual(duplicateIsrcs, [{ isrc: "INAAA2600001", vendorIndices: [0, 1] }]);

console.log("Catalogue matcher tests passed.");
