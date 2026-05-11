/**
 * Seed two demo users with isolated knowledge bases.
 *
 * Usage:  npm run seed
 *
 * Idempotent: re-running it deletes a user's existing KB and re-ingests.
 * Reads documents from data/seed/<folder>/*.{md,txt} — each file becomes one document.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admin, SEED_USERS, type SeedKey } from "./_lib";
import { ingestText } from "../src/lib/ingest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, "..", "data", "seed");

async function ensureUser(email: string, password: string): Promise<string> {
  const a = admin();
  const { data: list, error: listErr } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    console.log(`  · user ${email} exists (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error("create user failed");
  console.log(`  · created user ${email} (${data.user.id})`);
  return data.user.id;
}

async function readDocsFromFolder(folder: string): Promise<{ title: string; text: string }[]> {
  const dir = path.join(SEED_DIR, folder);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    console.warn(`  ! no folder ${dir} — skipping`);
    return [];
  }
  const docs: { title: string; text: string }[] = [];
  for (const entry of entries.sort()) {
    if (!/\.(md|txt|markdown)$/i.test(entry)) continue;
    const text = await fs.readFile(path.join(dir, entry), "utf8");
    const titleFromContent = text.match(/^#\s+(.+)/m)?.[1]?.trim();
    const title = titleFromContent || entry.replace(/\.(md|txt|markdown)$/i, "").replace(/[-_]/g, " ");
    docs.push({ title, text });
  }
  return docs;
}

async function seedFor(key: SeedKey) {
  const u = SEED_USERS[key];
  console.log(`\n→ Seeding ${key}: ${u.email}`);
  const userId = await ensureUser(u.email, u.password);
  const a = admin();

  // Reset KB for this user.
  await a.from("documents").delete().eq("user_id", userId);

  // Set persona / system prompt.
  await a.from("agent_config").upsert({
    user_id: userId,
    persona: u.persona,
    system_prompt: u.system_prompt,
    model: "gpt-4o-mini",
    temperature: 0.3,
    top_k: 8,
    rerank_enabled: true,
    updated_at: new Date().toISOString(),
  });

  const docs = await readDocsFromFolder(u.folder);
  console.log(`  · found ${docs.length} documents in data/seed/${u.folder}`);
  if (docs.length === 0) {
    console.warn(`  ! no documents to ingest. Drop .md files into data/seed/${u.folder}/`);
    return;
  }

  let totalChunks = 0;
  let totalTokens = 0;
  for (const d of docs) {
    process.stdout.write(`  · ingesting "${d.title}" … `);
    const r = await ingestText(a, {
      userId,
      title: d.title,
      rawText: d.text,
      sourceType: "paste",
      metadata: { seeded: true, kb: u.label },
    });
    totalChunks += r.chunkCount;
    totalTokens += r.tokenCount;
    console.log(`${r.chunkCount} chunks, ~${r.tokenCount.toLocaleString()} tokens`);
  }
  console.log(`  ✓ ${u.label}: ${docs.length} docs, ${totalChunks} chunks, ~${totalTokens.toLocaleString()} tokens`);
}

async function main() {
  console.log("Seeding demo users + knowledge bases…");
  await seedFor("A");
  await seedFor("B");
  console.log("\nDone. Sign in with:");
  console.log(`  A → ${SEED_USERS.A.email} / ${SEED_USERS.A.password}`);
  console.log(`  B → ${SEED_USERS.B.email} / ${SEED_USERS.B.password}`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
