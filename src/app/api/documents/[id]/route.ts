import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, title, source_type, source_url, token_count, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (docErr || !doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: chunks } = await supabase
    .from("chunks")
    .select("id, chunk_index, content, token_count")
    .eq("document_id", id)
    .order("chunk_index");

  return NextResponse.json({ document: doc, chunks: chunks ?? [] });
}
