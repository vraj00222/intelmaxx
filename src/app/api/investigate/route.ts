import { NextRequest, NextResponse } from "next/server";
import { parseMission, newCaseNumber } from "@/lib/agents/orchestrator";
import { runFoxhound } from "@/lib/agents/funding";
import { runWiretap } from "@/lib/agents/signals";
import { runGhostnet } from "@/lib/agents/opensource";
import { runProfiler } from "@/lib/agents/matcher";
import type { InvestigationPayload } from "@/lib/agents/types";
import type { Provider } from "@/lib/gemma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
    }
    const provider: Provider | undefined =
      body.provider === "ollama" || body.provider === "novita" ? body.provider : undefined;

    // 1. Parse mission via Gemma
    const mission = await parseMission(query, provider);

    // 2. Launch field agents in parallel
    const [fundingR, signalsR, ossR] = await Promise.allSettled([
      runFoxhound(mission, provider),
      runWiretap(mission, provider),
      runGhostnet(mission, provider),
    ]);

    const funding = fundingR.status === "fulfilled" ? fundingR.value : [];
    const signals = signalsR.status === "fulfilled" ? signalsR.value : [];
    const oss = ossR.status === "fulfilled" ? ossR.value : [];

    // 3. Compile via PROFILER
    const profiler = await runProfiler(mission, funding, signals, oss, provider);

    const payload: InvestigationPayload = {
      mission,
      funding,
      signals,
      oss,
      profiler,
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
