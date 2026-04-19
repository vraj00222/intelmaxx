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

/**
 * PROFILER — splits the analysis across 3 concurrent Gemma calls on Novita
 * so we max parallelism + credits. top_targets, briefings, and moat_briefings
 * all fire at once. Reddit red-flag enrichment overlaps with the briefing calls.
 */
/**
 * Deterministic fallback used when the PROFILER call times out or fails entirely —
 * exported so the API route can still return something useful when the Gemma phase
 * hits its deadline.
 */
export function buildProfilerFallback(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[]
): ProfilerReport {
  const totalCompanies = new Set<string>();
  funding.forEach((f) => totalCompanies.add(f.company_name?.toLowerCase() || ""));
  signals.forEach((s) => totalCompanies.add(s.company_name?.toLowerCase() || ""));
  oss.forEach((o) => totalCompanies.add(o.company_name?.toLowerCase() || ""));
  totalCompanies.delete("");
  const caseNumber = `CASE-${Math.floor(Math.random() * 9000 + 1000)}`;
  return {
    top_targets: synthesizeFallback(funding, signals, oss),
    intel_briefing_text: buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
    intel_briefing_voice: buildFallbackVoiceHook(funding, signals, oss),
    moat_briefings: funding
      .filter((f) => f.likely_to_hire)
      .map((f) => ({ company_name: f.company_name, text: buildFallbackMoatBriefing(f) })),
    total_companies_analyzed: totalCompanies.size,
    total_signals_detected: funding.length + signals.length + oss.length,
  };
}

export async function runProfiler(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[],
  provider?: Provider
): Promise<ProfilerReport> {
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

  // Fire all 3 Gemma calls in parallel. Each is small and bounded.
  const topTargetsP = callTopTargets(mission, funding, signals, oss, provider);
  const briefingsP = callBriefings(mission, funding, signals, oss, caseNumber, provider);
  const moatBriefingsP = moatCompanies.length
    ? callMoatBriefings(moatCompanies, provider)
    : Promise.resolve<MoatBriefing[]>([]);

  // Reddit enrichment needs the top_targets list — start as soon as that resolves,
  // but run it concurrently with the other two Gemma calls still in flight.
  const redFlagsP = topTargetsP.then((targets) =>
    targets.length ? enrichWithRedFlags(targets) : targets
  );

  const [enrichedTargets, briefings, moatBriefings] = await Promise.all([
    redFlagsP.catch(() => [] as TopTarget[]),
    briefingsP.catch(() => null),
    moatBriefingsP.catch(() => [] as MoatBriefing[]),
  ]);

  const topTargetsForFallback = enrichedTargets.length
    ? enrichedTargets
    : synthesizeFallback(funding, signals, oss);

  return {
    top_targets: topTargetsForFallback,
    intel_briefing_text:
      briefings?.text || buildFallbackBriefing(mission, funding, signals, oss, caseNumber),
    intel_briefing_voice: briefings?.voice || buildFallbackVoiceHook(funding, signals, oss),
    moat_briefings: reconcileMoatBriefings(moatBriefings, funding),
    total_companies_analyzed: totalCompanies.size,
    total_signals_detected: totalSignals,
  };
}

// ──────────────────────────────────────────────────────────────
// Sub-call 1: TOP TARGETS — rank + actions + rationale
// ──────────────────────────────────────────────────────────────
async function callTopTargets(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[],
  provider?: Provider
): Promise<TopTarget[]> {
  if (!funding.length && !signals.length && !oss.length) return [];

  const isHiring = mission.mission_type === "hiring" || mission.mission_type === "general";
  const system = `You are PROFILER, the lead analyst for IntelMaxxing.
${
  isHiring
    ? `The signals you see come from OFF-LINKEDIN sources — HN "Who is hiring",
funding news, and OSS activity. The candidate's edge is seeing signals others can't.`
    : `The mission_type is "${mission.mission_type}" — NOT job-hunting. Rank targets by
fit to the mission (e.g. for oss_contrib: repos worth contributing to; for research:
companies/repos worth tracking). Do NOT push hiring framing.`
}

Given three agent reports, rank the TOP 5 targets and attach concrete actions.

Output rules:
- Cross-reference: companies appearing in multiple reports score higher.
- composite_score: 0-10.
- signals: 2-4 short tags e.g. ["FOXHOUND: seed", "WIRETAP: HN hiring"].
- action_items: 2-3 concrete next steps the candidate should take TODAY.
- rationale: <= 30 words.

Respond ONLY with JSON:
{ "top_targets": [ { "rank": 1, "company_name": "...", "composite_score": 0-10,
  "signals": [...], "action_items": [...], "rationale": "..." }, ... ] }
No fences, no preamble.`;

  const user = `MISSION: ${JSON.stringify(mission)}
FOXHOUND: ${JSON.stringify(funding)}
WIRETAP: ${JSON.stringify(signals)}
GHOSTNET: ${JSON.stringify(oss)}`;

  try {
    const out = await gemmaJSON<{ top_targets?: TopTarget[] }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 800, temperature: 0.35, provider }
    );
    return Array.isArray(out.top_targets) ? out.top_targets.slice(0, 5) : [];
  } catch {
    return synthesizeFallback(funding, signals, oss);
  }
}

