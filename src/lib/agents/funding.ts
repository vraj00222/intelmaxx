import { gemmaJSON } from "@/lib/gemma";
import { searchStories } from "@/lib/datasources/hackernews";
import type { FundingIntel, MissionBrief } from "./types";

export async function runFoxhound(mission: MissionBrief): Promise<FundingIntel[]> {
  const industry = mission.industry || "startup";
  const extra = mission.keywords.slice(0, 3).join(" ");

  // Multi-query sweep across HN
  const queries = [
    `${industry} raised seed funding`,
    `${industry} Series A raised`,
    `YC ${industry} ${extra}`,
    `${industry} startup launched ${extra}`,
  ];

  const resultSets = await Promise.all(
    queries.map((q) => searchStories(q, 10).catch(() => []))
  );
  const all = resultSets.flat();
  // De-dupe by title
  const seen = new Set<string>();
  const hits = all.filter((h) => {
    const key = (h.title || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
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
    ], { max_tokens: 1800, temperature: 0.25 });

    const arr = Array.isArray(out) ? out : out.results || [];
    return arr.slice(0, 6);
  } catch {
    return [];
  }
}
