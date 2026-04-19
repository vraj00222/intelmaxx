// Gemma wrapper — two-provider design.
//
// DEFAULT: Novita hosted Gemma 4 31B (`google/gemma-4-31b-it`) — the largest
//          Gemma 4 instruct model available on Novita. Pinned deliberately; do
//          not swap for smaller variants without updating the UI label.
// LOCAL:   Ollama with any local Gemma 4 tag (e.g. `gemma4:e2b`)
//
// Switch providers by setting `GEMMA_PROVIDER=ollama` in env.
//  - OLLAMA_BASE   (default http://localhost:11434)
//  - OLLAMA_MODEL  (default gemma4:e2b — change to whatever `ollama list` shows)

const NOVITA_BASE = "https://api.novita.ai/v3/openai";
export const NOVITA_MODEL = "google/gemma-4-31b-it";

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";

export type GemmaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type Provider = "novita" | "ollama";

export type GemmaOptions = {
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  provider?: Provider;
};

function envProvider(): Provider {
  return (process.env.GEMMA_PROVIDER || "novita").toLowerCase() === "ollama"
    ? "ollama"
    : "novita";
}

function resolveProvider(opts: GemmaOptions): Provider {
  return opts.provider || envProvider();
}

/** Quick availability ping used by /api/provider. 400ms ceiling. */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(400),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
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
  return resolveProvider(opts) === "ollama"
    ? ollamaComplete(messages, opts)
    : novitaComplete(messages, opts);
}

// Per-call hard ceiling. If Novita (or Ollama) doesn't respond in this window, we
// abort and either retry once or return a degraded fallback — never let a call
// hang indefinitely.
const GEMMA_TIMEOUT_MS = 25_000;

async function ollamaComplete(
  messages: GemmaMessage[],
  opts: GemmaOptions
): Promise<string> {
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
    signal: AbortSignal.timeout(GEMMA_TIMEOUT_MS),
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

  // Try once, retry once on timeout/abort. Any other error bubbles up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${NOVITA_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getNovitaKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(GEMMA_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemma request failed (${res.status}): ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Gemma returned empty content");
      return content;
    } catch (e) {
      const isTimeout =
        e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (!isTimeout || attempt === 2) throw e;
      // fall through to retry once on timeout
      console.warn(`[gemma] timeout on attempt ${attempt}, retrying once...`);
    }
  }
  throw new Error("Gemma request failed after retry");
}

/**
 * Call Gemma expecting JSON output. Strips markdown code fences and first
 * JSON structure. Retries once on parse failure with a clarifying append.
 */
export async function gemmaJSON<T = unknown>(
  messages: GemmaMessage[],
  opts: GemmaOptions = {}
): Promise<T> {
  // novitaComplete already handles one timeout-retry internally. If parsing fails
  // here we throw — callers must have a fallback so we don't stack retries on top
  // of retries and blow past the route deadline.
  const raw = await gemmaComplete(messages, { temperature: 0.25, ...opts });
  return parseJSONLoose<T>(raw);
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
