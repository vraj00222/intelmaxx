// Gemma wrapper — two-provider design.
//
// DEFAULT: Novita hosted Gemma 4 26B MoE (`google/gemma-4-26b-a4b-it`)
// LOCAL:   Ollama with Gemma 3 (or any tag user has locally)
//
// Switch providers by setting `GEMMA_PROVIDER=ollama` in env.
//  - OLLAMA_BASE   (default http://localhost:11434)
//  - OLLAMA_MODEL  (default gemma3:4b — change to whatever `ollama list` shows)

const NOVITA_BASE = "https://api.novita.ai/v3/openai";
const NOVITA_MODEL = "google/gemma-4-26b-a4b-it";

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

export type GemmaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GemmaOptions = {
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
};

type Provider = "novita" | "ollama";
function provider(): Provider {
  return (process.env.GEMMA_PROVIDER || "novita").toLowerCase() === "ollama"
    ? "ollama"
    : "novita";
}

function getNovitaKey(): string {
  const key = process.env.NOVITA_API_KEY;
  if (!key) throw new Error("NOVITA_API_KEY not set");
  return key;
}

export async function gemmaComplete(
  messages: GemmaMessage[],
  opts: GemmaOptions = {}
): Promise<string> {
  return provider() === "ollama"
    ? ollamaComplete(messages, opts)
    : novitaComplete(messages, opts);
}

async function ollamaComplete(
  messages: GemmaMessage[],
  opts: GemmaOptions
): Promise<string> {
  // Ollama's OpenAI-compatible chat endpoint at /v1/chat/completions
  const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 1200,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${res.status}) — is ollama running at ${OLLAMA_BASE}? ${text.slice(0, 240)}`
    );
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty content");
  return content;
}

async function novitaComplete(
  messages: GemmaMessage[],
  opts: GemmaOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    model: NOVITA_MODEL,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 1200,
  };

  const res = await fetch(`${NOVITA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getNovitaKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemma request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Gemma returned empty content");
  return content;
}

/**
 * Call Gemma expecting JSON output. Strips markdown code fences and first
 * JSON structure. Retries once on parse failure with a clarifying append.
 */
export async function gemmaJSON<T = unknown>(
  messages: GemmaMessage[],
  opts: GemmaOptions = {}
): Promise<T> {
  let raw = await gemmaComplete(messages, { temperature: 0.25, ...opts });
  try {
    return parseJSONLoose<T>(raw);
  } catch {
    // Retry once with stricter instruction
    const retry: GemmaMessage[] = [
      ...messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Respond again with ONLY the JSON. No markdown fences, no preamble, no commentary.",
      },
    ];
    raw = await gemmaComplete(retry, { temperature: 0.15, ...opts });
    return parseJSONLoose<T>(raw);
  }
}

function parseJSONLoose<T>(text: string): T {
  let t = text.trim();
  // Strip markdown fences
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Try to locate the first JSON structure
  const firstBrace = t.indexOf("{");
  const firstBracket = t.indexOf("[");
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start > 0) t = t.slice(start);

  // Trim trailing non-JSON after last closing char
  const endBrace = t.lastIndexOf("}");
  const endBracket = t.lastIndexOf("]");
  const end = Math.max(endBrace, endBracket);
  if (end !== -1 && end < t.length - 1) t = t.slice(0, end + 1);

  return JSON.parse(t) as T;
}
