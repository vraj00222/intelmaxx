// Gemma 4 wrapper — served via Novita's OpenAI-compatible endpoint.
// Model: google/gemma-4-26b-a4b-it (26B MoE)

const NOVITA_BASE = "https://api.novita.ai/v3/openai";
const MODEL_ID = "google/gemma-4-26b-a4b-it";

export type GemmaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GemmaOptions = {
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
};

function getKey(): string {
  const key = process.env.NOVITA_API_KEY;
  if (!key) throw new Error("NOVITA_API_KEY not set");
  return key;
}

export async function gemmaComplete(
  messages: GemmaMessage[],
  opts: GemmaOptions = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL_ID,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 1200,
  };

  const res = await fetch(`${NOVITA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Prevent Next caching for live agent calls
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
