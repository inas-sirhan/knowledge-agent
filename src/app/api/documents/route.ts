import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, source_type, source_url, token_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // chunk counts via a single grouped count
  const { data: chunkCounts } = await supabase
    .from("chunks")
    .select("document_id")
    .eq("user_id", user.id);
  const counts = new Map<string, number>();
  for (const c of chunkCounts ?? []) counts.set(c.document_id, (counts.get(c.document_id) ?? 0) + 1);

  return NextResponse.json({
    documents: (docs ?? []).map((d) => ({ ...d, chunk_count: counts.get(d.id) ?? 0 })),
  });
}
