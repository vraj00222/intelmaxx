import { gemmaJSON, type Provider } from "@/lib/gemma";
import {
  searchShowHN,
  searchStories,
  findWhoIsHiringThread,
  fetchHiringComments,
} from "@/lib/datasources/hackernews";
import { searchRemoteOK } from "@/lib/datasources/remoteok";
import { matchStartupsGallery } from "@/lib/datasources/startupsgallery";
import type { HiringSignal, MissionBrief } from "./types";

export async function runWiretap(mission: MissionBrief, provider?: Provider): Promise<HiringSignal[]> {
  const industry = mission.industry || "startup";
  const roleType = mission.role_type || "engineer";
  const kw = mission.keywords.slice(0, 3).join(" ");

  // 1. Who is hiring thread
  let hiringComments: Array<{ text: string; id: number; url: string }> = [];
  try {
    const thread = await findWhoIsHiringThread();
    if (thread) {
      const comments = await fetchHiringComments(thread.objectID, 30);
      hiringComments = comments
        .filter((c) => {
          const t = (c.text || "").toLowerCase();
          return (
            t.includes(industry.toLowerCase()) ||
            mission.keywords.some((k) => t.includes(k.toLowerCase())) ||
            t.includes(roleType.toLowerCase())
          );
        })
        .slice(0, 10)
        .map((c) => ({
          text: stripHtml(c.text || "").slice(0, 900),
          id: c.id,
          url: `https://news.ycombinator.com/item?id=${c.id}`,
        }));
    }
  } catch {
    // ignore
  }

  // 2. Show HN posts (companies actively building = likely hiring) — enforce
  //    45-day recency so stale posts (e.g. 2020 launches) don't leak through.
  const showHN = await searchShowHN(`${industry} ${kw}`, 10, { sinceDays: 45 }).catch(() => []);
  const storyHits = await searchStories(`${industry} hiring ${roleType}`, 8, { sinceDays: 30 }).catch(() => []);

  // 3. RemoteOK — real job postings, often from off-LinkedIn startups.
  const remoteKeywords = [
    industry,
    roleType,
    ...mission.keywords.slice(0, 4),
  ].filter(Boolean);
  const remoteJobs = await searchRemoteOK(remoteKeywords, 12, { sinceDays: 45 }).catch(() => []);

  const evidence = {
    who_is_hiring: hiringComments,
    show_hn: showHN.slice(0, 10).map((h) => ({
      title: h.title,
      url: h.url,
      points: h.points,
      text: stripHtml(h.story_text || "").slice(0, 400),
      date: h.created_at,
    })),
    story_mentions: storyHits.slice(0, 6).map((h) => ({
      title: h.title,
      url: h.url,
      date: h.created_at,
    })),
    remoteok_jobs: remoteJobs.slice(0, 10).map((j) => ({
      company_name: j.company,
      position: j.position,
      tags: (j.tags || []).slice(0, 6),
      location: j.location,
      url: j.apply_url || j.url,
      date: j.date,
    })),
  };

  if (
    evidence.who_is_hiring.length === 0 &&
    evidence.show_hn.length === 0 &&
    evidence.story_mentions.length === 0 &&
    evidence.remoteok_jobs.length === 0
  ) {
    return [];
  }

  const system = `You are WIRETAP, a hiring-signal intelligence agent for IntelMaxxing.

YOUR EDGE: the signals in your feed come from channels LinkedIn DOES NOT index —
Hacker News "Who is hiring" comments posted by founders/CTOs, Show HN launches, and
organic founder chatter. These are off-grid leads the candidate will not find on any
job board. Reflect this value in your output.

You receive four evidence streams:
- who_is_hiring: comments from the latest "Ask HN: Who is hiring?" thread
- show_hn: recent Show HN posts (companies actively building = likely hiring)
- story_mentions: story titles matching the industry + hiring keywords
- remoteok_jobs: job postings from RemoteOK (off-LinkedIn remote job board)

For each real hiring signal you find, emit an object:
{
  "company_name": string,
  "signal_type": "explicit_hiring" | "implicit_growth" | "team_expansion",
  "source_url": string,          // HN link, company blog, or RemoteOK listing
  "apply_url": string | null,    // direct application link if known (RemoteOK usually has one)
  "signal_text": string,         // <= 200 chars, verbatim or very tight summary
  "role_hints": string[],        // roles the company likely wants
  "confidence": "high" | "medium" | "low",
  "urgency": "fresh" | "recent" | "aging"
}

Rules:
- RemoteOK jobs are ALWAYS explicit_hiring, high confidence. Use the job's apply URL.
- Prefer explicit hiring posts from who_is_hiring (these are highest confidence).
- Infer company names from the text; if unclear, use "unknown" and skip low-value signals.
- Return at most 8 items, highest confidence first.
- Respond with ONLY a JSON array. No fences, no preamble.`;

  const user = `MISSION BRIEF:
${JSON.stringify(mission, null, 2)}

EVIDENCE:
${JSON.stringify(evidence, null, 2)}`;

  try {
    const out = await gemmaJSON<HiringSignal[] | { results: HiringSignal[] }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 2000, temperature: 0.3, provider }
    );
    const arr = Array.isArray(out) ? out : out.results || [];
    const signals = arr.slice(0, 8);

    // Enrich with startups.gallery company page link when we have a match.
    const names = signals.map((s) => s.company_name).filter(Boolean);
    const sgMatches = await matchStartupsGallery(names);
    for (const s of signals) {
      const hit = sgMatches.get((s.company_name || "").toLowerCase());
      if (hit) s.gallery_url = hit.url;
    }
    return signals;
  } catch {
    return [];
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}
