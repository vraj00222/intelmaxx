// LIKELY HIRING dossier — the marquee output of the pipeline.
//
// Input sources, in priority order:
//   1. FOXHOUND funding events flagged `likely_to_hire` (recent + stage-appropriate)
//   2. startups.gallery-tracked companies (fresh, curated)
//   3. Recent YC batch companies (W25/S25/F25/W26) — lean, hungry, pre-IPO
//
// For each candidate we run the gate (gating.ts), then in parallel:
//   - DDG-powered CEO/CTO X + LinkedIn lookup (people.ts)
//   - Reddit chatter sweep (reddit.ts — one call splits into 3 buckets)
//   - Pattern-guess emails off the company domain
//   - Gemma cold-email draft with copy-paste subject + body
//
// Smart skips keep per-company cost bounded. Total pipeline is parallel across
// companies, capped at 8 dossiers per mission.

import { gemmaJSON, type Provider } from "@/lib/gemma";
import { findCompanyChatter, type CompanyChatter } from "@/lib/datasources/reddit";
import { findPeople, emailPatterns, type PeopleIntel } from "@/lib/datasources/people";
import { fetchRecentYCCompanies, type YCCompany } from "@/lib/datasources/yc";
import { decideGates, guessDomain, normalizeYCBatch, ycBatchYear, type CompanyMeta } from "./gating";
import type {
  FundingIntel,
  HiringSignal,
  LikelyHiringDossier,
  MissionBrief,
  PersonDossier,
  RedditChatterItem,
} from "./types";

const MAX_DOSSIERS = 4;
const ENRICH_TIMEOUT_MS = 6_000;
const COLD_EMAIL_TIMEOUT_MS = 5_000;

/** Wrap a promise with a timeout + fallback. */
function bounded<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

// ── Candidate pooling ─────────────────────────────────────────────────

type Candidate = {
  meta: CompanyMeta;
  one_liner: string;
  url?: string;
  funding_amount?: string;
  funding_stage?: string;
  team_size?: number;
  source_label: string;
};

function fundingCandidates(funding: FundingIntel[]): Candidate[] {
  return funding
    .filter((f) => f.likely_to_hire)
    .map((f) => ({
      meta: {
        name: f.company_name,
        domain: guessDomain(f.company_name, f.company_url || f.url),
        funding_date: f.date,
        source: "funding" as const,
      },
      one_liner: f.one_liner || `${f.company_name} raised ${f.funding_amount}.`,
      url: f.company_url || f.url,
      funding_amount: f.funding_amount,
      funding_stage: f.funding_stage,
      source_label: `FOXHOUND · ${(f.funding_stage || "").toUpperCase()} · ${f.funding_amount || ""}`.trim(),
    }));
}

function signalCandidates(signals: HiringSignal[]): Candidate[] {
  // Hiring-signal-only companies (no funding event). Use them as a back-pocket
  // source when funding + YC under-supply.
  return signals
    .filter((s) => s.company_name && s.company_name.toLowerCase() !== "unknown")
    .map((s) => ({
      meta: {
        name: s.company_name,
        domain: guessDomain(s.company_name),
        source: "gallery" as const, // treat as curated/active source
      },
      one_liner: s.signal_text || `${s.company_name} is actively hiring.`,
      url: s.apply_url || s.source_url,
      source_label: `WIRETAP · ${s.signal_type.replace(/_/g, " ")}`,
    }));
}

function ycCandidates(companies: YCCompany[]): Candidate[] {
  return companies.map((c) => {
    const normBatch = normalizeYCBatch(c.batch || "") || undefined;
    const hiringTag = c.isHiring ? " · HIRING" : "";
    return {
      meta: {
        name: c.name,
        domain: c.website ? guessDomain(c.name, c.website) : guessDomain(c.name),
        yc_batch: normBatch,
        founded_year: c.launched_at
          ? new Date(c.launched_at * 1000).getFullYear()
          : ycBatchYear(c.batch || "") || undefined,
        headcount_estimate: c.team_size,
        source: "yc" as const,
      },
      one_liner: c.one_liner || c.long_description?.slice(0, 140) || `YC ${normBatch || "batch"} company.`,
      url: c.website,
      team_size: c.team_size,
      source_label: `YC ${normBatch || ""}${c.team_size ? ` · ${c.team_size} ppl` : ""}${hiringTag}`,
    };
  });
}

