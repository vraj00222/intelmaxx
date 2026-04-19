import type { Provider } from "@/lib/gemma";
import { searchRepos, countGoodFirstIssues, hasContributingGuide } from "@/lib/datasources/github";
import { isGiant } from "./gating";
import type { OSSIntel, MissionBrief } from "./types";

export async function runGhostnet(mission: MissionBrief, _provider?: Provider): Promise<OSSIntel[]> {
  const industryQ = cleanQ(mission.industry);
  const keywordTokens = mission.keywords.map(cleanQ).filter(Boolean);
  const firstKw = keywordTokens[0] || "";
  const pairKw = keywordTokens.slice(0, 2).join(" ");

  // Cascade broad -> narrow. GitHub's search AND's every token, so stacking
  // "devtools open source developer tools stars:>100 pushed:<date>" filters
  // to near-zero. We start with looser queries and tighten only if we have
  // too many results. Star thresholds are also softer so a "dev tool"
  // search doesn't require a 100-star bar on day one.
  const recent = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);
  const topic = slugify(firstKw || industryQ.split(" ")[0] || "");
  // Upper star cap: mega-repos already get plenty of light and drown out the
  // smaller, contributable projects the candidate is actually here for. 30k
  // turned out to be too high — results clustered right at the ceiling
  // (LangChain, ByteDance, Vercel Labs all at 29k). 12k is a better floor
  // for "famous": still high-quality projects, but not the ones every new
  // grad has already PR'd into.
  const STAR_CAP = 12000;
  const queries = [
    // Broadest: single best keyword + stars, recent activity preferred.
    pairKw ? `${pairKw} stars:50..${STAR_CAP} pushed:>${recent}` : "",
    // Industry-as-topic — GitHub's topic index is hand-curated and high signal.
    topic ? `topic:${topic} stars:50..${STAR_CAP} pushed:>${recent}` : "",
    // Plain industry term, no keyword stacking.
    industryQ ? `${industryQ} stars:30..${STAR_CAP} pushed:>${recent}` : "",
    // Fallback: the first keyword alone, any recent push.
    firstKw ? `${firstKw} stars:30..${STAR_CAP} pushed:>${recent}` : "",
  ].filter(Boolean);

  const resultSets = await Promise.all(queries.map((q) => searchRepos(q, 8).catch(() => [])));
  const all = resultSets.flat();

  // Soft recency floor at 90 days so well-maintained repos that push bi-monthly
  // still surface. The original 30-day hard cutoff was eliminating most matches.
  const cutoffMs = Date.now() - 90 * 86400 * 1000;
  const byId = new Map<number, (typeof all)[0]>();
  for (const r of all) {
    if (r.stargazers_count > STAR_CAP) continue;
    // Filter megacorp-owned repos — same blocklist the DOSSIER agent uses.
    // Check both the org name and the repo name, since orgs like "vercel-labs"
    // or repos named "langchain" aren't caught by checking just one.
    if (isGiant(r.owner?.login || "") || isGiant(r.name || "")) continue;
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

  // Deterministic synthesis — no LLM. A Gemma call here adds 8-15s and rarely
  // improves on "most-stars + good-first-issues" as a ranker. If we ever want
  // LLM-grade entry strategies, gate them behind an opt-in flag.
  return enriched.slice(0, 5).map((r) => {
    const correlation: "high" | "medium" | "low" =
      r.good_first_issues_count > 5 && r.has_contributing_guide
        ? "high"
        : r.good_first_issues_count > 0 || r.has_contributing_guide
        ? "medium"
        : "low";
    const entry_strategy =
      r.good_first_issues_count > 0
        ? `Scan the ${r.good_first_issues_count} good-first-issues and open a focused PR on ${r.repo_name}.`
        : r.has_contributing_guide
        ? `Read CONTRIBUTING.md, fix a docs gap or small bug, and ship a PR on ${r.repo_name}.`
        : `Open a doc/typo PR on ${r.repo_name} to establish presence.`;
    return {
      company_name: r.company_name,
      repo_url: r.repo_url,
      stars: r.stars,
      recent_activity_score: r.recent_activity_score,
      has_contributing_guide: r.has_contributing_guide,
      good_first_issues_count: r.good_first_issues_count,
      oss_hiring_correlation: correlation,
      entry_strategy,
    };
  });
}

function cleanQ(s: string): string {
  return (s || "").replace(/[^a-z0-9 +\-]/gi, " ").trim();
}

/** Normalize a phrase into a single GitHub topic slug ("developer tools" -> "developer-tools"). */
function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function daysSince(iso: string): number {
  const d = new Date(iso).getTime();
  if (!d) return 9999;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}
