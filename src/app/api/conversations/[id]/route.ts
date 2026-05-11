import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (cErr || !conv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, citations, created_at")
    .eq("conversation_id", id)
    .order("created_at");

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
