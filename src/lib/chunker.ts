// Simple, deterministic recursive chunker — no external deps.
// Targets ~700 tokens per chunk with ~120 token overlap, using paragraph
// then sentence then word fallbacks. Token counts are approximated as
// chars/4 to avoid an extra dependency on a tokenizer.

const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  chunkSize?: number; // tokens
  chunkOverlap?: number; // tokens
}

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

export function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / CHARS_PER_TOKEN));
}

function splitByParagraph(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitBySentence(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    if ((buf + " " + w).length > maxChars) {
      if (buf) out.push(buf);
      buf = w;
    } else {
      buf = buf ? buf + " " + w : w;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const target = opts.chunkSize ?? 700;
  const overlap = opts.chunkOverlap ?? 120;
  const maxChars = target * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Build a flat list of "atoms" (paragraphs, then sentences, then word slices)
  const atoms: string[] = [];
  for (const p of splitByParagraph(cleaned)) {
    if (p.length <= maxChars) {
      atoms.push(p);
    } else {
      for (const s of splitBySentence(p)) {
        if (s.length <= maxChars) atoms.push(s);
        else atoms.push(...splitByWords(s, maxChars));
      }
    }
  }

  // Greedily pack atoms into chunks
  const chunks: Chunk[] = [];
  let buf = "";
  let index = 0;
  for (const a of atoms) {
    const candidate = buf ? buf + "\n\n" + a : a;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) {
        chunks.push({ index: index++, content: buf, tokenCount: approxTokens(buf) });
        // overlap from the tail of the previous chunk
        const tail = buf.slice(Math.max(0, buf.length - overlapChars));
        buf = tail + "\n\n" + a;
        if (buf.length > maxChars) {
          // atom alone exceeds maxChars; emit it as its own chunk
          chunks.push({ index: index++, content: a, tokenCount: approxTokens(a) });
          buf = "";
        }
      } else {
        chunks.push({ index: index++, content: a, tokenCount: approxTokens(a) });
        buf = "";
      }
    }
  }
  if (buf) chunks.push({ index: index++, content: buf, tokenCount: approxTokens(buf) });
  return chunks;
}
