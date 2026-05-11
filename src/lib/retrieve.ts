import type { SupabaseClient } from "@supabase/supabase-js";
import { embedOne } from "@/lib/openai";
import { rerank } from "@/lib/cohere";

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  document_title?: string;
  source_url?: string | null;
}

export interface RetrieveOptions {
  topK?: number; // final count after rerank
  candidateK?: number; // pre-rerank fanout
  rerank?: boolean;
}

/**
 * Hybrid retrieval: pgvector + FTS fused with RRF in SQL, then Cohere rerank.
 * RLS guarantees a user only sees their own chunks; we additionally pass user_id
 * so the SQL function can leverage the per-user index.
 */
export async function retrieve(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  opts: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const candidateK = opts.candidateK ?? 20;
  const topK = opts.topK ?? 8;
  const useRerank = opts.rerank ?? true;

  const queryEmbedding = await embedOne(query);

  const { data, error } = await supabase.rpc("match_chunks_hybrid", {
    p_user_id: userId,
    p_query_text: query,
    p_query_embed: queryEmbedding,
    p_match_count: candidateK,
  });

  if (error) {
    console.error("retrieve rpc error", error);
    return [];
  }

  type Row = {
    id: string;
    document_id: string;
    content: string;
    metadata: Record<string, unknown>;
    rrf_score: number;
  };
  const candidates: RetrievedChunk[] = (data as Row[]).map((r) => ({
    id: r.id,
    document_id: r.document_id,
    content: r.content,
    metadata: r.metadata,
    score: r.rrf_score,
  }));

  if (candidates.length === 0) return [];

  let finalChunks = candidates;
  if (useRerank) {
    const reranked = await rerank(
      query,
      candidates.map((c) => ({ id: c.id, content: c.content })),
      topK
    );
    const byId = new Map(candidates.map((c) => [c.id, c]));
    finalChunks = reranked.map((r) => byId.get(r.id)!).filter(Boolean);
  } else {
    finalChunks = candidates.slice(0, topK);
  }

  // Hydrate document titles + source URLs in a single query.
  const docIds = Array.from(new Set(finalChunks.map((c) => c.document_id)));
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, source_url")
      .in("id", docIds);
    const docMap = new Map((docs ?? []).map((d) => [d.id, d]));
    finalChunks = finalChunks.map((c) => {
      const d = docMap.get(c.document_id);
      return d ? { ...c, document_title: d.title, source_url: d.source_url } : c;
    });
  }

  return finalChunks;
}

/** Build the citation block + source list for the LLM prompt. */
export function buildContextBlock(chunks: RetrievedChunk[]): {
  contextText: string;
  citations: { n: number; chunk_id: string; document_id: string; title?: string; url?: string | null }[];
} {
  const citations = chunks.map((c, i) => ({
    n: i + 1,
    chunk_id: c.id,
    document_id: c.document_id,
    title: c.document_title,
    url: c.source_url ?? null,
  }));
  const contextText = chunks
    .map((c, i) => {
      const ttl = c.document_title ? ` — ${c.document_title}` : "";
      return `[${i + 1}${ttl}]\n${c.content}`;
    })
    .join("\n\n---\n\n");
  return { contextText, citations };
}
