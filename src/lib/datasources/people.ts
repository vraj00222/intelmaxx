// People discovery — find CEO / CTO X (Twitter) handles and LinkedIn URLs for
// a given company, plus pattern-guess email addresses once we have a domain.
// Uses DuckDuckGo HTML under the hood (no API key). All calls are bounded to
// <= 6s each and the people-lookup gate is applied BEFORE calling this file.

import { searchWeb, findFirst, type SearchHit } from "./search";

export type PersonRef = {
  name: string | null;
  title: "CEO" | "CTO" | "Founder";
  x_url: string | null;
  linkedin_url: string | null;
  email_patterns: string[]; // best-guess addresses, unverified
};

export type PeopleIntel = {
  ceo: PersonRef | null;
  cto: PersonRef | null;
  founders: PersonRef[];
  engineers_linkedin: string[]; // public LinkedIn profile URLs
};

const X_HOSTS = ["twitter.com", "x.com"];
const LI_HOST = "linkedin.com/in/";

// ── Handle/URL extraction helpers ─────────────────────────────────────

function pickXUrl(hits: SearchHit[], nameHint?: string): string | null {
  const hint = (nameHint || "").toLowerCase();
  // Prefer profile URLs (single path segment), skip status/tweet URLs.
  for (const h of hits) {
    try {
      const u = new URL(h.url);
      const host = u.hostname.replace(/^www\./, "");
      if (!X_HOSTS.includes(host)) continue;
      const path = u.pathname.replace(/^\/|\/$/g, "");
      if (!path || path.includes("/")) continue; // skip /user/status/...
      if (["home", "search", "explore", "i"].includes(path.toLowerCase())) continue;
      if (hint && !(h.title + " " + h.snippet).toLowerCase().includes(hint)) continue;
      return `https://x.com/${path}`;
    } catch {
      // ignore
    }
  }
  return null;
}

function pickLinkedInUrl(hits: SearchHit[], nameHint?: string): string | null {
  const hint = (nameHint || "").toLowerCase();
  for (const h of hits) {
    if (!h.url.toLowerCase().includes(LI_HOST)) continue;
    if (hint && !(h.title + " " + h.snippet).toLowerCase().includes(hint)) continue;
    // Normalize to https://www.linkedin.com/in/<slug>
    try {
      const u = new URL(h.url);
      const m = /\/in\/([^/?#]+)/.exec(u.pathname);
      if (!m) continue;
      return `https://www.linkedin.com/in/${m[1]}`;
    } catch {
      // ignore
    }
  }
  return null;
}

// Extract a plausible human name from search result titles. DDG often returns
// titles like "Jane Doe - CEO at Acme | LinkedIn" or "Jane Doe (@janedoe) / X".
function extractName(hits: SearchHit[], company: string): string | null {
  const co = company.toLowerCase();
  for (const h of hits) {
    const raw = h.title || "";
    // Patterns we've seen in the wild:
    //  "Jane Doe - CEO of Acme | LinkedIn"
    //  "Jane Doe | CEO at Acme"
    //  "Jane Doe (@janedoe) / X"
    const m =
      /^([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3})\s*[-|]/.exec(raw) ||
      /^([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3})\s*\(/.exec(raw);
    if (!m) continue;
    const name = m[1].trim();
    // Sanity: if company name is embedded in the extracted name, skip it
    if (name.toLowerCase().includes(co) && co.length >= 3) continue;
    if (name.split(/\s+/).length < 2) continue;
    return name;
  }
  return null;
}

// ── Email pattern guesser ─────────────────────────────────────────────

export function emailPatterns(firstLast: string, domain: string): string[] {
  const parts = firstLast
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length || !domain) return [];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const out = new Set<string>();
  out.add(`${first}@${domain}`);
  if (first !== last) {
    out.add(`${first}.${last}@${domain}`);
    out.add(`${first[0]}${last}@${domain}`);
    out.add(`${first}${last[0]}@${domain}`);
  }
  out.add(`hello@${domain}`);
  out.add(`founders@${domain}`);
  return [...out];
}

// ── Main lookup ───────────────────────────────────────────────────────

/**
 * One call returns everything the dossier card needs: CEO + CTO refs (X,
 * LinkedIn, email patterns), founders list, and a handful of engineer
 * LinkedIn URLs for cold-DM outreach.
 *
 * Design note: this does 3 DDG searches in parallel. Cost ≈ 1.5s per company.
 * Gate it upstream for anything where you don't actually need the intel.
 */
export async function findPeople(
  company: string,
  domain?: string
): Promise<PeopleIntel> {
  const empty: PeopleIntel = { ceo: null, cto: null, founders: [], engineers_linkedin: [] };
  const co = (company || "").trim();
  if (!co) return empty;

  const [ceoHits, ctoHits, engHits] = await Promise.all([
    searchWeb(`"${co}" CEO site:linkedin.com/in OR site:twitter.com OR site:x.com`, 10),
    searchWeb(`"${co}" CTO site:linkedin.com/in OR site:twitter.com OR site:x.com`, 10),
    searchWeb(`"${co}" engineer site:linkedin.com/in`, 10),
  ]);

  const ceoName = extractName(ceoHits, co);
  const ctoName = extractName(ctoHits, co);

  const ceo: PersonRef = {
    name: ceoName,
    title: "CEO",
    x_url: pickXUrl(ceoHits, ceoName || undefined),
    linkedin_url: pickLinkedInUrl(ceoHits, ceoName || undefined),
    email_patterns: ceoName && domain ? emailPatterns(ceoName, domain) : [],
  };
  const cto: PersonRef = {
    name: ctoName,
    title: "CTO",
    x_url: pickXUrl(ctoHits, ctoName || undefined),
    linkedin_url: pickLinkedInUrl(ctoHits, ctoName || undefined),
    email_patterns: ctoName && domain ? emailPatterns(ctoName, domain) : [],
  };

  const engineers_linkedin: string[] = [];
  const seen = new Set<string>();
  for (const h of engHits) {
    if (!h.url.toLowerCase().includes(LI_HOST)) continue;
    try {
      const u = new URL(h.url);
      const m = /\/in\/([^/?#]+)/.exec(u.pathname);
      if (!m) continue;
      const norm = `https://www.linkedin.com/in/${m[1]}`;
      if (seen.has(norm)) continue;
      seen.add(norm);
      engineers_linkedin.push(norm);
      if (engineers_linkedin.length >= 5) break;
    } catch {
      // ignore
    }
  }

  const hasSignal = (p: PersonRef) => p.x_url || p.linkedin_url || p.name;
  return {
    ceo: hasSignal(ceo) ? ceo : null,
    cto: hasSignal(cto) ? cto : null,
    founders: [],
    engineers_linkedin,
  };
}

// Convenience single-field lookups (exported in case callers want cheaper calls)
export async function findXHandle(company: string, role: "CEO" | "CTO"): Promise<string | null> {
  return findFirst(`"${company}" ${role} site:x.com OR site:twitter.com`, "x.com");
}
