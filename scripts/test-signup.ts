/**
 * Verifies the signup flow end-to-end:
 *  1. Calls supabase.auth.admin.createUser (mirrors what the signup form does
 *     after the user confirms the email — bypasses the email step so the test
 *     is deterministic).
 *  2. Confirms the `handle_new_user` trigger fired and an agent_config row
 *     exists with the seeded defaults.
 *  3. Confirms the user can sign in.
 *  4. Confirms the user starts with ZERO documents (clean slate, no leak).
 *  5. Cleanup — deletes the test user.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, ANON_KEY } from "./_lib";

async function main() {
  const a = admin();
  const email = `__signup_test_${Date.now()}@demo.local`;
  const password = "signup-test-Password-123!";

  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
    cond ? pass++ : fail++;
  };

  console.log(`Creating test user: ${email}`);
  const { data: created, error: createErr } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation step
  });
  if (createErr || !created.user) {
    console.error("createUser failed:", createErr);
    process.exit(1);
  }
  const newUserId = created.user.id;
  check("user created", !!newUserId, newUserId);

  // 1. agent_config trigger
  const { data: cfgRow } = await a
    .from("agent_config")
    .select("user_id, persona, system_prompt, model, top_k, rerank_enabled")
    .eq("user_id", newUserId)
    .maybeSingle();
  check("handle_new_user trigger created agent_config", !!cfgRow);
  check("agent_config has default model", cfgRow?.model === "gpt-4o-mini", cfgRow?.model);
  check("agent_config has default top_k=8", cfgRow?.top_k === 8, String(cfgRow?.top_k));
  check("agent_config rerank enabled by default", cfgRow?.rerank_enabled === true);

  // 2. Sign in
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
  check("new user can sign in", !signInErr, signInErr?.message);

  // 3. Clean slate — no docs
  const { data: docs } = await userClient.from("documents").select("id");
  check("new user starts with zero documents", (docs ?? []).length === 0, `${docs?.length}`);

  // 4. Isolation — new user can't see Alice's docs
  const { data: alice } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const aliceId = alice.users.find((u) => u.email?.toLowerCase() === "alice@demo.local")?.id;
  if (aliceId) {
    const { data: leak } = await userClient.from("documents").select("id").eq("user_id", aliceId);
    check("new user cannot see Alice's documents", (leak ?? []).length === 0, `${leak?.length}`);
  }

  // Cleanup
  await a.auth.admin.deleteUser(newUserId);
  console.log("  ✓ cleanup: test user deleted");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("signup test crashed:", err);
  process.exit(1);
});