// ──────────────────────────────────────────────────────────────
// Sub-call 2: BRIEFINGS — voice hook + full text debrief
// ──────────────────────────────────────────────────────────────
async function callBriefings(
  mission: MissionBrief,
  funding: FundingIntel[],
  signals: HiringSignal[],
  oss: OSSIntel[],
  caseNumber: string,
  provider?: Provider
): Promise<{ voice: string; text: string } | null> {
  if (!funding.length && !signals.length && !oss.length) return null;

  const isHiring = mission.mission_type === "hiring" || mission.mission_type === "general";
  const system = `You are PROFILER for IntelMaxxing. Write TWO briefings.

1. "intel_briefing_text": 3-paragraph detective-noir case debrief, 110-150 words.
   Open with "Case number ${caseNumber}". Reference FOXHOUND, WIRETAP, GHOSTNET at least
   once each. ${isHiring
     ? `Position the intel as "off-LinkedIn" / "off-grid". End with "Move fast. Case remains open."`
     : `Mission is "${mission.mission_type}" — frame it as intel gathered, not jobs. End with "Case remains open."`}

2. "intel_briefing_voice": 30-40 words MAX (10-15 sec spoken). Thick spy / noir detective
   tone with ONE Gen-Z phrase ("no cap", "locked in", "it's giving", "real ones", "moving
   different") dropped naturally. Must name the TOP target + one concrete signal. No case
   number. No "move fast". Example tone:
     - "Intel dropped. [X] — lean team, fresh money. Off-LinkedIn, no cap. Locked in. Go."

Respond ONLY with JSON:
{ "intel_briefing_text": "...", "intel_briefing_voice": "..." }
No fences, no preamble.`;

  const user = `MISSION: ${JSON.stringify(mission)}
FOXHOUND (top): ${JSON.stringify(funding.slice(0, 3))}
WIRETAP (top): ${JSON.stringify(signals.slice(0, 3))}
GHOSTNET (top): ${JSON.stringify(oss.slice(0, 3))}`;

  try {
    const out = await gemmaJSON<{ intel_briefing_text?: string; intel_briefing_voice?: string }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 400, temperature: 0.55, provider }
    );
    return {
      text: out.intel_briefing_text || "",
      voice: out.intel_briefing_voice || "",
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Sub-call 3: MOAT BRIEFINGS — one tailored pitch per likely-to-hire funder
// ──────────────────────────────────────────────────────────────
async function callMoatBriefings(
  moatCompanies: Array<{
    company_name: string;
    funding_stage: string;
    funding_amount: string;
    industry: string;
    url: string;
  }>,
  provider?: Provider
): Promise<MoatBriefing[]> {
  const system = `You are PROFILER. For each company in MOAT_COMPANIES, write ONE audio
briefing (35-55 words, ≈15-20 sec spoken). Thick-spy / light-Gen-Z tone ("no cap",
"locked in", etc. — ONE phrase max). Structure each briefing:
  a) Open with company name + funding detail ("[Co] just closed [stage] for [amount]")
  b) State the likely role gap ("lean team · needs a founding engineer")
  c) End with ONE concrete action ("Ship a PR on their repo this week then cold email CTO")

Respond ONLY with JSON:
{ "moat_briefings": [ { "company_name": "...", "text": "..." }, ... ] }
No fences, no preamble.`;

  const user = `MOAT_COMPANIES: ${JSON.stringify(moatCompanies)}`;
  try {
    const out = await gemmaJSON<{ moat_briefings?: MoatBriefing[] }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_tokens: 700, temperature: 0.55, provider }
    );
    return Array.isArray(out.moat_briefings) ? out.moat_briefings : [];
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function reconcileMoatBriefings(
  fromModel: MoatBriefing[],
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
): TopTarget[] {
  const scores = new Map<
    string,
    { company: string; score: number; signals: string[]; actions: string[] }
  >();

  const push = (name: string, signal: string, action: string, weight: number) => {
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
    push(
      f.company_name,
      `FOXHOUND: ${f.funding_stage} ${f.funding_amount}`,
      `Research ${f.company_name} team page and cold-reach a hiring manager.`,
      3
    )
  );
  signals.forEach((s) =>
    push(
      s.company_name,
      `WIRETAP: ${s.signal_type}`,
      `Reply to HN hiring post with tailored pitch: ${s.role_hints[0] || "role"}`,
      4
    )
  );
  oss.forEach((o) =>
    push(
      o.company_name,
      `GHOSTNET: ${o.good_first_issues_count} good-first-issues`,
      o.entry_strategy,
      2
    )
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
