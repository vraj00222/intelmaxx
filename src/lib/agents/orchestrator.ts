import { gemmaJSON, type Provider } from "@/lib/gemma";
import type { MissionBrief, MissionType } from "./types";

// Stop-words stripped when we heuristically extract keywords from raw input.
// Short, targeted — we're trying to salvage a query, not do real NLP.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "up", "about", "into", "over", "after", "is", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "can", "me",
  "i", "you", "my", "your", "our", "we", "it", "that", "this", "these",
  "those", "hiring", "jobs", "job", "work", "working", "looking", "want",
  "find", "show", "need", "get", "some", "any", "all", "more",
]);

/** Best-effort keyword salvage when Gemma fails or returns garbage. */
function heuristicKeywords(raw: string): string[] {
  const words = (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  // Dedupe + cap to 6.
  return [...new Set(words)].slice(0, 6);
}

/** Heuristic mission-type classification for the fallback path. */
function classifyRaw(raw: string): MissionType {
  const s = (raw || "").toLowerCase();
  if (/\b(oss|open.?source|contribute|pull.?request|good.?first.?issue|repo)\b/.test(s)) return "oss_contrib";
  if (/\b(research|survey|learn|study|overview|what.?is)\b/.test(s)) return "research";
  if (/\b(hire|hiring|job|role|engineer|founding|cold.?email|recruit)\b/.test(s)) return "hiring";
  return "general";
}

/** Safe fallback MissionBrief when parseMission's Gemma call fails. */
function fallbackMission(raw: string): MissionBrief {
  const kws = heuristicKeywords(raw);
  // Guess a coarse industry from the first keyword if we have one.
  const industry = kws[0] || "any";
  return {
    raw,
    industry,
    stage: "any",
    role_type: "any",
    location: "any",
    keywords: kws,
    mission_type: classifyRaw(raw),
  };
}

/** Parse raw user input into a structured mission brief via Gemma. */
export async function parseMission(raw: string, provider?: Provider): Promise<MissionBrief> {
  const system = `You are the ORCHESTRATOR, the intake analyst for IntelMaxxing.
Convert a user's free-form mission into structured search parameters.

IntelMaxxing handles FOUR kinds of missions — classify first, then fill fields:
- "hiring": user wants jobs, roles, founders to cold-email, companies likely to hire
- "oss_contrib": user wants open-source projects to contribute to, dev tools to hack on
- "research": user wants to learn about / survey a space or technology
- "general": tech-adjacent but doesn't fit above (trends, news, comparisons)

Rules:
- mission_type: one of "hiring" | "oss_contrib" | "research" | "general".
- Industry: one concise phrase (e.g. "AI infrastructure", "fintech", "devtools").
- Stage: one of pre-seed, seed, series-a, series-b, later, any. Use "any" for non-hiring missions.
- role_type: e.g. "software engineer", "ML research", "founding engineer", "any". Use "any" for non-hiring.
- location: free-text location or "any".
- keywords: 3-6 short keywords that would help search HN and GitHub (focus on the tech / topic, not "hiring").

Respond ONLY with valid JSON of this shape:
{ "mission_type": string, "industry": string, "stage": string, "role_type": string, "location": string, "keywords": string[] }
No preamble, no markdown fences.`;

  // Gemma can fail in many ways: rate-limit, timeout, malformed JSON, network
  // blip. None of them should sink the whole investigation — we salvage a
  // keyword-heuristic MissionBrief and let downstream agents run with it.
  let result: {
    mission_type?: string;
    industry?: string;
    stage?: string;
    role_type?: string;
    location?: string;
    keywords?: string[];
  };
  try {
    result = await gemmaJSON(
      [
        { role: "system", content: system },
        { role: "user", content: raw },
      ],
      { provider, max_tokens: 400, temperature: 0.15 }
    );
  } catch (e) {
    console.warn("[parseMission] Gemma failed, falling back to heuristic", e);
    return fallbackMission(raw);
  }

  const mt = (result.mission_type || "").toLowerCase();
  const mission_type: MissionType =
    /oss|contrib|open.?source|dev.?tool/.test(mt)
      ? "oss_contrib"
      : /research|survey|learn|study/.test(mt)
      ? "research"
      : mt === "general" || /trend|news|overview/.test(mt)
      ? "general"
      : "hiring";

  // Belt-and-braces: if Gemma returns empty keywords for a non-trivial query,
  // layer in heuristic ones so searches aren't fruitless.
  const modelKeywords = Array.isArray(result.keywords) ? result.keywords : [];
  const keywords = modelKeywords.length
    ? modelKeywords.slice(0, 8)
    : heuristicKeywords(raw);

  return {
    raw,
    industry: result.industry || heuristicKeywords(raw)[0] || "any",
    stage: result.stage || "any",
    role_type: result.role_type || "any",
    location: result.location || "any",
    keywords,
    mission_type,
  };
}

export function newCaseNumber(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `${y}-${mm}${dd}-${r}`;
}
