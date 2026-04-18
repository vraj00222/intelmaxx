import { gemmaJSON } from "@/lib/gemma";
import type { MissionBrief } from "./types";

/** Parse raw user input into a structured mission brief via Gemma. */
export async function parseMission(raw: string): Promise<MissionBrief> {
  const system = `You are the ORCHESTRATOR, the intake analyst for IntelMaxxing.
Convert a user's free-form career mission into structured search parameters.

Rules:
- Industry: one concise phrase (e.g. "AI infrastructure", "fintech", "devtools").
- Stage: one of pre-seed, seed, series-a, series-b, later, any.
- role_type: e.g. "software engineer", "ML research", "founding engineer", "any".
- location: free-text location or "any".
- keywords: 3-6 short keywords that would help search HN and GitHub.

Respond ONLY with valid JSON of this shape:
{ "industry": string, "stage": string, "role_type": string, "location": string, "keywords": string[] }
No preamble, no markdown fences.`;

  const result = await gemmaJSON<{
    industry: string;
    stage: string;
    role_type: string;
    location: string;
    keywords: string[];
  }>([
    { role: "system", content: system },
    { role: "user", content: raw },
  ]);

  return {
    raw,
    industry: result.industry || "any",
    stage: result.stage || "any",
    role_type: result.role_type || "any",
    location: result.location || "any",
    keywords: (result.keywords || []).slice(0, 8),
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
