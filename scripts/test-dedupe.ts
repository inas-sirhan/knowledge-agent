/**
 * Smoke test for the content-hash dedupe behaviour.
 *
 *   tsx scripts/test-dedupe.ts
 *
 * 1. Ingest a fake document (title T1).
 * 2. Ingest the SAME content again with a DIFFERENT title → expect
 *    DuplicateContentError pointing at T1.
 * 3. Ingest with force=true → expect successful replace (T1 deleted, new one inserted).
 * 4. Cleanup.
 */
import "dotenv/config";
import { admin, SEED_USERS } from "./_lib";
import { ingestText, DuplicateContentError } from "../src/lib/ingest";

const SAMPLE_TEXT = `# Sample document for dedupe test

This text has a stable SHA-256 hash. Ingesting it twice with
different titles should trigger the duplicate-content guard.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

async function main() {
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const alice = list.users.find((u) => u.email?.toLowerCase() === SEED_USERS.A.email.toLowerCase());
  if (!alice) throw new Error("Alice not found — run npm run seed first.");

  const t1 = `__dedupe_test_${Date.now()}_first`;
  const t2 = `__dedupe_test_${Date.now()}_second`;
  const t3 = `__dedupe_test_${Date.now()}_replace`;

  let pass = 0, fail = 0;
  const check = (label: string, cond: boolean, detail = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
    cond ? pass++ : fail++;
  };

  try {
    // 1. First ingest succeeds.
    const r1 = await ingestText(a, {
      userId: alice.id,
      title: t1,
      rawText: SAMPLE_TEXT,
      sourceType: "paste",
    });
    check("first ingest succeeded", r1.chunkCount > 0, `${r1.chunkCount} chunks`);

    // 2. Second ingest with different title -> should throw.
    let dupedAgainst: string | null = null;
    try {
      await ingestText(a, {
        userId: alice.id,
        title: t2,
        rawText: SAMPLE_TEXT,
        sourceType: "paste",
      });
    } catch (err) {
      if (err instanceof DuplicateContentError) dupedAgainst = err.duplicate.title;
    }
    check(
      "second ingest of identical content throws DuplicateContentError",
      dupedAgainst === t1,
      `pointed at "${dupedAgainst}"`
    );

    // 3. Force=true replaces.
    const r3 = await ingestText(a, {
      userId: alice.id,
      title: t3,
      rawText: SAMPLE_TEXT,
      sourceType: "paste",
      force: true,
    });
    check("force=true replaced the existing doc", r3.chunkCount > 0, `new id ${r3.documentId}`);

    // 4. Confirm only one copy in the DB.
    const { data: docs } = await a
      .from("documents")
      .select("id, title")
      .eq("user_id", alice.id)
      .like("title", "__dedupe_test_%");
    check(
      "exactly one __dedupe_test_* doc remains after force-replace",
      (docs ?? []).length === 1,
      `${docs?.length} found: ${(docs ?? []).map((d) => d.title).join(", ")}`
    );

    // Cleanup.
    for (const d of docs ?? []) {
      await a.from("documents").delete().eq("id", d.id);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    fail++;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
