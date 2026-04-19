import type { MissionType } from "./types";

/**
 * Smart gating layer — the "senior-level wit" that skips expensive lookups when
 * they can't yield signal. Every downstream dossier call runs through this to
 * cut latency and avoid noise.
 */

export type CompanyMeta = {
  name: string;
  domain?: string;
  founded_year?: number;
  headcount_estimate?: number;
  funding_date?: string; // ISO or yyyy-mm-dd
  yc_batch?: string; // e.g. "W25", "S25"
  source: "funding" | "yc" | "gallery" | "signal" | "oss";
};

export type GateDecision = {
  do_reddit: boolean;
  do_people_lookup: boolean;
  do_email_pattern: boolean;
  do_cold_email: boolean;
  is_likely_hiring: boolean;
  reasons: string[];
};

const now = () => Date.now();
const YEAR_MS = 365 * 86400 * 1000;

// Megacorps and household-name scaleups — they already have a career page,
// a recruiter team, and 50k LinkedIn followers. Surfacing them in the
// "off-grid" dossier is noise. Match is case-insensitive, substring-safe on
// whole-word boundaries.
const GIANTS_BLOCKLIST: readonly string[] = [
  // FAANG + big tech
  "google", "alphabet", "meta", "facebook", "instagram", "whatsapp",
  "apple", "amazon", "aws", "microsoft", "github", "linkedin", "netflix",
  "nvidia", "intel", "ibm", "oracle", "salesforce", "sap", "adobe",
  // Established OSS / framework giants (not startups anymore)
  "laravel", "rails", "django", "react", "vue", "angular", "nodejs",
  "wordpress", "automattic",
  // Scaleups past the hiring-hungry window
  "stripe", "shopify", "square", "block", "paypal", "coinbase", "databricks",
  "snowflake", "palantir", "uber", "lyft", "airbnb", "doordash", "instacart",
  "twilio", "zoom", "slack", "atlassian", "dropbox", "box", "asana",
  "figma", "canva", "notion", "linear", "discord", "reddit", "spotify",
  "tiktok", "bytedance", "twitter", "x corp", "anthropic", "openai",
  "tesla", "spacex", "nike", "disney", "walmart", "target",
  // AI / dev-tool scaleups that already dominate every OSS leaderboard —
  // even the -labs / -ai / -js suborgs read as famous to a contributor.
  "vercel", "vercel-labs", "langchain", "langchain-ai", "supabase",
  "hashicorp", "mongodb", "elastic", "redis", "cloudflare", "huggingface",
  "hugging-face", "replicate", "fly", "planetscale", "railway",
  // Frameworks / tools so established they're not "startups" anymore
  "remix-run", "sveltejs", "nuxt", "astro", "vitejs", "vitest", "webpack",
  "babel", "eslint", "prettier", "typescript", "tailwindlabs",
];

