import { gemmaJSON, type Provider } from "@/lib/gemma";
import { searchStories } from "@/lib/datasources/hackernews";
import { matchStartupsGallery } from "@/lib/datasources/startupsgallery";
import type { FundingIntel, MissionBrief } from "./types";

export async function runFoxhound(mission: MissionBrief, provider?: Provider): Promise<FundingIntel[]> {
  const industry = mission.industry || "startup";
  const extra = mission.keywords.slice(0, 2).join(" ");

  // HN Algolia full-text is picky with long queries; broader queries +
  // 30-day recency filter + Gemma ranking gives better coverage than
  // pre-filtering heavily by phrase.
  const queries = [
    `${industry} raised`,
    `${industry} Series`,
    `${industry} launches`,
    `raised seed`,
    `Series A`,
    extra ? `${extra} raised` : "",
  ].filter(Boolean);

  const resultSets = await Promise.all(
    queries.map((q) => searchStories(q, 10, { sinceDays: 30 }).catch(() => []))
  );
  const all = resultSets.flat();
  // De-dupe by title; enforce a hard recency cutoff (30 days) as belt & braces
  const cutoff = Date.now() - 30 * 86400 * 1000;
  const seen = new Set<string>();
  const hits = all.filter((h) => {
    const key = (h.title || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    const ts = Date.parse(h.created_at || "");
    if (!Number.isNaN(ts) && ts < cutoff) return false;
    seen.add(key);
    return true;
  });

  // Condense evidence for Gemma
  const evidence = hits.slice(0, 24).map((h) => ({
    title: h.title,
    url: h.url,
    points: h.points,
    date: h.created_at,
  }));

  if (evidence.length === 0) return [];

  const system = `You are FOXHOUND, a funding-intelligence agent for IntelMaxxing.

Input: a mission brief plus Hacker News stories that mention funding events.
Output: a JSON array of the most relevant funding events matching the mission.

For each company, extract:
- company_name, url (news article url), funding_amount (e.g. "$4.2M" or "unknown")
- funding_stage: one of pre-seed, seed, series-a, series-b, later, unknown
- investors (array of strings; "unknown" if not mentioned)
- industry (short), date (ISO or approximate)
- relevance_score (1-10): how well does it match the mission?
- one_liner: <= 20 words, why this matters to the candidate

Filter rules:
- Only include companies whose relevance_score >= 6
- Return at most 6 items, sorted by relevance_score desc
- If unsure about a field, use "unknown" (string) or empty array — never invent URLs
- Respond with ONLY valid JSON array. No markdown fences, no preamble.`;

  const user = `MISSION BRIEF:
${JSON.stringify(mission, null, 2)}

EVIDENCE (Hacker News stories):
${JSON.stringify(evidence, null, 2)}`;

  try {
    const out = await gemmaJSON<FundingIntel[] | { results: FundingIntel[] }>([
      { role: "system", content: system },
      { role: "user", content: user },
    ], { max_tokens: 1800, temperature: 0.25, provider });

    const arr = Array.isArray(out) ? out : out.results || [];
    const picked = arr.slice(0, 6);

    // Mark "likely to hire" for funders that closed within the last 180 days.
    const now = Date.now();
    for (const f of picked) {
      const ts = Date.parse(f.date || "");
      if (!Number.isNaN(ts) && now - ts < 180 * 86400 * 1000) {
        f.likely_to_hire = true;
      }
    }

    // Enrich with startups.gallery refs (adds gallery_url when tracked there).
    const names = picked.map((f) => f.company_name).filter(Boolean);
    const sg = await matchStartupsGallery(names);
    for (const f of picked) {
      const hit = sg.get((f.company_name || "").toLowerCase());
      if (hit) f.gallery_url = hit.url;
    }

    return picked;
  } catch {
    return [];
  }
}
