import OpenAI from "openai";
import { env } from "@/lib/env";

let _client: OpenAI | null = null;
export function openai() {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY() });
  return _client;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  // text-embedding-3-small supports up to ~2048 inputs/request; we batch to 96 to stay safe.
  const out: number[][] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await openai().embeddings.create({
      model: env.OPENAI_EMBED_MODEL(),
      input: slice,
    });
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v;
}
