import { NextRequest, NextResponse } from "next/server";
import { buildCaseFile } from "@/lib/agents/casefile";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    const payload = await buildCaseFile(company, domain);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }
}
