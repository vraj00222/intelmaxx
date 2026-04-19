// CASE FILE orchestrator — one company in, one deep dossier out.
// Runs every datasource in parallel with individual deadlines so slow sources
// don't block the rest. The returned CaseFilePayload is deliberately
// self-describing: a `sources` map flags which streams landed data so the UI
// can label "NO GITHUB INTEL" etc. instead of just showing empty lists.

import { findCompanyChatter } from "@/lib/datasources/reddit";
import { findPeople, emailPatterns } from "@/lib/datasources/people";
import { matchStartupsGallery } from "@/lib/datasources/startupsgallery";
import { findYCByName, type YCCompany } from "@/lib/datasources/yc";
import { searchStories, searchShowHN } from "@/lib/datasources/hackernews";
import {
  findOrgByCompanyName,
  getOrg,
  findOrgContributors,
} from "@/lib/datasources/github_people";
import type {
  CaseFileEmployee,
  CaseFilePayload,
  CaseFileRepo,
  CaseFileSummary,
  PersonDossier,
  RedditChatterItem,
} from "./types";

/** Run a promise against a deadline; return `fallback` on timeout or error. */
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[casefile] ${label} deadline ${ms}ms — falling back`);
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        console.warn(`[casefile] ${label} failed`, e);
        resolve(fallback);
      }
    );
  });
}

/** Strip scheme/path/www from a homepage URL to get just the domain. */
function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Sniff a YC match by exact name across ALL batches (cached module-side). */
async function findYCCompany(name: string): Promise<YCCompany | null> {
  return findYCByName(name);
}

function roleHint(
  bio: string | null,
  location: string | null,
  contributionRank: number
): CaseFileEmployee["role_hint"] {
  const b = (bio || "").toLowerCase();
  if (/\b(ceo|cto|co.?founder|founder)\b/.test(b)) return "founder";
  // Top contributors without a founder hint are likely staff eng.
  if (contributionRank <= 4) return "staff";
  if (location) return "contributor";
  return "contributor";
}

/**
 * Build a short, narratable briefing string for ElevenLabs. Kept factual — we
 * leave the noir styling to the existing briefing path. Numbers are expanded
 * upstream by `normalizeForSpeech` in elevenlabs.ts.
 */
function briefingText(
  summary: CaseFileSummary,
  employees: CaseFileEmployee[],
  founders: PersonDossier[]
): string {
  const parts: string[] = [];
  parts.push(`Case file on ${summary.company_name}.`);
  if (summary.one_liner) parts.push(summary.one_liner);
  if (summary.yc_batch) parts.push(`Backed by Y Combinator, batch ${summary.yc_batch}.`);
  if (summary.team_size) parts.push(`Team of ${summary.team_size}.`);
  if (summary.location) parts.push(`Based in ${summary.location}.`);

  const founderNames = founders
    .map((f) => f.name)
    .filter((n): n is string => Boolean(n));
  if (founderNames.length) {
    parts.push(`Leadership includes ${founderNames.slice(0, 2).join(" and ")}.`);
  }
  if (employees.length) {
    parts.push(
      `${employees.length} engineers surfaced through GitHub contribution history.`
    );
  }
  parts.push("End of file.");
  return parts.join(" ");
}

export async function buildCaseFile(
  company: string,
  domainHint?: string
): Promise<CaseFilePayload> {
  const started = Date.now();
  const co = company.trim();

  // Launch every source in parallel with its own timeout. Each settles to a
  // safe default on miss so the final payload is always well-formed.
  const [yc, gallery, githubLogin, peopleIntel, hnLaunches, hnStories, chatter] =
    await Promise.all([
      withDeadline(findYCCompany(co), 8000, null, "YC lookup"),
      withDeadline(matchStartupsGallery([co]), 5000, new Map(), "gallery"),
      withDeadline(findOrgByCompanyName(co), 6000, null, "github search"),
      withDeadline(
        findPeople(co, domainHint),
        7000,
        { ceo: null, cto: null, founders: [], engineers_linkedin: [] },
        "people"
      ),
      withDeadline(searchShowHN(co, 6, { sinceDays: 365 }), 5000, [], "ShowHN"),
      withDeadline(searchStories(co, 12, { sinceDays: 365 }), 5000, [], "HN stories"),
      withDeadline(findCompanyChatter(co), 5000, { positive: [], red_flags: [], hiring_buzz: [] }, "reddit"),
    ]);

  // GitHub contributors — gated on finding an org. If no login, skip entirely.
  let repos: CaseFileRepo[] = [];
  let employees: CaseFileEmployee[] = [];
  let orgMeta: Awaited<ReturnType<typeof getOrg>> = null;
  if (githubLogin) {
    const [orgRes, contribs] = await Promise.all([
      withDeadline(getOrg(githubLogin), 5000, null, "org meta"),
      withDeadline(
        findOrgContributors(githubLogin, 3, 15),
        12000,
        { repos: [], contributors: [] },
        "contributors"
      ),
    ]);
    orgMeta = orgRes;
    repos = contribs.repos.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      language: r.language,
      url: r.html_url,
      pushed_at: r.pushed_at,
    }));
    const derivedDomain =
      normalizeDomain(domainHint) ||
      normalizeDomain(orgMeta?.blog ?? null) ||
      normalizeDomain(yc?.website ?? null);
    employees = contribs.contributors.map((c, idx) => ({
      login: c.login,
      name: c.name,
      avatar_url: c.avatar_url,
      github_url: c.html_url,
      bio: c.bio,
      blog: c.blog,
      location: c.location,
      x_url: c.x_url,
      linkedin_search_url: c.linkedin_guess,
      contributions: c.contributions,
      seen_in_repos: c.seen_in_repos,
      email_patterns:
        c.name && derivedDomain ? emailPatterns(c.name, derivedDomain) : [],
      role_hint: roleHint(c.bio, c.location, idx + 1),
    }));
  }

  // Canonical domain: prefer explicit hint > YC website > github org blog.
  const domain =
    normalizeDomain(domainHint) ||
    normalizeDomain(yc?.website ?? null) ||
    normalizeDomain(orgMeta?.blog ?? null) ||
    null;

  // Founders from people.ts (DDG scrape) + role_hint founders from GitHub bios.
  const founders: PersonDossier[] = [];
  if (peopleIntel.ceo) {
    founders.push({
      name: peopleIntel.ceo.name,
      title: "CEO",
      x_url: peopleIntel.ceo.x_url,
      linkedin_url: peopleIntel.ceo.linkedin_url,
      email_patterns: peopleIntel.ceo.email_patterns,
    });
  }
  if (peopleIntel.cto) {
    founders.push({
      name: peopleIntel.cto.name,
      title: "CTO",
      x_url: peopleIntel.cto.x_url,
      linkedin_url: peopleIntel.cto.linkedin_url,
      email_patterns: peopleIntel.cto.email_patterns,
    });
  }

  // HN buckets. "launches" = Show HN posts; "funding_mentions" = stories whose
  // titles mention the company + a funding word.
  const fundingLike = /\b(raised|raises|funding|seed|series|round|pre.?seed)\b/i;
  const funding_mentions = hnStories
    .filter((h) => h.title && fundingLike.test(h.title))
    .slice(0, 8)
    .map((h) => ({
      headline: h.title || "",
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: "hn" as const,
      created_at: h.created_at || undefined,
      points: h.points ?? undefined,
    }));

  const hn_launches = hnLaunches.slice(0, 6).map((h) => ({
    headline: h.title || "",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points ?? 0,
    num_comments: h.num_comments ?? 0,
    created_at: h.created_at || "",
  }));

  // Map reddit CultureRedFlag to RedditChatterItem shape.
  const red_flags: RedditChatterItem[] = chatter.red_flags.map((r) => ({
    headline: r.evidence,
    subreddit: r.subreddit,
    permalink: r.permalink,
    score: r.score,
    matched: r.signal,
  }));

  const galleryRef = gallery.get(co.toLowerCase()) || null;

  const summary: CaseFileSummary = {
    company_name: co,
    domain,
    one_liner: yc?.one_liner || orgMeta?.description || null,
    location: yc?.all_locations || orgMeta?.location || null,
    yc_batch: yc?.batch || null,
    team_size: yc?.team_size ?? null,
    tags: [
      ...(yc?.tags || []),
      ...(yc?.industries || []),
      ...(orgMeta?.description
        ? orgMeta.description.split(/[,|]/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
        : []),
    ].slice(0, 10),
    homepage_url: yc?.website || orgMeta?.blog || (domain ? `https://${domain}` : null),
    github_org: githubLogin,
    github_url: orgMeta?.html_url || (githubLogin ? `https://github.com/${githubLogin}` : null),
    twitter_url: orgMeta?.twitter_username
      ? `https://x.com/${orgMeta.twitter_username}`
      : null,
    gallery_url: galleryRef?.url || null,
    yc_status: yc?.status || null,
  };

  const payload: CaseFilePayload = {
    case_number: newCaseId(),
    summary,
    founders,
    employees,
    repos,
    funding_mentions,
    hn_launches,
    reddit_chatter: {
      positive: chatter.positive.map((p) => ({
        headline: p.headline,
        excerpt: p.excerpt,
        subreddit: p.subreddit,
        permalink: p.permalink,
        score: p.score,
        matched: p.matched,
      })),
      red_flags,
      hiring_buzz: chatter.hiring_buzz.map((h) => ({
        headline: h.headline,
        subreddit: h.subreddit,
        permalink: h.permalink,
        score: h.score,
      })),
    },
    briefing_text: "",
    sources: {
      github: Boolean(githubLogin && (repos.length || employees.length)),
      yc: Boolean(yc),
      gallery: Boolean(galleryRef),
      hn: hn_launches.length + funding_mentions.length > 0,
      reddit:
        chatter.positive.length + chatter.red_flags.length + chatter.hiring_buzz.length >
        0,
      people: founders.length > 0,
    },
    elapsed_ms: Date.now() - started,
  };

  payload.briefing_text = briefingText(summary, employees, founders);
  return payload;
}

function newCaseId(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `CF-${y}${mm}${dd}-${r}`;
}
