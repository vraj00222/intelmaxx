import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "node:stream";

let _client: ElevenLabsClient | null = null;

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  _client = new ElevenLabsClient({ apiKey });
  return _client;
}

/**
 * Generate a detective-style voice briefing.
 * Voice ID: JBFqnCBsd6RMkjVDRZzb ("George" — deep, authoritative).
 */
export async function generateBriefing(text: string): Promise<Buffer> {
  const client = getClient();
  const trimmed = text.slice(0, 4500); // keep generation snappy

  const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
    text: trimmed,
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      stability: 0.55,
      similarityBoost: 0.8,
      style: 0.45,
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
