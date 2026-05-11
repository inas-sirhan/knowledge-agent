import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: convs, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count messages per conversation in a single query.
  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, token_usage")
    .eq("user_id", user.id);
  const counts = new Map<string, number>();
  let totalTokens = 0;
  for (const m of msgs ?? []) {
    counts.set(m.conversation_id, (counts.get(m.conversation_id) ?? 0) + 1);
    const t = (m.token_usage as { total?: number } | null)?.total ?? 0;
    totalTokens += t;
  }

  return NextResponse.json({
    conversations: (convs ?? []).map((c) => ({ ...c, message_count: counts.get(c.id) ?? 0 })),
    totalTokens,
    totalMessages: (msgs ?? []).length,
  });
}
