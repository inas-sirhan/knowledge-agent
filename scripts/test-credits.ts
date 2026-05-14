/**
 * End-to-end test for the credits system.
 *
 *   tsx scripts/test-credits.ts
 *
 * Verifies:
 *   1. The migration is applied (user_credits table + use_credit RPC exist).
 *   2. A new signup gets the default starter balance via the trigger.
 *   3. use_credit decrements the right bucket atomically.
 *   4. use_credit returns -1 (blocked) when the balance hits zero.
 *   5. Concurrent decrements don't race past zero (best-effort 10x parallel).
 *   6. The other bucket is unaffected when one bucket is drained.
 *   7. Cleanup — deletes the test user.
 *
 * Run after applying supabase/migrations/0003_credits.sql.
 */
import "dotenv/config";
import { admin } from "./_lib";

async function main() {
  const a = admin();
  const email = `__credits_test_${Date.now()}@demo.local`;
  const password = "credits-test-Password-123!";

  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
    cond ? pass++ : fail++;
  };

  console.log(`Creating test user: ${email}`);
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

  // 1. Verify the trigger created a credits row.
  const { data: initial } = await a
    .from("user_credits")
    .select("chat_credits, ingest_credits")
    .eq("user_id", userId)
    .maybeSingle();
  check("trigger created user_credits row", !!initial, JSON.stringify(initial));
  check("new signup chat_credits = 0 (locked)", initial?.chat_credits === 0, String(initial?.chat_credits));
  check("new signup ingest_credits = 0 (locked)", initial?.ingest_credits === 0, String(initial?.ingest_credits));

  // 2. Decrement at 0 should return -1 (blocked).
  const { data: blocked0 } = await a.rpc("use_credit", { p_user_id: userId, p_bucket: "chat" }).single<number>();
  check("new signup chat decrement returns -1 (blocked)", blocked0 === -1, String(blocked0));

  // 3. Top up to 5 manually for the rest of the test.
  await a.from("user_credits").update({ chat_credits: 5, ingest_credits: 3 }).eq("user_id", userId);
  const { data: topped } = await a.rpc("use_credit", { p_user_id: userId, p_bucket: "chat" }).single<number>();
  check("after top-up, first chat decrement returns 4", topped === 4, String(topped));

  // 4. Drain chat to 0.
  for (let i = 0; i < 4; i++) {
    await a.rpc("use_credit", { p_user_id: userId, p_bucket: "chat" });
  }
  const { data: chatBal } = await a
    .from("user_credits")
    .select("chat_credits")
    .eq("user_id", userId)
    .single();
  check("chat balance reaches 0 after 5 decrements from 5", chatBal?.chat_credits === 0, String(chatBal?.chat_credits));

  // 5. Further decrement returns -1.
  const { data: blocked1 } = await a.rpc("use_credit", { p_user_id: userId, p_bucket: "chat" }).single<number>();
  check("decrement at 0 returns -1 (blocked)", blocked1 === -1, String(blocked1));

  // 6. Ingest bucket is independent.
  const { data: ingestBal } = await a
    .from("user_credits")
    .select("ingest_credits")
    .eq("user_id", userId)
    .single();
  check("ingest bucket unaffected by chat drain", ingestBal?.ingest_credits === 3, String(ingestBal?.ingest_credits));

  // 7. Concurrency: fire 6 ingest decrements in parallel. Only 3 should succeed.
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      a.rpc("use_credit", { p_user_id: userId, p_bucket: "ingest" }).single<number>()
    )
  );
  const successes = results.filter((r) => (r.data ?? -1) >= 0).length;
  const blocks = results.filter((r) => (r.data ?? -1) < 0).length;
  check(
    "parallel: 3 ingest decrements succeed, 3 blocked",
    successes === 3 && blocks === 3,
    `${successes} successes, ${blocks} blocks`
  );

  const { data: finalIngest } = await a
    .from("user_credits")
    .select("ingest_credits")
    .eq("user_id", userId)
    .single();
  check(
    "ingest balance lands at exactly 0 (no double-spend)",
    finalIngest?.ingest_credits === 0,
    String(finalIngest?.ingest_credits)
  );

  // 7. Unknown bucket raises.
  const { error: badBucket } = await a.rpc("use_credit", { p_user_id: userId, p_bucket: "nope" });
  check("unknown bucket raises an error", !!badBucket, badBucket?.message);

  // Cleanup
  await a.auth.admin.deleteUser(userId);
  console.log("  ✓ cleanup: test user deleted");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("credits test crashed:", err);
  process.exit(1);
});
