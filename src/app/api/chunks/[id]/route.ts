import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Return a single chunk's content + its parent document metadata.
 * RLS scopes this to the caller's own chunks — no cross-user reads.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: chunk, error } = await supabase
    .from("chunks")
    .select("id, content, chunk_index, token_count, document_id, metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!chunk) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, source_type, source_url")
    .eq("id", chunk.document_id)
    .maybeSingle();

  return NextResponse.json({ chunk, document: doc });
}
