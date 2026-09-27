import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));

function parseArgs(argv) {
  const options = { id: null, outPath: null };
  const args = [...argv];
  while (args.length) {
    const flag = args.shift();
    if (flag === "--id") options.id = args.shift() || null;
    else if (flag === "--out") options.outPath = args.shift() || null;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

function listText(values) {
  if (!values.length) return "";
  if (values.length === 1) return String(values[0]);
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

const options = parseArgs(process.argv.slice(2));
if (!options.id) {
  console.error("Usage: node scripts/generate-licensing-request.mjs --id <outreach-id> [--out request.md]");
  process.exit(2);
}

const [queue, contacts] = await Promise.all([
  readJson("data/rights-acquisition/outreach-queue.json"),
  readJson("data/rights-acquisition/wave-01-contacts.json"),
]);

const item = (queue?.items || []).find((candidate) => candidate.id === options.id);
if (!item) throw new Error(`Unknown outreach id: ${options.id}`);
const contact = (contacts?.contacts || []).find((candidate) => candidate.batchId === item.contactBatchId);
if (!contact) throw new Error(`Missing contact-map record for ${item.contactBatchId}`);
if (item.state === "route-discovery") {
  throw new Error(`${item.id} is still route-discovery. Verify an authoritative contact before generating an outreach request.`);
}
if (["contacted", "awaiting-response", "negotiating", "closed-no-deal", "agreement-executed"].includes(item.state)) {
  throw new Error(`${item.id} is already in state ${item.state}. Generate follow-up material from the actual correspondence instead of reusing the first-contact packet.`);
}

const authorityOnly = item.state === "authority-confirmation";
const counts = item.request?.pilotTrackCounts || [];
const fields = item.request?.requiredRecordingFields || [];
const routeLines = [
  contact.primaryRoute ? `- Primary route: ${contact.primaryRoute}` : null,
  contact.secondaryRoute ? `- Secondary route: ${contact.secondaryRoute}` : null,
  contact.licensingInfo ? `- Licensing information: ${contact.licensingInfo}` : null,
  contact.catalogueRoute ? `- Catalogue route: ${contact.catalogueRoute}` : null,
].filter(Boolean).join("\n");

let body;
let subject;
if (authorityOnly) {
  subject = `GARBA licensing enquiry: confirm digital master-rights contact for ${item.entity}`;
  body = `Hello ${item.entity} team,\n\nI am contacting you on behalf of GARBA, a Gujarati Garba music catalogue and player. We are researching direct, licensed on-demand streaming of Gujarati Garba recordings and want to make sure we speak only with the person or entity that currently controls the relevant sound-recording rights.\n\nBefore discussing commercial terms, could you please confirm who is authorised to license the relevant master recordings for direct interactive web streaming, and whether your organisation controls the catalogue described below?\n\nOur current catalogue metadata is only a discovery signal and is not being treated as proof of ownership. We will reconcile any catalogue you provide by recording identifier before requesting or hosting audio.\n\nIf you are the correct licensing contact, we would next like to discuss a machine-readable catalogue export, permitted digital uses, commercial terms and authorised lossless master delivery.\n\nThank you,\nGARBA`;
} else {
  subject = `Gujarati Garba catalogue licensing enquiry for GARBA`;
  body = `Hello ${item.entity} team,\n\nI am contacting you on behalf of GARBA, a Gujarati Garba music catalogue and player. We are looking to license sound recordings for direct, on-demand web streaming rather than relying on consumer streaming-provider playback.\n\nWe would like to explore a catalogue or batch licence with your team. As a first step, could you provide a machine-readable list of the Gujarati Garba/Raas recordings that you currently own or are authorised to license? Ideally the export would include ${listText(fields)}.\n\nFor commercial comparison, we would appreciate terms for ${listText(counts.map((count) => `${count}-track`))} scopes where applicable. The rights we need priced or confirmed are: direct interactive streaming, GARBA-controlled hosting, technical transcoding to web delivery formats, and ordinary streaming cache/CDN delivery. Please quote offline playback separately rather than assuming it is included.\n\nFor recordings we ultimately license, our preferred source delivery is authorised WAV or FLAC masters with ISRC and ownership metadata. We will not use consumer-provider downloads as source masters.\n\nOur existing catalogue counts are only metadata signals used to prioritise research; we will not treat them as proof that your organisation owns a recording. Any final licensable subset would be reconciled by exact recording identifiers and written authority.\n\nCould you please direct this enquiry to the person responsible for digital music/platform licensing and let us know the best next step?\n\nThank you,\nGARBA`;
}

const signalRows = item.catalogueSignal?.rows;
const packet = `# Licensing outreach packet\n\nGenerated: ${new Date().toISOString()}\nOutreach ID: \`${item.id}\`\nState at generation: \`${item.state}\`\nEntity: ${item.entity}\n\n## Safety note\n\nThis is a first-contact draft only. Generating this file does not mark the queue item contacted, prove ownership, create a licence, or clear any recording. Verify the destination immediately before sending and record the actual send separately.\n\n## Contact routes\n\n${routeLines || "No verified send route recorded."}\n\n## Objective\n\n${item.objective}\n\n## Catalogue signal\n\n${signalRows == null ? "No current GARBA overlap count is claimed for this strategic lane." : `${signalRows} GARBA rows currently carry the relevant label metadata signal. This is not rights proof.`}\n\n## Suggested subject\n\n${subject}\n\n## Suggested first-contact body\n\n${body}\n\n## Do not send until\n\n- the destination is still controlled by the intended entity;\n- the contact appears authorised for business/licensing or can route the request;\n- no queue history indicates the request was already sent;\n- confidential contracts or private evidence are kept outside the public repository.\n`;

if (options.outPath) {
  await writeFile(path.resolve(process.cwd(), options.outPath), packet);
  console.log(`Wrote licensing request packet to ${options.outPath}`);
} else {
  process.stdout.write(packet);
}
