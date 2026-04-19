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
