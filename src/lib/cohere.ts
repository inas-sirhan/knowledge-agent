import { env } from "@/lib/env";

export type RerankCandidate = { id: string; content: string };

export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  topN = 8
): Promise<RerankCandidate[]> {
  const key = env.COHERE_API_KEY();
  if (!key || candidates.length === 0) return candidates.slice(0, topN);

  try {
    const res = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-english-v3.0",
        query,
        documents: candidates.map((c) => c.content),
        top_n: Math.min(topN, candidates.length),
      }),
    });
    if (!res.ok) {
      console.warn("Cohere rerank failed:", res.status, await res.text());
      return candidates.slice(0, topN);
    }
    const json = (await res.json()) as { results: { index: number; relevance_score: number }[] };
    return json.results.map((r) => candidates[r.index]).filter(Boolean);
  } catch (err) {
    console.warn("Cohere rerank error:", err);
    return candidates.slice(0, topN);
  }
}