export function isGiant(name: string): boolean {
  const n = (name || "").toLowerCase().trim();
  if (!n) return false;
  for (const g of GIANTS_BLOCKLIST) {
    // Whole-word match: allow "OpenAI Inc" but not "OpenAIsomething"
    const re = new RegExp(`(^|[^a-z0-9])${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(n)) return true;
  }
  return false;
}

export function ageYears(meta: CompanyMeta): number | null {
  if (meta.founded_year) {
    return new Date().getFullYear() - meta.founded_year;
  }
  if (meta.yc_batch) {
    const y = ycBatchYear(meta.yc_batch);
    if (y) return new Date().getFullYear() - y;
  }
  return null;
}

/** Normalize "Winter 2025" | "W25" | "W2025" → "W25" (uppercase, 2-digit year). */
export function normalizeYCBatch(batch: string): string | null {
  const s = (batch || "").trim();
  if (!s) return null;
  // Short form: W25 / S25 / F25
  const short = /^([WSF])(\d{2}|\d{4})$/i.exec(s);
  if (short) {
    const season = short[1].toUpperCase();
    const yr = short[2].length === 4 ? short[2].slice(-2) : short[2];
    return `${season}${yr}`;
  }
  // Long form: "Winter 2025", "Summer 2025", "Fall 2025"
  const long = /^(winter|summer|fall|spring)\s+(\d{4})$/i.exec(s);
  if (long) {
    const seasonWord = long[1].toLowerCase();
    const season = seasonWord.startsWith("w") ? "W" : seasonWord.startsWith("s") && seasonWord !== "spring" ? "S" : seasonWord.startsWith("f") ? "F" : seasonWord === "spring" ? "S" : null;
    if (!season) return null;
    return `${season}${long[2].slice(-2)}`;
  }
  return null;
}

export function ycBatchYear(batch: string): number | null {
  const norm = normalizeYCBatch(batch);
  if (!norm) return null;
  return 2000 + parseInt(norm.slice(1), 10);
}

function fundingAgeDays(meta: CompanyMeta): number | null {
  if (!meta.funding_date) return null;
  const t = Date.parse(meta.funding_date);
  if (Number.isNaN(t)) return null;
  return Math.floor((now() - t) / 86400 / 1000);
}

/**
 * Decide which enrichment calls to run for a given company. This is the
 * brain of the pipeline — applied once per dossier, used everywhere.
 */
export function decideGates(meta: CompanyMeta, mission_type: MissionType): GateDecision {
  const reasons: string[] = [];
  const age = ageYears(meta);
  const fundAge = fundingAgeDays(meta);

  // Reddit: skip when the company is brand-new (no chatter yet) or mission is
  // pure research (the candidate cares about the tech, not culture).
  let do_reddit = true;
  if (age !== null && age < 1) {
    do_reddit = false;
    reasons.push("reddit:skip(age<1yr)");
  }
  if (mission_type === "research") {
    do_reddit = false;
    reasons.push("reddit:skip(research)");
  }

  // People lookup (X/LinkedIn via search): skip when we have no name/domain
  // to query, or mission is OSS-contrib (repo matters more than founders).
  let do_people_lookup = true;
  if (!meta.name) {
    do_people_lookup = false;
    reasons.push("people:skip(no-name)");
  }
  if (mission_type === "oss_contrib") {
    do_people_lookup = false;
    reasons.push("people:skip(oss_contrib)");
  }

  // Email pattern: need a domain.
  let do_email_pattern = Boolean(meta.domain);
  if (!do_email_pattern) reasons.push("email:skip(no-domain)");

  // Cold email draft: only worth generating if we can actually deliver it.
  const do_cold_email = do_email_pattern && do_people_lookup;

  // Likely-hiring classification — the crown jewel. Must be young, lean, and
  // funded recently OR a recent YC batch. Megacorps are hard-rejected — they
  // dominate search results but already have infinite applicants.
  let is_likely_hiring = false;
  const reasonsLH: string[] = [];
  const giant = isGiant(meta.name);
  if (giant) reasonsLH.push("giant-blocked");
  const youngEnough = age === null ? true : age <= 8;
  const leanEnough =
    meta.headcount_estimate === undefined || meta.headcount_estimate <= 100;
  const recentFunding = fundAge !== null && fundAge <= 365;
  const recentYC = meta.yc_batch
    ? isRecentYC(meta.yc_batch, 4)
    : false;
  // startups.gallery is a hand-curated index of early-stage companies —
  // presence there is itself a young+hiring signal when we have no other data.
  const curatedGallery = meta.source === "gallery" && !meta.funding_date && !meta.yc_batch;
  if (!giant && youngEnough && leanEnough && (recentFunding || recentYC || curatedGallery)) {
    is_likely_hiring = true;
    if (recentFunding) reasonsLH.push("funded<=1yr");
    if (recentYC) reasonsLH.push(`yc:${meta.yc_batch}`);
    if (curatedGallery) reasonsLH.push("gallery-curated");
  } else {
    if (!youngEnough) reasonsLH.push("too-old");
    if (!leanEnough) reasonsLH.push("too-big");
    if (!recentFunding && !recentYC) reasonsLH.push("no-fresh-money");
  }
  reasons.push(`likely_hiring:${is_likely_hiring ? "yes" : "no"}(${reasonsLH.join(",")})`);

  return {
    do_reddit,
    do_people_lookup,
    do_email_pattern,
    do_cold_email,
    is_likely_hiring,
    reasons,
  };
}

/** Is this YC batch within the last N batches? YC runs 3 per year: W, S, F.
 *  Accepts both "W25" and "Winter 2025" style inputs. */
export function isRecentYC(batch: string, lastN: number): boolean {
  const norm = normalizeYCBatch(batch);
  if (!norm) return false;
  const ordered = recentYCBatches(lastN);
  return ordered.includes(norm);
}

/** Last N YC batches relative to today. Returns codes like ["W26","F25","S25","W25"]. */
export function recentYCBatches(n: number): string[] {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  // Rough schedule: W starts Jan, S starts Jun, F starts Sep.
  // At any given time, the "current or most recent" batch is:
  const seasons: Array<"W" | "S" | "F"> = ["W", "S", "F"];
  let idx: number;
  if (m >= 9) idx = 2; // F
  else if (m >= 6) idx = 1; // S
  else idx = 0; // W
  const out: string[] = [];
  let cy = y;
  for (let i = 0; i < n; i++) {
    out.push(`${seasons[idx]}${String(cy).slice(-2)}`);
    idx -= 1;
    if (idx < 0) {
      idx = 2;
      cy -= 1;
    }
  }
  return out;
}

/** Heuristic domain extractor from a name or URL. */
export function guessDomain(name: string, url?: string): string | undefined {
  if (url) {
    try {
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./, "");
      // Filter out news/article domains we don't want as the company's own
      const skip = ["news.ycombinator.com", "techcrunch.com", "medium.com", "github.com", "linkedin.com", "twitter.com", "x.com"];
      if (!skip.includes(h)) return h;
    } catch {
      // fall through
    }
  }
  const slug = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (!slug || slug.length < 2) return undefined;
  return `${slug}.com`;
}
