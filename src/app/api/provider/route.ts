import { NextResponse } from "next/server";
import { isOllamaAvailable, NOVITA_MODEL, OLLAMA_MODEL } from "@/lib/gemma";

export const runtime = "nodejs";

export async function GET() {
  const envDefault = (process.env.GEMMA_PROVIDER || "novita").toLowerCase();
  const defaultProvider = envDefault === "ollama" ? "ollama" : "novita";
  const ollama_available = await isOllamaAvailable();
  return NextResponse.json(
    {
      default: defaultProvider,
      ollama_available,
      novita_available: Boolean(process.env.NOVITA_API_KEY),
      novita_model: NOVITA_MODEL,
      ollama_model: OLLAMA_MODEL,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
