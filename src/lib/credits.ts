import type { SupabaseClient } from "@supabase/supabase-js";

export type CreditBucket = "chat" | "ingest";

export interface CreditResult {
  allowed: boolean;
  /** Remaining balance AFTER this attempt (or the pre-attempt value if blocked). */
  remaining: number;
}

/**
 * Atomically charge one credit from the user's bucket. The Postgres function
 * `use_credit` does the decrement in a single statement so concurrent requests
 * can't race past a zero balance.
 *
 * Only enforced in production (`NODE_ENV === 'production'`). In dev the
 * check is a no-op so local iteration isn't slowed by accidental drain.
 *
 * Returns `{ allowed: false, remaining: 0 }` when the user is out of credits
 * for that bucket.
 */
export async function consumeCredit(
  supabase: SupabaseClient,
  userId: string,
  bucket: CreditBucket
): Promise<CreditResult> {
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  const { data, error } = await supabase
    .rpc("use_credit", { p_user_id: userId, p_bucket: bucket })
    .single<number>();

  // If the RPC isn't deployed yet (stale schema), fail open and log so the
  // app remains usable. Production should monitor these warnings.
  if (error || data == null) {
    console.warn(`use_credit failed for ${bucket}:`, error?.message);
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }
  if (data < 0) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: data };
}

export function outOfCreditsBody(bucket: CreditBucket) {
  return {
    error: "out_of_credits",
    bucket,
    message:
      bucket === "chat"
        ? "You don't have any chat credits on this account. The two seeded demo accounts have a generous budget — sign in as alice@demo.local or bob@demo.local to try the app."
        : "You don't have any ingest credits on this account. The two seeded demo accounts have a generous budget — sign in as alice@demo.local or bob@demo.local to try uploads.",
  };
}

/** Read the current balance for both buckets (or null if the row is missing). */
export async function getCredits(
  supabase: SupabaseClient,
  userId: string
): Promise<{ chat: number; ingest: number } | null> {
  const { data } = await supabase
    .from("user_credits")
    .select("chat_credits, ingest_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { chat: data.chat_credits, ingest: data.ingest_credits };
}
