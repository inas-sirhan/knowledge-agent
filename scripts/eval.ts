/**
 * Evaluation harness — golden questions per KB.
 *
 * Reads data/eval/<folder>.json which has the shape:
 *   [
 *     { "q": "string", "expects": ["substring", "or another"] }
 *   ]
 *
 * Runs each question end-to-end (retrieval → generation) for the matching seeded user
 * and checks that the model's answer contains AT LEAST one of the expected substrings.
 *
 * Reports retrieval hits, citation count, and a simple pass-rate.
 *
 * Usage:  npm run eval
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, convertToModelMessages, type UIMessage } from "ai";
import { openai as openaiProvider } from "@ai-sdk/openai";
import { admin, SEED_USERS, type SeedKey } from "./_lib";
import { retrieve, buildContextBlock } from "../src/lib/retrieve";
import { buildSystemPrompt } from "../src/lib/persona";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.join(__dirname, "..", "data", "eval");

async function getUserId(email: string): Promise<string> {
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`User ${email} not found — run npm run seed first.`);
  return u.id;
}

async function evalKB(key: SeedKey) {
  const u = SEED_USERS[key];
  const file = path.join(EVAL_DIR, `${u.folder}.json`);
  let cases: { q: string; expects: string[] }[];
  try {
    cases = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    console.warn(`! no eval file ${file} — skipping ${u.label}`);
    return { kb: u.label, total: 0, passed: 0 };
  }
  const userId = await getUserId(u.email);
  const a = admin();

  console.log(`\n→ Evaluating ${u.label} (${cases.length} questions)`);
  let passed = 0;
  for (const c of cases) {
    const chunks = await retrieve(a, userId, c.q, { topK: 6, candidateK: 16, rerank: !!process.env.COHERE_API_KEY });
    const { contextText, citations } = buildContextBlock(chunks);
    const sys = buildSystemPrompt({
      persona: u.persona,
      systemPrompt: u.system_prompt,
      contextText,
      hasContext: chunks.length > 0,
    });
    const messages: UIMessage[] = [
      { id: "u", role: "user", parts: [{ type: "text", text: c.q }] },
    ];
    const { text } = await generateText({
      model: openaiProvider("gpt-4o-mini"),
      system: sys,
      messages: await convertToModelMessages(messages),
      temperature: 0,
    });
    const lower = text.toLowerCase();
    const hit = c.expects.some((e) => lower.includes(e.toLowerCase()));
    if (hit) passed++;
    console.log(`  ${hit ? "✓" : "✗"}  retrieved=${chunks.length} cites=${citations.length}  Q: ${c.q.slice(0, 70)}`);
    if (!hit) {
      console.log(`     expected one of: ${c.expects.map((e) => `"${e}"`).join(", ")}`);
      console.log(`     answer: ${text.slice(0, 200)}…`);
    }
  }
  return { kb: u.label, total: cases.length, passed };
}

async function main() {
  const results = [await evalKB("A"), await evalKB("B")];
  console.log("\n=== Eval summary ===");
  for (const r of results) console.log(`  ${r.kb}: ${r.passed}/${r.total}`);
  const passed = results.reduce((acc, r) => acc + r.passed, 0);
  const total = results.reduce((acc, r) => acc + r.total, 0);
  console.log(`  total: ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
