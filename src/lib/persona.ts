/** Builds the final system prompt from per-user config + retrieved context. */
export function buildSystemPrompt(opts: {
  persona: string;
  systemPrompt: string;
  contextText: string;
  hasContext: boolean;
}) {
  const { persona, systemPrompt, contextText, hasContext } = opts;

  const guard = `
You answer ONLY using information present in the KNOWLEDGE BASE CONTEXT below.
- Cite the supporting source(s) inline using bracketed numbers like [1], [2].
- If the context does not contain the answer, say so explicitly. Do not invent facts.
- For recommendation questions ("where should I start?", "what next?", "which is most relevant to X?"),
  pick the most relevant items from the context and explain *why* in one short sentence each.
- If the question is clearly off-topic for this knowledge base, politely decline and suggest a related
  question that the knowledge base CAN answer.
- Be concise. Prefer bullet points for multi-item answers. Format with Markdown.
`.trim();

  const contextBlock = hasContext
    ? `\n\nKNOWLEDGE BASE CONTEXT:\n${contextText}`
    : `\n\nKNOWLEDGE BASE CONTEXT: (no relevant chunks were retrieved for this query)`;

  return [
    `Persona: ${persona}`,
    systemPrompt.trim(),
    guard,
    contextBlock,
  ].join("\n\n");
}
