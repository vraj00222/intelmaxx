import { NextRequest, NextResponse } from "next/server";
import { parseMission, newCaseNumber, fallbackMission } from "@/lib/agents/orchestrator";
import { runFoxhound } from "@/lib/agents/funding";
import { runWiretap } from "@/lib/agents/signals";
import { runGhostnet } from "@/lib/agents/opensource";
import { runProfiler, buildProfilerFallback } from "@/lib/agents/matcher";
import { runDossierAgent } from "@/lib/agents/dossier";
import type { InvestigationPayload, LikelyHiringDossier } from "@/lib/agents/types";
import type { Provider } from "@/lib/gemma";

export const runtime = "nodejs";
// Vercel Fluid Compute allows up to 300s. We keep the internal route deadline
// tighter so we always return *something* (even a degraded payload) before
// Vercel guillotines us at the platform edge.
export const maxDuration = 300;

const ROUTE_DEADLINE_MS = 90_000;

/** Race a promise against a deadline; on miss, resolve with `fallback` instead of hanging. */
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[investigate] ${label} hit deadline (${ms}ms) — falling back`);
      resolve(fallback);
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); console.warn(`[investigate] ${label} error`, e); resolve(fallback); }
    );
  });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
    if (!rawQuery) {
      return NextResponse.json(
        { error: "Describe a mission — a sentence about who you want to work for or what you're looking for." },
        { status: 400 }
      );
    }
    if (rawQuery.length > 1000) {
      return NextResponse.json(
        { error: "Mission brief is too long — keep it under 1000 characters so the agents can focus." },
        { status: 400 }
      );
    }
    // Collapse whitespace/newlines so pasted walls-of-text don't confuse Gemma.
    const query = rawQuery.replace(/\s+/g, " ");
    const provider: Provider | undefined =
      body.provider === "ollama" || body.provider === "novita" ? body.provider : undefined;

    // 1. Parse mission via Gemma (classifies mission_type: hiring / oss_contrib / research / general).
    //    Hard-capped at 10s — if the LLM provider is degraded we fall back to
    //    the heuristic mission brief rather than letting the whole route hang.
    const t0 = Date.now();
    const mission = await withDeadline(
      parseMission(query, provider),
      10_000,
      fallbackMission(query),
      "parseMission"
    );
    console.log(`[investigate] parseMission took ${Date.now() - t0}ms`, {
      mission_type: mission.mission_type,
      industry: mission.industry,
      keywords: mission.keywords,
    });

    // 2. Conditional dispatch by mission_type — skip irrelevant agents to save
    //    latency & tokens. OSS / research queries don't need funding or hiring intel.
    const type = mission.mission_type;
    const wantFunding = type === "hiring" || type === "general";
    const wantSignals = type === "hiring" || type === "general";
    const wantOSS = true; // GHOSTNET is useful for every mission type

    // Agent-phase deadline: whatever's done by then makes it into PROFILER; the rest
    // is treated as empty. PROFILER then has the remaining budget.
    const AGENT_DEADLINE = 28_000;
    const t1 = Date.now();
    const [funding, signals, oss] = await Promise.all([
      withDeadline(
        wantFunding ? runFoxhound(mission, provider) : Promise.resolve([]),
        AGENT_DEADLINE,
        [],
        "FOXHOUND"
      ),
      withDeadline(
        wantSignals ? runWiretap(mission, provider) : Promise.resolve([]),
        AGENT_DEADLINE,
        [],
        "WIRETAP"
      ),
      withDeadline(
        wantOSS ? runGhostnet(mission, provider) : Promise.resolve([]),
        AGENT_DEADLINE,
        [],
        "GHOSTNET"
      ),
    ]);
    console.log(`[investigate] agents took ${Date.now() - t1}ms`, {
      wantFunding, wantSignals, wantOSS,
      funding: funding.length, signals: signals.length, oss: oss.length,
    });

    // 3. PROFILER + DOSSIER agent — run in parallel against the remaining budget.
    //    PROFILER = 3 Gemma calls for top_targets/briefings/moat (see matcher.ts).
    //    DOSSIER  = YC + funding + signals → gated → DDG people lookup + Reddit
    //               chatter + cold email drafts (see dossier.ts).
    const remaining = Math.max(5_000, ROUTE_DEADLINE_MS - (Date.now() - started));
    const t2 = Date.now();
    const [profiler, likely_hiring] = await Promise.all([
      withDeadline(
        runProfiler(mission, funding, signals, oss, provider),
        remaining,
        buildProfilerFallback(mission, funding, signals, oss),
        "PROFILER"
      ),
      withDeadline(
        runDossierAgent(mission, funding, signals, provider),
        remaining,
        [] as LikelyHiringDossier[],
        "DOSSIER"
      ),
    ]);
    console.log(`[investigate] profiler+dossier took ${Date.now() - t2}ms`, {
      dossiers: likely_hiring.length,
    });

    const payload: InvestigationPayload = {
      mission,
      funding,
      signals,
      oss,
      profiler,
      likely_hiring,
      case_number: newCaseNumber(),
      elapsed_ms: Date.now() - started,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }
}
