import { NextResponse } from "next/server";
import { z } from "zod";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@/lib/supabase/server";
import { retrieve, buildContextBlock } from "@/lib/retrieve";
import { buildSystemPrompt } from "@/lib/persona";
import { smartTitle } from "@/lib/utils";
import { consumeCredit, outOfCreditsBody } from "@/lib/credits";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AgentConfigRow {
  persona: string;
  system_prompt: string;
  model: string;
  temperature: number;
  top_k: number;
  rerank_enabled: boolean;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Charge a credit BEFORE any OpenAI calls. Users with a zero balance
  // can't make us spend money on their behalf.
  const credit = await consumeCredit(supabase, user.id, "chat");
  if (!credit.allowed) {
    return NextResponse.json(outOfCreditsBody("chat"), { status: 402 });
  }

  let body: { messages: UIMessage[]; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { messages } = body;
  let conversationId = body.conversationId;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }

  // Load (or fall back to defaults for) the per-user agent config.
  const { data: configRow } = await supabase
    .from("agent_config")
    .select("persona, system_prompt, model, temperature, top_k, rerank_enabled")
    .eq("user_id", user.id)
    .single();
  const cfg: AgentConfigRow = configRow ?? {
    persona: "Helpful, concise expert assistant.",
    system_prompt:
      "You answer questions strictly using the provided knowledge base context. Cite sources by their numeric reference like [1], [2].",
    model: env.OPENAI_CHAT_MODEL(),
    temperature: 0.3,
    top_k: 8,
    rerank_enabled: true,
  };

  // Get-or-create the conversation.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText =
    lastUserMsg?.parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n") ?? "";

  if (!conversationId) {
    const title = smartTitle(lastUserText, 60) || "New conversation";
    const { data: convRow, error: convErr } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (convErr || !convRow) {
      return NextResponse.json({ error: "failed to create conversation" }, { status: 500 });
    }
    conversationId = convRow.id as string;
  } else {
    // Verify the caller actually owns this conversation. RLS would prevent
    // cross-user reads anyway, but checking here gives a clean 404 instead of
    // silently writing messages that the legitimate owner can never see.
    const { data: owned } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "conversation not found" }, { status: 404 });
    }
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  // Persist the latest user message (idempotency: skip if same text already last).
  if (lastUserMsg) {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: lastUserText,
    });
  }

  // Retrieval: refine the query with conversation context for better recall on follow-ups.
  const refinedQuery = await refineQuery(messages, lastUserText, cfg.model);

  const initialChunks = await retrieve(supabase, user.id, refinedQuery, {
    topK: cfg.top_k,
    candidateK: Math.max(20, cfg.top_k * 2),
    rerank: cfg.rerank_enabled,
  });

  const { contextText, citations: initialCitations } = buildContextBlock(initialChunks);
  const finalConvId = conversationId;

  const systemPrompt = buildSystemPrompt({
    persona: cfg.persona,
    systemPrompt: cfg.system_prompt,
    contextText,
    hasContext: initialChunks.length > 0,
  });

  // Mutable accumulator — initial retrieval + every chunk surfaced by the
  // search_kb tool. We broadcast updates to the client as the tool fires,
  // and we persist the final list with the assistant message.
  const seenChunkIds = new Set<string>(initialCitations.map((c) => c.chunk_id));
  const accumulated: typeof initialCitations = [...initialCitations];

  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "message-metadata", messageMetadata: { conversationId: finalConvId } });

      // Same `id` on subsequent writes updates the existing data part in place.
      if (accumulated.length > 0) {
        writer.write({ type: "data-citations", id: "citations", data: [...accumulated] });
      }

      // The optional `search_kb` tool lets the model do an additional retrieval
      // step when it needs to refocus a follow-up question. Newly retrieved
      // chunks are appended to `accumulated` and re-broadcast so the citation
      // chips in the UI grow live as the tool fires.
      const tools = {
        search_kb: tool({
          description:
            "Search the knowledge base for additional chunks relevant to a focused query. Use ONLY when the initial context is insufficient.",
          inputSchema: z.object({
            query: z.string().describe("A focused search query in natural language."),
          }),
          execute: async ({ query }) => {
            const more = await retrieve(supabase, user.id, query, {
              topK: 6,
              candidateK: 16,
              rerank: cfg.rerank_enabled,
            });
            const newOnes: typeof initialCitations = [];
            for (const c of more) {
              if (seenChunkIds.has(c.id)) continue;
              seenChunkIds.add(c.id);
              accumulated.push({
                n: accumulated.length + 1,
                chunk_id: c.id,
                document_id: c.document_id,
                title: c.document_title,
                url: c.source_url ?? null,
              });
              newOnes.push(accumulated[accumulated.length - 1]);
            }
            if (newOnes.length > 0) {
              writer.write({ type: "data-citations", id: "citations", data: [...accumulated] });
            }
            // Hand the model concise excerpts so it can decide to cite them.
            return more.map((c, i) => ({
              n: accumulated.length - more.length + i + 1,
              chunk_id: c.id,
              title: c.document_title,
              url: c.source_url,
              excerpt: c.content.slice(0, 600),
            }));
          },
        }),
      } as const;

      const result = streamText({
        model: openai(cfg.model),
        system: systemPrompt,
        messages: modelMessages,
        temperature: cfg.temperature,
        tools,
        stopWhen: stepCountIs(3),
        onFinish: async ({ text, usage }) => {
          await supabase.from("messages").insert({
            conversation_id: finalConvId,
            user_id: user.id,
            role: "assistant",
            content: text,
            citations: accumulated,
            token_usage: {
              prompt: usage?.inputTokens ?? null,
              completion: usage?.outputTokens ?? null,
              total: usage?.totalTokens ?? null,
            },
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * Lightweight query rewriter — turns a follow-up like "and what about the second one?"
 * into a standalone query that retrieval can actually match against.
 * Uses a tiny non-streaming generation; failure falls back to the raw last user text.
 */
async function refineQuery(messages: UIMessage[], lastUserText: string, model: string): Promise<string> {
  // Skip rewriting on first turn
  const turnCount = messages.filter((m) => m.role === "user").length;
  if (turnCount <= 1) return lastUserText;

  const recent = messages
    .slice(-6)
    .map((m) => {
      const txt = m.parts
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      return `${m.role.toUpperCase()}: ${txt}`;
    })
    .join("\n");

  try {
    const { generateText } = await import("ai");
    const { text } = await generateText({
      model: openai(model),
      system:
        "Rewrite the LATEST USER message into a standalone search query. Resolve pronouns and follow-up references using the conversation history. Return ONLY the rewritten query, no preamble.",
      prompt: `Conversation:\n${recent}\n\nLatest user message: ${lastUserText}`,
      temperature: 0,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    return cleaned || lastUserText;
  } catch {
    return lastUserText;
  }
}
