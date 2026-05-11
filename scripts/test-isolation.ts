/**
 * Proves the RLS isolation requirement from the spec:
 *   "User A must never retrieve content from User B's KB. This will be tested."
 *
 * Strategy:
 *   1. Sign in as User A (anon client) and try to SELECT all chunks → must only return rows for A.
 *   2. Try to SELECT chunks for User B's user_id explicitly → must return zero rows.
 *   3. Try to UPDATE / DELETE one of User B's documents → must fail or affect 0 rows.
 *
 * Run after `npm run seed`.
 */
import { createClient } from "@supabase/supabase-js";
import { admin, SEED_USERS, SUPABASE_URL, ANON_KEY } from "./_lib";

async function getUserId(email: string): Promise<string> {
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Seed user ${email} not found — run npm run seed first.`);
  return user.id;
}

async function main() {
  const aId = await getUserId(SEED_USERS.A.email);
  const bId = await getUserId(SEED_USERS.B.email);

  // Sign in as A using the anon client → cookie-less JWT session.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: SEED_USERS.A.email,
    password: SEED_USERS.A.password,
  });
  if (signInErr) throw signInErr;

  let pass = 0;
  let fail = 0;
  function check(name: string, cond: boolean, detail = "") {
    const tag = cond ? "✓" : "✗";
    console.log(`  ${tag} ${name}${detail ? `  (${detail})` : ""}`);
    if (cond) pass++; else fail++;
  }

  // 1. SELECT chunks — should only return A's
  const { data: chunks } = await userClient.from("chunks").select("user_id");
  const onlyA = (chunks ?? []).every((r) => r.user_id === aId);
  check("chunks visible to A are owned by A", onlyA, `${chunks?.length ?? 0} rows`);

  // 2. SELECT chunks filtered for B → 0 rows
  const { data: leak } = await userClient.from("chunks").select("user_id").eq("user_id", bId);
  check("chunks scoped to B leak through to A", (leak ?? []).length === 0, `${leak?.length ?? 0} rows`);

  // 3. SELECT documents filtered for B → 0 rows
  const { data: leakDocs } = await userClient.from("documents").select("user_id").eq("user_id", bId);
  check("documents scoped to B leak through to A", (leakDocs ?? []).length === 0, `${leakDocs?.length ?? 0} rows`);

  // 4. SELECT messages filtered for B → 0 rows
  const { data: leakMsgs } = await userClient.from("messages").select("user_id").eq("user_id", bId);
  check("messages scoped to B leak through to A", (leakMsgs ?? []).length === 0, `${leakMsgs?.length ?? 0} rows`);

  // 5. Try to UPDATE a B-owned config row → should affect 0 rows.
  const { data: upd } = await userClient
    .from("agent_config")
    .update({ persona: "leaked" })
    .eq("user_id", bId)
    .select("user_id");
  check("agent_config of B is mutable from A", (upd ?? []).length === 0, `${upd?.length ?? 0} rows mutated`);

  // 6. Hybrid retrieval RPC must only return chunks for A even when called with B's user_id.
  // (Defence in depth — the function takes user_id as a param; if RLS lapsed we'd see B rows.)
  const { data: rpcRows } = await userClient.rpc("match_chunks_hybrid", {
    p_user_id: bId,
    p_query_text: "imposter syndrome",
    p_query_embed: new Array(1536).fill(0),
    p_match_count: 5,
  });
  check(
    "match_chunks_hybrid called with B's id returns no rows for A",
    (rpcRows ?? []).length === 0,
    `${rpcRows?.length ?? 0} rows`
  );

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Isolation test crashed:", err);
  process.exit(1);
});
