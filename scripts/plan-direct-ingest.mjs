import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

const profile = {
  id: "aac-lc-256k-v1",
  container: "m4a",
  codec: "aac-lc",
  targetBitrateKbps: 256,
  channels: "preserve-stereo-or-mono",
  sampleRate: "preserve-44100-or-48000",
  metadata: "strip-private-tags-preserve-public-track-metadata",
};

function parseArgs(argv) {
  const options = { outPath: null };
  const args = [...argv];
  while (args.length) {
    const flag = args.shift();
    if (flag === "--out") options.outPath = args.shift() || null;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const [intake, ledger] = await Promise.all([
  readJson("data/master-intake.json"),
  readJson("data/hosting-rights.json"),
]);

const plans = {};
for (const [songId, record] of Object.entries(intake?.tracks || {})) {
  if (!record || record.state === "rejected") continue;
  const sha = String(record.master?.sha256 || "").toLowerCase();
  const format = String(record.master?.format || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha) || !["wav", "flac"].includes(format)) continue;

  const profileHash = createHash("sha256")
    .update(`${sha}\n${JSON.stringify(profile)}`)
    .digest("hex");

  plans[songId] = {
    intakeState: record.state,
    hostingRightsState: ledger?.tracks?.[songId]?.state || null,
    sourceMaster: {
      sha256: sha,
      format,
      privateObjectKey: `masters/${songId}/${sha}.${format}`,
    },
    encode: {
      profile,
      planId: profileHash,
      stagingObjectKey: `encodes/${songId}/${profileHash}/stream.m4a`,
      finalObjectKeyTemplate: `tracks/${songId}/{ENCODE_SHA256}/stream.m4a`,
      finalUrlTemplate: `https://{AUDIO_HOST}/tracks/${songId}/{ENCODE_SHA256}/stream.m4a`,
      rule: "Compute SHA-256 from the completed encoded bytes before promotion. Replace {ENCODE_SHA256} only with that digest. Never overwrite an existing content-addressed object.",
    },
  };
}

const report = {
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  note: "Planning only. This script uploads, transcodes, publishes, or clears nothing.",
  plans,
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (options.outPath) {
  await writeFile(path.resolve(process.cwd(), options.outPath), output);
  console.log(`Wrote ingest plan to ${options.outPath}`);
} else {
  process.stdout.write(output);
}

console.error(`Planned ${Object.keys(plans).length} authorised master ingest(s).`);
