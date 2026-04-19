import { gemmaJSON, type Provider } from "@/lib/gemma";
import type { MissionBrief, MissionType } from "./types";

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

  const result = await gemmaJSON<{
    mission_type?: string;
    industry: string;
    stage: string;
    role_type: string;
    location: string;
    keywords: string[];
  }>(
    [
      { role: "system", content: system },
      { role: "user", content: raw },
    ],
    { provider, max_tokens: 400, temperature: 0.15 }
  );

  const mt = (result.mission_type || "").toLowerCase();
  const mission_type: MissionType =
    /oss|contrib|open.?source|dev.?tool/.test(mt)
      ? "oss_contrib"
      : /research|survey|learn|study/.test(mt)
      ? "research"
      : mt === "general" || /trend|news|overview/.test(mt)
      ? "general"
      : "hiring";

  return {
    raw,
    industry: result.industry || "any",
    stage: result.stage || "any",
    role_type: result.role_type || "any",
    location: result.location || "any",
    keywords: (result.keywords || []).slice(0, 8),
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