function dedupeByName(cands: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>();
  for (const c of cands) {
    const key = (c.meta.name || "").toLowerCase().trim();
    if (!key) continue;
    // Prefer entries with more metadata — funding > yc > gallery
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
      continue;
    }
    const rank = (x: Candidate) => (x.meta.funding_date ? 3 : x.meta.yc_batch ? 2 : 1);
    if (rank(c) > rank(existing)) seen.set(key, c);
  }
  return [...seen.values()];
}

// ── Main entry ────────────────────────────────────────────────────────

export async function runDossierAgent(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  provider?: Provider
): Promise<LikelyHiringDossier[]> {
  if (mission.mission_type !== "hiring" && mission.mission_type !== "general") {
    return [];
  }

  // YC is slow-ish (4 parallel JSON fetches) — kick it off first so it overlaps.
  const ycP = bounded(
    fetchRecentYCCompanies(mission.keywords, mission.industry, 4, 18),
    8_000,
    [] as YCCompany[]
  );

  const yc = await ycP;

  const pool = dedupeByName([
    ...fundingCandidates(funding),
    ...ycCandidates(yc),
    ...signalCandidates(signals),
  ]);

  // Apply gate first — drops companies that fail the "young + lean + fresh money"
  // test. Sort remaining by source-priority + recency.
  const gated = pool
    .map((c) => ({ c, gate: decideGates(c.meta, mission.mission_type) }))
    .filter((g) => g.gate.is_likely_hiring)
    .slice(0, MAX_DOSSIERS);

  if (!gated.length) return [];

  const dossiers = await Promise.all(
    gated.map(({ c, gate }) => buildDossier(c, gate, mission, provider))
  );

  return dossiers.filter(Boolean) as LikelyHiringDossier[];
}

async function buildDossier(
  c: Candidate,
  gate: ReturnType<typeof decideGates>,
  mission: MissionBrief,
  provider?: Provider
): Promise<LikelyHiringDossier | null> {
  const emptyChatter: CompanyChatter = { positive: [], red_flags: [], hiring_buzz: [] };
  const emptyPeople: PeopleIntel = { ceo: null, cto: null, founders: [], engineers_linkedin: [] };

  // Kick off enrichment in parallel, each with its own timeout.
  const peopleP = gate.do_people_lookup
    ? bounded(findPeople(c.meta.name, c.meta.domain), ENRICH_TIMEOUT_MS, emptyPeople)
    : Promise.resolve(emptyPeople);
  const redditP = gate.do_reddit
    ? bounded(findCompanyChatter(c.meta.name), ENRICH_TIMEOUT_MS, emptyChatter)
    : Promise.resolve(emptyChatter);

  const [people, chatter] = await Promise.all([peopleP, redditP]);

  // Cold email — generate even if no person found (use pattern + role).
  const { subject, body } = await bounded(
    craftColdEmail(c, people, mission, provider),
    COLD_EMAIL_TIMEOUT_MS,
    fallbackColdEmail(c, people)
  );

  const age = c.meta.founded_year ? new Date().getFullYear() - c.meta.founded_year : undefined;

  const toPerson = (p: PeopleIntel["ceo"]): PersonDossier | null =>
    p
      ? {
          name: p.name,
          title: p.title,
          x_url: p.x_url,
          linkedin_url: p.linkedin_url,
          email_patterns:
            p.email_patterns.length
              ? p.email_patterns
              : p.name && c.meta.domain
              ? emailPatterns(p.name, c.meta.domain)
              : c.meta.domain
              ? [`hello@${c.meta.domain}`, `founders@${c.meta.domain}`]
              : [],
        }
      : null;

  const mapChatter = (arr: CompanyChatter["positive"]): RedditChatterItem[] =>
    arr.map((x) => ({
      headline: x.headline,
      excerpt: x.excerpt,
      subreddit: x.subreddit,
      permalink: x.permalink,
      score: x.score,
      matched: x.matched,
    }));

  const mapRedFlags = (arr: CompanyChatter["red_flags"]): RedditChatterItem[] =>
    arr.map((x) => ({
      headline: x.signal.toUpperCase(),
      excerpt: x.evidence,
      subreddit: x.subreddit,
      permalink: x.permalink,
      score: x.score,
      matched: x.signal,
    }));

  const mapHiringBuzz = (arr: CompanyChatter["hiring_buzz"]): RedditChatterItem[] =>
    arr.map((x) => ({
      headline: x.headline,
      subreddit: x.subreddit,
      permalink: x.permalink,
      score: x.score,
    }));

  return {
    company_name: c.meta.name,
    domain: c.meta.domain || null,
    source: c.meta.source === "funding" ? "funding" : c.meta.source === "yc" ? "yc" : "gallery",
    source_label: c.source_label,
    one_liner: c.one_liner,
    funding_amount: c.funding_amount,
    funding_stage: c.funding_stage,
    funding_date: c.meta.funding_date,
    yc_batch: c.meta.yc_batch,
    team_size: c.team_size,
    age_years: age,
    url: c.url,
    ceo: toPerson(people.ceo),
    cto: toPerson(people.cto),
    engineers_linkedin: people.engineers_linkedin,
    reddit_positive: mapChatter(chatter.positive),
    reddit_red_flags: mapRedFlags(chatter.red_flags),
    reddit_hiring_buzz: mapHiringBuzz(chatter.hiring_buzz),
    cold_email_subject: subject,
    cold_email_body: body,
    gate_reasons: gate.reasons,
  };
}

