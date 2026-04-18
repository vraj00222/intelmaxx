import { gemmaJSON } from "@/lib/gemma";
import type {
  FundingIntel,
  HiringSignal,
  MissionBrief,
  OSSIntel,
  ProfilerReport,
} from "./types";

export async function runProfiler(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[]
): Promise<ProfilerReport> {
  const system = `You are PROFILER, the lead analyst for IntelMaxxing.

IMPORTANT: every signal in your data comes from sources LinkedIn DOES NOT cover —
Hacker News "Who is hiring" threads, funding news, and open-source activity. The
candidate's edge is that they are seeing signals no other applicant sees. Reference
this positioning in the briefing text (e.g., "off the LinkedIn radar", "off-grid leads").

You receive the mission brief plus reports from three field agents:
- FOXHOUND (funding intel)
- WIRETAP (hiring signals)
- GHOSTNET (open-source opportunities)

Your job:
1. Cross-reference: if a company appears in multiple agent reports, boost its score.
2. Rank all opportunities by composite score (funding health + hiring signals + OSS culture + mission fit).
3. Pick the TOP 5 targets with concrete action items for each.
4. Write "intel_briefing_text": a 3-paragraph detective-noir voice narration (110-150 words)
   that sounds like a case debrief. Reference specific companies and specific signals.
   Open with "Case number [use the case_number field]". Reference each agent codename
   at least once. End with a directive: "Move fast. Case remains open."

Respond ONLY with a JSON object:
{
  "top_targets": [
    { "rank": 1, "company_name": "...", "composite_score": 0-10,
      "signals": [ "appears in FOXHOUND", "WIRETAP hiring signal", ... ],
      "action_items": [ "...", "..." ],
      "rationale": "<= 30 words" }, ...
  ],
  "intel_briefing_text": "...",
  "total_companies_analyzed": number,
  "total_signals_detected": number
}

No markdown fences, no preamble.`;

  const totalCompanies = new Set<string>();
  funding.forEach((f) => totalCompanies.add(f.company_name?.toLowerCase() || ""));
  signals.forEach((s) => totalCompanies.add(s.company_name?.toLowerCase() || ""));
  oss.forEach((o) => totalCompanies.add(o.company_name?.toLowerCase() || ""));
  totalCompanies.delete("");
  const totalSignals = funding.length + signals.length + oss.length;

  const caseNumber = `CASE-${Math.floor(Math.random() * 9000 + 1000)}`;

  const user = `CASE NUMBER: ${caseNumber}
MISSION BRIEF: ${JSON.stringify(mission)}

FOXHOUND REPORT:
${JSON.stringify(funding, null, 2)}

WIRETAP REPORT:
${JSON.stringify(signals, null, 2)}

GHOSTNET REPORT:
${JSON.stringify(oss, null, 2)}

Stats you can use if helpful:
- total_companies_analyzed ≈ ${totalCompanies.size}
- total_signals_detected ≈ ${totalSignals}`;

  try {
    const out = await gemmaJSON<ProfilerReport>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 2500, temperature: 0.4 }
    );

    // Safeguards
    return {
      top_targets: Array.isArray(out.top_targets) ? out.top_targets.slice(0, 5) : [],
      intel_briefing_text:
        out.intel_briefing_text ||
        buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
      total_companies_analyzed: out.total_companies_analyzed ?? totalCompanies.size,
      total_signals_detected: out.total_signals_detected ?? totalSignals,
    };
  } catch {
    return {
      top_targets: synthesizeFallback(funding, signals, oss),
      intel_briefing_text: buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
      total_companies_analyzed: totalCompanies.size,
      total_signals_detected: totalSignals,
    };
  }
}

function synthesizeFallback(
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[]
) {
  const scores = new Map<
    string,
    { company: string; score: number; signals: string[]; actions: string[] }
  >();

  const push = (
    name: string,
    signal: string,
    action: string,
    weight: number
  ) => {
    if (!name) return;
    const key = name.toLowerCase();
    const ex = scores.get(key);
    if (ex) {
      ex.score += weight;
      ex.signals.push(signal);
      if (action) ex.actions.push(action);
    } else {
      scores.set(key, {
        company: name,
        score: weight,
        signals: [signal],
        actions: action ? [action] : [],
      });
    }
  };

  funding.forEach((f) =>
    push(f.company_name, `FOXHOUND: ${f.funding_stage} ${f.funding_amount}`, `Research ${f.company_name} team page and cold-reach a hiring manager.`, 3)
  );
  signals.forEach((s) =>
    push(s.company_name, `WIRETAP: ${s.signal_type}`, `Reply to HN hiring post with tailored pitch: ${s.role_hints[0] || "role"}`, 4)
  );
  oss.forEach((o) =>
    push(o.company_name, `GHOSTNET: ${o.good_first_issues_count} good-first-issues`, o.entry_strategy, 2)
  );

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s, i) => ({
      rank: i + 1,
      company_name: s.company,
      composite_score: Math.min(10, s.score),
      signals: s.signals,
      action_items: s.actions.slice(0, 3),
      rationale: `Detected across ${s.signals.length} intel streams.`,
    }));
}

function buildFallbackBriefing(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[],
  caseNumber: string
): string {
  const topFund = funding[0];
  const topSig = signals[0];
  const topOss = oss[0];
  return [
    `${caseNumber}. Mission brief: locate ${mission.industry || "target"} opportunities. Four agents deployed. Here's what we found.`,
    topFund
      ? `FOXHOUND reports ${funding.length} funding events. ${topFund.company_name} — ${topFund.funding_amount}, ${topFund.funding_stage}. Lean team, moving fast.`
      : `FOXHOUND came back light — funding landscape was quiet for this brief.`,
    topSig
      ? `WIRETAP intercepted ${signals.length} hiring signals. ${topSig.company_name} is the freshest lead — ${topSig.signal_type.replace("_", " ")}.`
      : `WIRETAP observed no direct hiring posts matching this brief in the last cycle.`,
    topOss
      ? `GHOSTNET mapped ${oss.length} open-source backdoors. ${topOss.company_name} has ${topOss.good_first_issues_count} good-first-issues. Entry strategy: ${topOss.entry_strategy}`
      : `GHOSTNET came back clean — no active OSS footprints matched.`,
    `Assessment: cross-referenced signals narrow the target list. Move fast. Case remains open.`,
  ].join(" ");
}
