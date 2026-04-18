import { gemmaJSON } from "@/lib/gemma";
import {
  searchShowHN,
  searchStories,
  findWhoIsHiringThread,
  fetchHiringComments,
} from "@/lib/datasources/hackernews";
import type { HiringSignal, MissionBrief } from "./types";

export async function runWiretap(mission: MissionBrief): Promise<HiringSignal[]> {
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

  // 2. Show HN posts (companies actively building = likely hiring)
  const showHN = await searchShowHN(`${industry} ${kw}`, 10).catch(() => []);
  const storyHits = await searchStories(`${industry} hiring ${roleType}`, 8).catch(() => []);

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
  };

  if (
    evidence.who_is_hiring.length === 0 &&
    evidence.show_hn.length === 0 &&
    evidence.story_mentions.length === 0
  ) {
    return [];
  }

  const system = `You are WIRETAP, a hiring-signal intelligence agent for IntelMaxxing.

YOUR EDGE: the signals in your feed come from channels LinkedIn DOES NOT index —
Hacker News "Who is hiring" comments posted by founders/CTOs, Show HN launches, and
organic founder chatter. These are off-grid leads the candidate will not find on any
job board. Reflect this value in your output.

You receive three evidence streams:
- who_is_hiring: comments from the latest "Ask HN: Who is hiring?" thread
- show_hn: recent Show HN posts (companies actively building = likely hiring)
- story_mentions: story titles matching the industry + hiring keywords

For each real hiring signal you find, emit an object:
{
  "company_name": string,
  "signal_type": "explicit_hiring" | "implicit_growth" | "team_expansion",
  "source_url": string,
  "signal_text": string,       // <= 200 chars, verbatim or very tight summary
  "role_hints": string[],      // roles the company likely wants
  "confidence": "high" | "medium" | "low",
  "urgency": "fresh" | "recent" | "aging"
}

Rules:
- Prefer explicit hiring posts from who_is_hiring (these are highest confidence).
- Infer company names from the text; if unclear, use "unknown" and skip low-value signals.
- Return at most 6 items, highest confidence first.
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
      { max_tokens: 2000, temperature: 0.3 }
    );
    const arr = Array.isArray(out) ? out : out.results || [];
    return arr.slice(0, 6);
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
