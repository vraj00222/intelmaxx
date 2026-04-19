import { NextRequest, NextResponse } from "next/server";
import { buildCaseFile } from "@/lib/agents/casefile";
import type { CaseFilePayload } from "@/lib/agents/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Same rationale as /api/investigate: deadline jitter + per-source availability
// makes repeated identical lookups "flicker". 90s of stability is enough to
// cover a demo re-run and any accidental double-click.
const CACHE_TTL_MS = 90_000;
const CACHE_MAX = 50;
const _cache = new Map<string, { at: number; payload: CaseFilePayload }>();

function cfKey(company: string, domain: string | undefined): string {
  return `${company.toLowerCase().trim()}::${(domain || "").toLowerCase().trim()}`;
}
function cfGet(key: string): CaseFilePayload | null {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return hit.payload;
}
function cfSet(key: string, payload: CaseFilePayload): void {
  if (_cache.size >= CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { at: Date.now(), payload });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const domain = typeof body.domain === "string" ? body.domain.trim() : undefined;

    if (!company) {
      return NextResponse.json(
        { error: "Provide a company name. Example: { \"company\": \"Cursor\" }" },
        { status: 400 }
      );
    }
    if (company.length > 120) {
      return NextResponse.json(
        { error: "Company name is too long — keep it under 120 characters." },
        { status: 400 }
      );
    }

    const key = cfKey(company, domain);
    const cached = cfGet(key);
    if (cached) return NextResponse.json(cached);

    const payload = await buildCaseFile(company, domain);
    cfSet(key, payload);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }
}
