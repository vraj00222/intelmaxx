import { gemmaJSON, type Provider } from "@/lib/gemma";
import { findCultureRedFlags } from "@/lib/datasources/reddit";
import type {
  FundingIntel,
  HiringSignal,
  MissionBrief,
  MoatBriefing,
  OSSIntel,
  ProfilerReport,
  TopTarget,
} from "./types";

export async function runProfiler(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[],
  provider?: Provider
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
5. Write "intel_briefing_voice": a SHORT punchy audio hook, 30-40 words MAX (10-15 sec spoken).
   Style: thick spy / noir detective voice over the top of Gen-Z slang — like if James Bond
   went to TikTok. Drop one subtle Gen-Z phrase ("no cap", "locked in", "it's giving", "real
   ones", "the drop", "moving different") naturally into the spy delivery — don't force more
   than one. Must name the TOP target company and one concrete signal. End with a
   mic-drop one-liner. Examples of tone:
     - "Case cracked. [Company] just closed Series A — and they're hiring on HN, no cap. Off-grid, off-LinkedIn. Move."
     - "Intel dropped. [Company] — lean team, fresh money, good-first-issues wide open. This one's locked in. Go."
   Keep it tight. No fluff. No case number. No "move fast / case remains open".
6. Write "moat_briefings": an array with ONE entry per company in the MOAT_COMPANIES list
   below (these are funders flagged as likely-to-hire — the product's edge). Each entry:
   { "company_name": string, "text": string }.
   "text" = 35-55 words of spoken audio (≈15-20 sec). Same thick-spy / light Gen-Z tone as
   intel_briefing_voice but tailored to THAT ONE company. Structure:
     a) Open with company name + specific funding signal ("[Co] just closed [stage] for [amount]")
     b) State what role/gap they likely have ("lean team · needs a founding [role]")
     c) End with ONE concrete action the candidate should take TODAY ("Drop a cold email to
        their CTO on HN", "Ship a PR on their repo", "Reply to the hiring post with [angle]")
   One Gen-Z phrase max. No case number. No generic filler. Different flavor from hook.
   Example:
     "Starcloud — just bagged 170 million Series A, no cap. Lean infra team, they need a
      founding engineer yesterday. Don't wait for the LinkedIn post. Scan their GitHub,
      ship a PR on their OSS repo this week, then drop the CTO a line. Locked in."
   If MOAT_COMPANIES is empty, return [].

Respond ONLY with a JSON object:
{
  "top_targets": [
    { "rank": 1, "company_name": "...", "composite_score": 0-10,
      "signals": [ "appears in FOXHOUND", "WIRETAP hiring signal", ... ],
      "action_items": [ "...", "..." ],
      "rationale": "<= 30 words" }, ...
  ],
  "intel_briefing_text": "...",
  "intel_briefing_voice": "...",
  "moat_briefings": [ { "company_name": "...", "text": "..." }, ... ],
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
  const moatCompanies = funding
    .filter((f) => f.likely_to_hire)
    .map((f) => ({
      company_name: f.company_name,
      funding_stage: f.funding_stage,
      funding_amount: f.funding_amount,
      industry: f.industry,
      url: f.url,
    }));

  const user = `CASE NUMBER: ${caseNumber}
MISSION BRIEF: ${JSON.stringify(mission)}

FOXHOUND REPORT:
${JSON.stringify(funding, null, 2)}

WIRETAP REPORT:
${JSON.stringify(signals, null, 2)}

GHOSTNET REPORT:
${JSON.stringify(oss, null, 2)}

MOAT_COMPANIES (write one moat_briefing per entry):
${JSON.stringify(moatCompanies, null, 2)}

Stats you can use if helpful:
- total_companies_analyzed ≈ ${totalCompanies.size}
- total_signals_detected ≈ ${totalSignals}`;

  try {
    const out = await gemmaJSON<ProfilerReport>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 2500, temperature: 0.4, provider }
    );

    const topTargets = Array.isArray(out.top_targets) ? out.top_targets.slice(0, 5) : [];
    const enrichedTargets = await enrichWithRedFlags(topTargets);
    const moatBriefings = reconcileMoatBriefings(out.moat_briefings, funding);

    return {
      top_targets: enrichedTargets,
      intel_briefing_text:
        out.intel_briefing_text ||
        buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
      intel_briefing_voice:
        out.intel_briefing_voice ||
        buildFallbackVoiceHook(funding, signals, oss),
      moat_briefings: moatBriefings,
      total_companies_analyzed: out.total_companies_analyzed ?? totalCompanies.size,
      total_signals_detected: out.total_signals_detected ?? totalSignals,
    };
  } catch {
    const fallbackTargets = synthesizeFallback(funding, signals, oss);
    const enrichedTargets = await enrichWithRedFlags(fallbackTargets);
    return {
      top_targets: enrichedTargets,
      intel_briefing_text: buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
      intel_briefing_voice: buildFallbackVoiceHook(funding, signals, oss),
      moat_briefings: reconcileMoatBriefings(undefined, funding),
      total_companies_analyzed: totalCompanies.size,
      total_signals_detected: totalSignals,
    };
  }
}

/**
 * Ensure we have one moat briefing per likely_to_hire funder. Uses what the model
 * returned where possible, backfills missing ones with a deterministic template.
 */
function reconcileMoatBriefings(
  fromModel: MoatBriefing[] | undefined,
  funding: FundingIntel[]
): MoatBriefing[] {
  const moat = funding.filter((f) => f.likely_to_hire);
  if (!moat.length) return [];
  const byName = new Map<string, string>();
  for (const b of fromModel || []) {
    if (b?.company_name && b?.text) {
      byName.set(b.company_name.toLowerCase(), b.text);
    }
  }
  return moat.map((f) => ({
    company_name: f.company_name,
    text: byName.get((f.company_name || "").toLowerCase()) || buildFallbackMoatBriefing(f),
  }));
}

function buildFallbackMoatBriefing(f: FundingIntel): string {
  const amount = f.funding_amount && f.funding_amount !== "unknown" ? f.funding_amount : "fresh money";
  const stage =
    f.funding_stage && f.funding_stage !== "unknown" ? f.funding_stage.toUpperCase() : "new round";
  const industry = f.industry && f.industry !== "unknown" ? f.industry : "the space";
  return `${f.company_name} just closed ${stage} — ${amount}, no cap. Lean ${industry} team, they need someone yesterday. Don't wait for the LinkedIn post. Find the CTO, drop a cold email, attach your work. Locked in. Go.`;
}

/** Run reddit culture checks on each top target in parallel. Silently degrades. */
async function enrichWithRedFlags(targets: TopTarget[]): Promise<TopTarget[]> {
  if (!targets.length) return targets;
  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const flags = await findCultureRedFlags(t.company_name, 2);
        return flags.length ? { ...t, red_flags: flags } : t;
      } catch {
        return t;
      }
    })
  );
  return results;
}

function buildFallbackVoiceHook(
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[]
): string {
  const top =
    signals[0]?.company_name ||
    funding[0]?.company_name ||
    oss[0]?.company_name ||
    "target";
  const hint =
    signals[0]?.signal_type === "explicit_hiring"
      ? "hiring on HN right now"
      : funding[0]
      ? `just closed ${funding[0].funding_stage}`
      : oss[0]
      ? `${oss[0].good_first_issues_count} good-first-issues wide open`
      : "moving different";
  return `Intel dropped. ${top} — ${hint}. Off the LinkedIn grid, no cap. This one's locked in. Go.`;
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
