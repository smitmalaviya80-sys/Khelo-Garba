import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const contactsDoc = JSON.parse(await readFile(path.join(root, "data/rights-acquisition/wave-01-contacts.json"), "utf8"));
const contacts = contactsDoc?.contacts || [];

const blockedActiveHosts = new Set([
  "socialveins.com",
  "bookingagentinfo.com",
  "heepsy.com",
  "connectwithinfluencers.com",
  "soormandir.org",
  "www.soormandir.org",
]);

const ids = new Set();
let failed = false;
const fail = (message) => { console.error(`✗ ${message}`); failed = true; };
const nonEmpty = (value) => Boolean(String(value ?? "").trim());

function parseUrl(value, label) {
  if (!nonEmpty(value)) return null;
  try {
    const url = new URL(String(value));
    if (!/^https?:$/.test(url.protocol)) fail(`${label}: route must use HTTP or HTTPS`);
    return url;
  } catch {
    fail(`${label}: invalid URL ${JSON.stringify(value)}`);
    return null;
  }
}

function normaliseUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

for (const contact of contacts) {
  const id = String(contact?.batchId || "").trim();
  if (!id) {
    fail("contact record is missing batchId");
    continue;
  }
  if (ids.has(id)) fail(`${id}: duplicate batchId`);
  ids.add(id);
  if (!nonEmpty(contact.entity)) fail(`${id}: missing entity`);
  if (!nonEmpty(contact.contactState)) fail(`${id}: missing contactState`);
  if (!nonEmpty(contact.confidence)) fail(`${id}: missing confidence`);
  if (!Array.isArray(contact.evidence) || !contact.evidence.length) fail(`${id}: evidence must be a non-empty array`);

  const activeRoutes = [
    ["primaryRoute", contact.primaryRoute],
    ["secondaryRoute", contact.secondaryRoute],
    ["catalogueRoute", contact.catalogueRoute],
    ["licensingInfo", contact.licensingInfo],
  ].filter(([, value]) => nonEmpty(value));

  for (const [field, value] of activeRoutes) {
    const url = parseUrl(value, `${id}.${field}`);
    if (!url) continue;
    if (blockedActiveHosts.has(url.hostname.toLowerCase())) {
      fail(`${id}.${field}: ${url.hostname} is blocked as an active rights-contact route`);
    }
  }

  for (const [index, value] of (contact.evidence || []).entries()) {
    parseUrl(value, `${id}.evidence[${index}]`);
  }

  const unrelated = contact?.identity?.knownUnrelatedRoutes || [];
  if (!Array.isArray(unrelated)) {
    fail(`${id}: identity.knownUnrelatedRoutes must be an array when present`);
  } else {
    const unrelatedSet = new Set(unrelated.map(normaliseUrl));
    for (const [index, value] of unrelated.entries()) parseUrl(value, `${id}.identity.knownUnrelatedRoutes[${index}]`);
    for (const [field, value] of activeRoutes) {
      if (unrelatedSet.has(normaliseUrl(value))) fail(`${id}.${field}: route is explicitly listed as unrelated`);
    }
  }

  if (/ready-for|ready-to/i.test(String(contact.contactState)) && !nonEmpty(contact.primaryRoute)) {
    fail(`${id}: ready contact state requires primaryRoute`);
  }

  if (/contact-discovery-needed/i.test(String(contact.contactState)) && nonEmpty(contact.primaryRoute)) {
    fail(`${id}: contact-discovery-needed must not expose primaryRoute until the route is directly verified`);
  }

  const candidateStatus = String(contact?.identity?.candidateRouteStatus || "").toLowerCase();
  if (candidateStatus && !candidateStatus.includes("not") && !candidateStatus.includes("unresolved") && !candidateStatus.includes("third-party")) {
    fail(`${id}: candidateRouteStatus should clearly preserve unresolved/non-authoritative status`);
  }
}

if (failed) process.exit(1);
console.log(`✓ ${contacts.length} rights-contact record(s) pass identity and route-safety validation`);
console.log("✓ known influencer/booking aggregators and unrelated Soor Mandir identities cannot become active licensing routes");
console.log("✓ contact-discovery lanes cannot expose a primary send route before direct verification");
