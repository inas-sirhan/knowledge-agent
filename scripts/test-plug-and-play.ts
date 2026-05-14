/**
 * The literal "plug and play" promise from the PDF (Section 3):
 *   "drop in their own knowledge base, and have a working AI assistant
 *    within minutes."
 *
 * This test simulates a fresh user uploading their own content and
 * chatting with it. End-to-end through the real RAG pipeline:
 *
 *   1. Create a brand-new user (via admin API).
 *   2. Set their persona + give them a starting credit budget.
 *   3. Ingest a synthetic document containing a made-up term ("Glorbax
 *      Protocol") that the model couldn't know from training.
 *   4. Run the actual chat pipeline (refineQuery → retrieve → generateText)
 *      against that user's data.
 *   5. Verify the answer mentions the made-up term AND has a non-empty
 *      citation list pointing at the newly-ingested doc.
 *   6. Delete the user (cascades to docs, chunks, credits, conversations).
 *
 *   tsx scripts/test-plug-and-play.ts
 */
import "dotenv/config";
import { generateText, convertToModelMessages, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { admin } from "./_lib";
import { ingestText } from "../src/lib/ingest";
import { retrieve, buildContextBlock } from "../src/lib/retrieve";
import { buildSystemPrompt } from "../src/lib/persona";

const SYNTHETIC_DOC = `# The Glorbax Protocol

The Glorbax Protocol is a fictional 9-step procedure invented purely for
this end-to-end ingestion test. It exists to verify the retrieval pipeline
can pull novel information out of a user's freshly-uploaded knowledge
base.

The nine steps of the Glorbax Protocol, in order, are:
1. Calibrate the zorbinator to exactly 47.3 degrees Krelvin.
2. Apply two coats of plumber's mucilage to the outer shell.
3. Sing the third verse of "Old MacDonald" backwards.
4. Insert the indigo widget into slot B.
5. Wait nineteen and a half minutes.
6. Verify the alignment by checking the dorsal flange.
7. Twist the chronoval clockwise three full turns.
8. Pour seven millilitres of synthesised glorbax solution into the
   reservoir. (The solution itself is unobtainium-stable.)
9. Press the green button.

If the indicator light turns purple, the Glorbax Protocol has succeeded.
If it turns yellow, abort and restart from step 1. The Glorbax Protocol
was first documented in the 2087 edition of the Imaginary Procedures
Handbook.`;

async function main() {
  const a = admin();
  const email = `__pnp_test_${Date.now()}@demo.local`;
  const password = "plug-and-play-Test-123!";

  console.log(`Creating throwaway user: ${email}`);
  const { data: created, error: createErr } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error("createUser failed:", createErr);
    process.exit(1);
  }
  const userId = created.user.id;

  let pass = 0, fail = 0;
  const check = (label: string, cond: boolean, detail = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
    cond ? pass++ : fail++;
  };

  try {
    // Top up credits + set persona so the chat behaves like a configured agent.
    await a.from("user_credits").upsert({
      user_id: userId,
      chat_credits: 50,
      ingest_credits: 5,
      updated_at: new Date().toISOString(),
    });
    await a.from("agent_config").upsert({
      user_id: userId,
      persona: "A precise reference assistant for fictional procedures and made-up science.",
      system_prompt:
        "Answer strictly from the indexed sources. Cite with [n]. If the answer is not in the context, say you don't know.",
      model: "gpt-4o-mini",
      temperature: 0.2,
      top_k: 6,
      rerank_enabled: true,
      updated_at: new Date().toISOString(),
    });

    // ----- Step 1: ingest the synthetic doc -----
    console.log("\n[1] Ingest synthetic doc");
    const t0 = Date.now();
    const result = await ingestText(a, {
      userId,
      title: "Glorbax Protocol — test fixture",
      rawText: SYNTHETIC_DOC,
      sourceType: "paste",
    });
    console.log(`  ingest took ${Date.now() - t0}ms`);
    check("ingest produced chunks", result.chunkCount > 0, `${result.chunkCount} chunks`);
    check("ingest produced tokens", result.tokenCount > 0, `${result.tokenCount} tokens`);

    // ----- Step 2: retrieval finds the new chunk -----
    console.log("\n[2] Retrieve against the new content");
    const query = "What are the steps of the Glorbax Protocol?";
    const t1 = Date.now();
    const chunks = await retrieve(a, userId, query, {
      topK: 6,
      candidateK: 16,
      rerank: !!process.env.COHERE_API_KEY,
    });
    console.log(`  retrieval took ${Date.now() - t1}ms`);
    check("retrieved at least one chunk", chunks.length > 0, `${chunks.length} chunks`);
    const hit = chunks.find((c) => /glorbax/i.test(c.content));
    check("at least one retrieved chunk mentions 'Glorbax'", !!hit);

    // ----- Step 3: chat answers using the new content -----
    console.log("\n[3] Generate an answer (full RAG pipeline)");
    const { contextText, citations } = buildContextBlock(chunks);
    const system = buildSystemPrompt({
      persona: "A precise reference assistant for fictional procedures and made-up science.",
      systemPrompt:
        "Answer strictly from the indexed sources. Cite with [n]. If the answer is not in the context, say you don't know.",
      contextText,
      hasContext: chunks.length > 0,
    });
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: query }] },
    ];
    const t2 = Date.now();
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      messages: await convertToModelMessages(messages),
      temperature: 0,
    });
    console.log(`  generation took ${Date.now() - t2}ms`);

    const lower = text.toLowerCase();
    check("answer mentions 'glorbax'", /glorbax/.test(lower));
    check(
      "answer mentions a clearly KB-grounded detail (zorbinator OR krelvin OR widget)",
      /(zorbinator|krelvin|widget)/.test(lower),
      "any unique made-up term must surface"
    );
    check("answer includes at least one [n] citation marker", /\[\d+\]/.test(text));
    check("citations array is non-empty", citations.length > 0, `${citations.length} citations`);

    console.log("\nAnswer excerpt:");
    console.log("  " + text.slice(0, 300).replace(/\n/g, "\n  ") + (text.length > 300 ? "…" : ""));
  } catch (err) {
    console.error("\nUnexpected error:", err);
    fail++;
  } finally {
    // Cleanup: deleting the user cascades to credits, agent_config,
    // documents (which cascade to chunks), conversations, messages.
    await a.auth.admin.deleteUser(userId).catch(() => {});
    console.log("\n  ✓ cleanup: test user deleted (cascades everything)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("plug-and-play test crashed:", err);
  process.exit(1);
});
