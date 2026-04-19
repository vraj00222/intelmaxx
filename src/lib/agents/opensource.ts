import { gemmaJSON, type Provider } from "@/lib/gemma";
import { searchRepos, countGoodFirstIssues, hasContributingGuide } from "@/lib/datasources/github";
import type { OSSIntel, MissionBrief } from "./types";

export async function runGhostnet(mission: MissionBrief, provider?: Provider): Promise<OSSIntel[]> {
  const industryQ = cleanQ(mission.industry);
  const kw = mission.keywords.slice(0, 2).map(cleanQ).join(" ");

  // Dynamic "pushed in the last 30 days" cutoff so queries always reflect "now".
  const pushedCutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const queries = [
    `${industryQ} ${kw} stars:>100 pushed:>${pushedCutoff}`,
    `${industryQ} topic:${industryQ.split(" ")[0] || "ai"} stars:>200 pushed:>${pushedCutoff}`,
    `${kw || industryQ} stars:>300 language:typescript pushed:>${pushedCutoff}`,
  ].filter(Boolean);

  const resultSets = await Promise.all(queries.map((q) => searchRepos(q, 8).catch(() => [])));
  const all = resultSets.flat();

  // Belt & braces — drop anything older than 30 days in case search was lenient.
  const cutoffMs = Date.now() - 30 * 86400 * 1000;
  const byId = new Map<number, (typeof all)[0]>();
  for (const r of all) {
    const t = Date.parse(r.pushed_at || "");
    if (!Number.isNaN(t) && t < cutoffMs) continue;
    byId.set(r.id, r);
  }
  const repos = [...byId.values()].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 10);

  if (repos.length === 0) return [];

  // Enrich top 6 with good-first-issue counts + CONTRIBUTING.md presence
  const enriched = await Promise.all(
    repos.slice(0, 6).map(async (r) => {
      const [gfi, hasContrib] = await Promise.all([
        countGoodFirstIssues(r.owner.login, r.name),
        hasContributingGuide(r.owner.login, r.name),
      ]);
      const daysSincePush = daysSince(r.pushed_at);
      const activityScore =
        daysSincePush <= 3 ? 10 : daysSincePush <= 14 ? 7 : daysSincePush <= 45 ? 4 : 1;
      return {
        company_name: r.owner.login,
        repo_url: r.html_url,
        repo_name: r.full_name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        recent_activity_score: activityScore,
        has_contributing_guide: hasContrib,
        good_first_issues_count: gfi,
        days_since_push: daysSincePush,
      };
    })
  );

  const system = `You are GHOSTNET, an open-source intelligence agent for IntelMaxxing.

Given a mission brief and enriched GitHub repo data, return a JSON array of the best
open-source contribution opportunities for the candidate. For each:

{
  "company_name": string,
  "repo_url": string,
  "stars": number,
  "recent_activity_score": number,   // pass through
  "has_contributing_guide": boolean,
  "good_first_issues_count": number,
  "oss_hiring_correlation": "high" | "medium" | "low",
  "entry_strategy": string            // <= 30 words, a specific, actionable suggestion
}

Rules:
- "oss_hiring_correlation" is your analytical call: companies that maintain active,
  well-documented OSS with good-first-issues tend to hire from contributors.
- Prefer high activity, >=1 good first issue, and relevance to the mission.
- At most 5 items, best fit first.
- Respond ONLY with a JSON array. No fences, no preamble.`;

  const user = `MISSION BRIEF:
${JSON.stringify(mission, null, 2)}

ENRICHED REPOS:
${JSON.stringify(enriched, null, 2)}`;

  try {
    const out = await gemmaJSON<OSSIntel[] | { results: OSSIntel[] }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 1600, temperature: 0.3, provider }
    );
    const arr = Array.isArray(out) ? out : out.results || [];
    return arr.slice(0, 5);
  } catch {
    // Fallback: return a non-LLM list so the UI still has content
    return enriched.slice(0, 5).map((r) => ({
      company_name: r.company_name,
      repo_url: r.repo_url,
      stars: r.stars,
      recent_activity_score: r.recent_activity_score,
      has_contributing_guide: r.has_contributing_guide,
      good_first_issues_count: r.good_first_issues_count,
      oss_hiring_correlation:
        r.good_first_issues_count > 5 && r.has_contributing_guide ? "high" : "medium",
      entry_strategy:
        r.good_first_issues_count > 0
          ? `Scan ${r.good_first_issues_count} good-first-issues on ${r.repo_url} and open a PR.`
          : `Open a doc/typo PR on ${r.repo_url} to establish presence.`,
    }));
  }
}

function cleanQ(s: string): string {
  return (s || "").replace(/[^a-z0-9 +\-]/gi, " ").trim();
}

function daysSince(iso: string): number {
  const d = new Date(iso).getTime();
  if (!d) return 9999;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}
