/**
 * Smoke test for every ingestion source path the admin UI exposes:
 *   1. PASTE   — type=paste, JSON body
 *   2. URL     — type=url, fetched then chunked + embedded
 *   3. UPLOAD  — covered by test-pdf-ingest.ts (binary path)
 *
 * Tests the LIB functions directly (service-role bypasses the HTTP/auth
 * layer). The HTTP routes are thin wrappers; the crawl test already
 * confirms the form submits land. Cleans up after itself.
 */
import "dotenv/config";
import { admin, SEED_USERS } from "./_lib";
import { ingestText, fetchUrlAsText } from "../src/lib/ingest";

async function main() {
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const alice = list.users.find((u) => u.email?.toLowerCase() === SEED_USERS.A.email.toLowerCase());
  if (!alice) throw new Error("Alice not found — run npm run seed first.");

  let pass = 0, fail = 0;
  const check = (label: string, cond: boolean, detail = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
    cond ? pass++ : fail++;
  };
  const createdDocs: string[] = [];

  // -------- 1. PASTE ----------
  console.log("\n[1] paste path");
  try {
    const pasteTitle = `__paste_test_${Date.now()}`;
    const r = await ingestText(a, {
      userId: alice.id,
      title: pasteTitle,
      rawText:
        "This is a synthetic paste-ingest test document. " +
        "It contains enough text to produce at least one chunk and a meaningful embedding. ".repeat(10),
      sourceType: "paste",
    });
    createdDocs.push(r.documentId);
    check("paste ingest returned a documentId", !!r.documentId, r.documentId);
    check("paste ingest produced chunks", r.chunkCount > 0, `${r.chunkCount} chunks`);
    check("paste ingest produced tokens", r.tokenCount > 0, `${r.tokenCount} tokens`);
  } catch (err) {
    check("paste path", false, (err as Error).message);
  }

  // -------- 2. URL ----------
  console.log("\n[2] url path");
  try {
    // Use a stable, public, HTML-rich page. Wikipedia is reliable.
    const probeUrl = "https://en.wikipedia.org/wiki/Knowledge_base";
    const fetched = await fetchUrlAsText(probeUrl);
    check("fetchUrlAsText returned a title", fetched.title.length > 0, fetched.title.slice(0, 60));
    check(
      "fetchUrlAsText returned non-trivial text (>500 chars)",
      fetched.text.length > 500,
      `${fetched.text.length} chars`
    );
    check(
      "extracted text does NOT contain raw <html> tags",
      !/<\s*\/?\s*(html|body|div|p|script)\b/i.test(fetched.text),
      "html tags found"
    );

    const r = await ingestText(a, {
      userId: alice.id,
      title: `__url_test_${Date.now()}`,
      rawText: fetched.text,
      sourceType: "url",
      sourceUrl: probeUrl,
    });
    createdDocs.push(r.documentId);
    check("url ingest produced chunks", r.chunkCount > 0, `${r.chunkCount} chunks`);
  } catch (err) {
    check("url path", false, (err as Error).message);
  }

  // -------- 3. UPLOAD (text — non-PDF) ----------
  console.log("\n[3] upload path (text file)");
  try {
    const r = await ingestText(a, {
      userId: alice.id,
      title: `__upload_test_${Date.now()}`,
      rawText:
        "# Synthetic Upload Test\n\n" +
        "This simulates a `.md` or `.txt` file being uploaded via the admin form. " +
        "The route reads the file as UTF-8 and feeds the text into the same pipeline.\n\n" +
        "## Section\n\n" +
        "More content to ensure we produce multiple chunks. ".repeat(20),
      sourceType: "upload",
      metadata: { original_filename: "synthetic.md", mime: "text/markdown" },
    });
    createdDocs.push(r.documentId);
    check("upload (text) ingest produced chunks", r.chunkCount > 0, `${r.chunkCount} chunks`);
  } catch (err) {
    check("upload (text) path", false, (err as Error).message);
  }

  // -------- cleanup ----------
  console.log("\n[cleanup]");
  for (const id of createdDocs) {
    await a.from("documents").delete().eq("id", id);
  }
  console.log(`  ✓ deleted ${createdDocs.length} test documents`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("ingest-paths test crashed:", err);
  process.exit(1);
});
