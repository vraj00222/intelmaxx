import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "node:stream";

let _client: ElevenLabsClient | null = null;

function getClient() {
  if (_client) return _client;
  const apiKey =
    process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  _client = new ElevenLabsClient({ apiKey });
  return _client;
}

/**
 * Expand ambiguous short-forms that ElevenLabs mispronounces ("$22M" → "twenty-two
 * meters", "YC" as two letters, "SF" spelled out, etc.) so the noir briefing
 * actually reads like a detective talking, not a form reader. Kept deliberately
 * narrow — we only rewrite tokens whose "speech" form is clearly preferable to
 * the written form in this product's domain (startups, funding, hiring).
 */
export function normalizeForSpeech(input: string): string {
  let s = input;

  // Currency + magnitude suffix: "$22M" / "$5.3M" / "50K" / "$2B".
  // Require the M/K/B to be a standalone suffix, not part of a larger word.
  s = s.replace(
    /\$(\d+(?:\.\d+)?)\s*([MKB])\b/g,
    (_, n: string, suffix: string) => {
      const word = suffix === "M" ? "million" : suffix === "B" ? "billion" : "thousand";
      return `${n} ${word} dollars`;
    }
  );
  // Bare "$50" / "$5" — say "dollars".
  s = s.replace(/\$(\d+(?:\.\d+)?)\b(?!\s*(?:million|billion|thousand))/g, "$1 dollars");

  // Non-currency magnitude like "raised 22M" or "22M ARR" → "22 million".
  // Only trigger when preceded by a space+digit token (keeps us from chewing up
  // model names like "gemma4:e2b" which contain 4M, 2B patterns).
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*([MKB])\b(?!\w)/g, (match, n: string, suffix: string) => {
    // Skip if it's obviously a version or identifier (e.g. "v1.2B" already handled).
    const word = suffix === "M" ? "million" : suffix === "B" ? "billion" : "thousand";
    return `${n} ${word}`;
  });

  // Domain-specific abbreviations (whole-word). Keep this list narrow — we only
  // rewrite tokens where the written form mis-cues the TTS. Things like CEO,
  // API, IPO already read correctly.
  const WORD_MAP: Record<string, string> = {
    YC: "Y Combinator",
    "Y-C": "Y Combinator",
    SF: "San Francisco",
    NYC: "New York City",
    OSS: "open source",
    "Open-Source": "open source",
    HN: "Hacker News",
    Q1: "first quarter",
    Q2: "second quarter",
    Q3: "third quarter",
    Q4: "fourth quarter",
  };
  for (const [abbr, expansion] of Object.entries(WORD_MAP)) {
    const re = new RegExp(`\\b${abbr.replace(/[-]/g, "\\-")}\\b`, "g");
    s = s.replace(re, expansion);
  }

  // Batch codes: "W26" / "S25" → "winter 2026" / "summer 2025".
  s = s.replace(/\b(W|S)(\d{2})\b/g, (_, season: string, yr: string) => {
    const year = Number(yr) < 50 ? `20${yr}` : `19${yr}`;
    return `${season === "W" ? "winter" : "summer"} ${year}`;
  });

  // Series rounds: "Series A" stays — TTS reads it fine. But "seed-stage" →
  // "seed stage" so it flows.
  s = s.replace(/\bseed-stage\b/gi, "seed stage");
  s = s.replace(/\bpre-seed\b/gi, "pre seed");

  // Collapse stray whitespace left behind by replacements.
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

/**
 * Generate a detective-style voice briefing.
 * Voice ID: JBFqnCBsd6RMkjVDRZzb ("George" — deep, authoritative).
 * Voice settings tuned for a thick spy / noir delivery: lower stability
 * (more expressive), higher style exaggeration (more character).
 */
export async function generateBriefing(text: string): Promise<Buffer> {
  const client = getClient();
  const normalized = normalizeForSpeech(text);
  const trimmed = normalized.slice(0, 4500); // keep generation snappy

  const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
    text: trimmed,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      stability: 0.38,
      similarityBoost: 0.85,
      style: 0.78,
      useSpeakerBoost: true,
    },
  });

  const chunks: Buffer[] = [];
  const stream = audio as unknown as ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;
  const asyncIter: AsyncIterable<Uint8Array> =
    Symbol.asyncIterator in stream
      ? (stream as AsyncIterable<Uint8Array>)
      : (Readable.fromWeb(
          stream as unknown as import("stream/web").ReadableStream<Uint8Array>
        ) as unknown as AsyncIterable<Uint8Array>);
  for await (const chunk of asyncIter) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
