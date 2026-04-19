// Reddit search — public JSON endpoint. Needs a non-default User-Agent or it 429s.
// Used for culture / red-flag intel on a target company:
//   - ghost interviews, ghosting after final round
//   - toxic culture, burnout, layoffs
//   - hiring freeze / rescinded offers
//   - "do not work here" / bad management

const UA = "IntelMaxxing/1.0 (https://intelmaxxing.tech)";

const CULTURE_SUBS = [
  "cscareerquestions",
  "recruitinghell",
  "ycombinator",
  "startups",
  "antiwork",
  "layoffs",
];

const RED_FLAG_KEYWORDS = [
  "ghost interview",
  "ghosted",
  "ghosted me",
  "ghosted after",
  "rescinded",
  "rescinded offer",
  "layoffs",
  "laid off",
  "toxic",
  "burnout",
  "burned out",
  "terrible management",
  "do not work",
  "don't work here",
  "bad experience",
  "red flag",
  "hiring freeze",
  "bait and switch",
  "underpaid",
  "micromanage",
];

export type RedditHit = {
  title: string;
  selftext: string;
  subreddit: string;
  score: number;
  permalink: string;
  created_utc: number;
};

type SearchResp = {
  data?: {
    children?: Array<{ data: RedditHit }>;
  };
};

/**
 * Search reddit.com/search.json for recent posts mentioning a company alongside
 * culture / red-flag keywords. Returns raw hits so callers can parse.
 */
async function searchReddit(query: string, limit = 15, timeRange: "month" | "year" = "year"): Promise<RedditHit[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    query
  )}&limit=${limit}&sort=relevance&t=${timeRange}&restrict_sr=on`;
  // restrict_sr only works inside a sub. For cross-sub search:
  const crossUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    query
  )}&limit=${limit}&sort=relevance&t=${timeRange}`;
  try {
    const res = await fetch(crossUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SearchResp;
    return (data.data?.children || []).map((c) => c.data).filter(Boolean);
  } catch {
    return [];
  }
  // crossUrl used; url kept for reference suppression
  void url;
}

export type CultureRedFlag = {
  signal: string;           // e.g. "ghost interview", "layoffs"
  evidence: string;         // short excerpt (<= 160 chars)
  subreddit: string;
  permalink: string;        // reddit permalink (absolute)
  score: number;
};

/**
 * For a given company name, surface up to 3 red-flag posts.
 * Filters: post must contain company name + at least one red-flag keyword,
 * subreddit should be career/work related, and score > 1 to drop spam.
 */
export async function findCultureRedFlags(
  companyName: string,
  limit = 3
): Promise<CultureRedFlag[]> {
  const clean = (companyName || "").trim();
  if (!clean || clean.length < 2) return [];

  // One targeted query — reddit rate-limits hard, so keep it to one call per company.
  const query = `"${clean}" (ghost OR ghosted OR toxic OR layoffs OR rescinded OR "red flag" OR burnout)`;
  const hits = await searchReddit(query, 20, "year");

  const lowerName = clean.toLowerCase();
  const flags: CultureRedFlag[] = [];

  for (const h of hits) {
    const text = `${h.title || ""} ${h.selftext || ""}`.toLowerCase();
    if (!text.includes(lowerName)) continue;
    if ((h.score ?? 0) < 2) continue;

    const sub = (h.subreddit || "").toLowerCase();
    const relevant =
      CULTURE_SUBS.includes(sub) ||
      sub.startsWith("jobs") ||
      sub.includes("career") ||
      sub.includes("work");
    if (!relevant) continue;

    const matched = RED_FLAG_KEYWORDS.find((k) => text.includes(k));
    if (!matched) continue;

    const excerpt = (h.title || h.selftext || "").replace(/\s+/g, " ").slice(0, 160);
    flags.push({
      signal: matched,
      evidence: excerpt,
      subreddit: h.subreddit,
      permalink: `https://www.reddit.com${h.permalink}`,
      score: h.score,
    });

    if (flags.length >= limit) break;
  }

  return flags;
}

