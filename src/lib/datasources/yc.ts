// Y Combinator companies — sourced from the yc-oss community mirror which
// publishes per-batch JSON dumps of the official YC directory. Stable,
// CORS-enabled, updated when new batches are announced.
//
//   https://yc-oss.github.io/api/batches/<slug>.json
//
// Each entry has: name, slug, former_names, small_logo_thumb_url, website,
// all_locations, long_description, one_liner, team_size, industry, subindustry,
// launched_at, tags, batch, status, industries, regions, stage, ...

import { recentYCBatches } from "@/lib/agents/gating";

export type YCCompany = {
  name: string;
  website?: string;
  one_liner?: string;
  long_description?: string;
  team_size?: number;
  industry?: string;
  subindustry?: string;
  tags?: string[];
  batch?: string;
  status?: string; // "Active", "Acquired", "Dead"
  launched_at?: number; // unix seconds
  all_locations?: string;
  industries?: string[];
  regions?: string[];
  stage?: string;
  isHiring?: boolean;
};

function batchSlug(code: string): string | null {
  const m = /^([WSF])(\d{2})$/i.exec(code.trim());
  if (!m) return null;
  const season = { W: "winter", S: "summer", F: "fall" }[m[1].toUpperCase() as "W" | "S" | "F"];
  const year = 2000 + parseInt(m[2], 10);
  return `${season}-${year}`;
}

async function fetchBatch(code: string): Promise<YCCompany[]> {
  const slug = batchSlug(code);
  if (!slug) return [];
  try {
    const res = await fetch(`https://yc-oss.github.io/api/batches/${slug}.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const arr = (await res.json()) as YCCompany[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Pull the last N YC batches and filter companies matching the mission keywords.
 * Returns at most `limit` companies, sorted by signal strength (team size,
 * industry match, batch recency).
 */
export async function fetchRecentYCCompanies(
  keywords: string[],
  industry: string,
  batches: number = 4,
  limit: number = 24
): Promise<YCCompany[]> {
  const codes = recentYCBatches(batches);
  const results = await Promise.all(codes.map(fetchBatch));
  const all = results.flat();

  const terms = [
    ...(industry ? [industry.toLowerCase()] : []),
    ...keywords.map((k) => k.toLowerCase()).filter((k) => k.length >= 3),
  ];

  // Filter out dead companies and score remaining by industry-term overlap.
  const scored = all
    .filter((c) => c && c.name && c.status !== "Dead")
    .map((c) => {
      const blob = [
        c.name,
        c.one_liner,
        c.long_description,
        c.industry,
        c.subindustry,
        (c.tags || []).join(" "),
        (c.industries || []).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (blob.includes(t)) score += 3;
      }
      // Small-team boost — lean companies are more hirable.
      if (c.team_size && c.team_size <= 10) score += 2;
      else if (c.team_size && c.team_size <= 30) score += 1;
      // Prefer Active > anything else.
      if (c.status === "Active") score += 1;
      // YC's own isHiring flag is gold — surfaces only listed roles.
      if (c.isHiring) score += 4;
      return { c, score };
    })
    // If no keyword terms were supplied (e.g. generic "general" mission) we
    // still want the broader YC pool — fall back to score>=0 in that case.
    .filter((s) => (terms.length ? s.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);

  return scored;
}