// ── Cold email crafting ───────────────────────────────────────────────

async function craftColdEmail(
  c: Candidate,
  people: PeopleIntel,
  mission: MissionBrief,
  provider?: Provider
): Promise<{ subject: string; body: string }> {
  const target = people.ceo?.name || people.cto?.name || "founder";
  const role = people.ceo?.name ? "CEO" : people.cto?.name ? "CTO" : "founding team";
  const hook = c.funding_amount
    ? `just closed ${c.funding_stage?.toUpperCase() || "a round"}${c.funding_amount ? ` — ${c.funding_amount}` : ""}`
    : c.meta.yc_batch
    ? `YC ${c.meta.yc_batch}, scaling fast`
    : c.one_liner;

  const system = `You are PROFILER. Write ONE cold email from a mission candidate
(likely software engineer / new-grad) to the ${role} of ${c.meta.name}. Tone: brief,
direct, no groveling, shows awareness of the company's moment. 3 short paragraphs.
Max 120 words body. Must include:
  - Opening that references the company's recent signal ("${hook}")
  - One sentence positioning the candidate as useful for their current phase
  - Concrete ask ("15 min on a call this week?" or "mind if I send a PR on X first?")

Mission context: "${mission.raw}" (industry: ${mission.industry}, role: ${mission.role_type}).

Respond ONLY with JSON:
{ "subject": "...", "body": "..." }
Subject: <= 55 chars, intriguing, not clickbait. Use the recipient's first name if
known ("${target}"), else omit names.
No fences, no preamble.`;

  const out = await gemmaJSON<{ subject?: string; body?: string }>(
    [
      { role: "system", content: system },
      { role: "user", content: `COMPANY: ${c.meta.name}\nHOOK: ${hook}\nRECIPIENT: ${target}` },
    ],
    { max_tokens: 400, temperature: 0.55, provider }
  );

  if (!out.subject || !out.body) return fallbackColdEmail(c, people);
  return { subject: out.subject.slice(0, 80), body: out.body.slice(0, 900) };
}

function fallbackColdEmail(c: Candidate, people: PeopleIntel): { subject: string; body: string } {
  const target = people.ceo?.name?.split(" ")[0] || people.cto?.name?.split(" ")[0] || "there";
  const hook = c.funding_amount
    ? `saw you closed ${c.funding_stage?.toUpperCase() || "a round"} (${c.funding_amount})`
    : c.meta.yc_batch
    ? `saw ${c.meta.name} is in YC ${c.meta.yc_batch}`
    : `been following ${c.meta.name}`;
  return {
    subject: `Quick note — ${c.meta.name}`,
    body: `Hey ${target},\n\n${hook} — congrats on the momentum. I work in ${c.meta.name.includes("AI") ? "AI infra" : "engineering"} and think I could move fast for you at this stage.\n\nWould you be open to a 15-minute call this week? Happy to lead with a concrete proposal — I can ship a small PR or prototype first if that's useful.\n\nBest,\n[your name]`,
  };
}