// ────────────────────────────────────────────────────────────────
// Positive / neutral chatter — the flip side of red flags
// ────────────────────────────────────────────────────────────────

const BUZZ_SUBS = [
  "startups",
  "ycombinator",
  "programming",
  "cscareerquestions",
  "webdev",
  "MachineLearning",
  "sideproject",
  "indiehackers",
];

const POSITIVE_KEYWORDS = [
  "launched",
  "launch",
  "love this",
  "impressive",
  "product hunt",
  "show hn",
  "raised",
  "hiring",
  "we are hiring",
  "open roles",
  "open positions",
  "just joined",
  "excited to announce",
];

export type CompanyChatter = {
  positive: Array<{
    headline: string;
    excerpt: string;
    subreddit: string;
    permalink: string;
    score: number;
    matched: string;
  }>;
  red_flags: CultureRedFlag[];
  hiring_buzz: Array<{
    headline: string;
    subreddit: string;
    permalink: string;
    score: number;
  }>;
};

/**
 * One consolidated Reddit sweep per company. Pulls up to 20 hits in a single
 * call, then splits into positive / red-flag / hiring-buzz buckets — cheaper
 * than three separate requests and Reddit rate-limits HARD.
 */
export async function findCompanyChatter(companyName: string): Promise<CompanyChatter> {
  const clean = (companyName || "").trim();
  const empty: CompanyChatter = { positive: [], red_flags: [], hiring_buzz: [] };
  if (!clean || clean.length < 2) return empty;

  const query = `"${clean}"`;
  const hits = await searchReddit(query, 25, "year");
  if (!hits.length) return empty;

  const lowerName = clean.toLowerCase();
  const positive: CompanyChatter["positive"] = [];
  const red_flags: CultureRedFlag[] = [];
  const hiring_buzz: CompanyChatter["hiring_buzz"] = [];

  for (const h of hits) {
    const blob = `${h.title || ""} ${h.selftext || ""}`;
    const low = blob.toLowerCase();
    if (!low.includes(lowerName)) continue;
    if ((h.score ?? 0) < 2) continue;

    const sub = (h.subreddit || "").toLowerCase();
    const permalink = `https://www.reddit.com${h.permalink}`;
    const headline = (h.title || "").slice(0, 140);
    const excerpt = blob.replace(/\s+/g, " ").slice(0, 160);

    // Red-flag check
    const isCareerSub =
      CULTURE_SUBS.includes(sub) ||
      sub.startsWith("jobs") ||
      sub.includes("career") ||
      sub.includes("work");
    const redMatch = RED_FLAG_KEYWORDS.find((k) => low.includes(k));
    if (isCareerSub && redMatch && red_flags.length < 3) {
      red_flags.push({
        signal: redMatch,
        evidence: excerpt,
        subreddit: h.subreddit,
        permalink,
        score: h.score,
      });
      continue;
    }

    // Hiring-buzz check — posts mentioning the company + hiring words
    const hiringHit = /\b(hiring|open roles|open positions|we are hiring|looking for|join our team)\b/i.test(blob);
    if (hiringHit && hiring_buzz.length < 3) {
      hiring_buzz.push({
        headline,
        subreddit: h.subreddit,
        permalink,
        score: h.score,
      });
      continue;
    }

    // Positive / neutral buzz
    const isBuzzSub = BUZZ_SUBS.includes(sub) || sub.includes("start") || sub.includes("ai");
    const posMatch = POSITIVE_KEYWORDS.find((k) => low.includes(k));
    if (isBuzzSub && posMatch && positive.length < 3) {
      positive.push({
        headline,
        excerpt,
        subreddit: h.subreddit,
        permalink,
        score: h.score,
        matched: posMatch,
      });
    }
  }

  return { positive, red_flags, hiring_buzz };
}
