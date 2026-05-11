import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_config")
    .select("persona, system_prompt, model, temperature, top_k, rerank_enabled, updated_at")
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ config: data });
}

const PutSchema = z.object({
  persona: z.string().min(1).max(500),
  system_prompt: z.string().min(1).max(8000),
  model: z.enum(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]),
  temperature: z.number().min(0).max(1.5),
  top_k: z.number().int().min(1).max(20),
  rerank_enabled: z.boolean(),
});

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = PutSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid body", detail: String(err) }, { status: 400 });
  }

  const { error } = await supabase
    .from("agent_config")
    .upsert({ user_id: user.id, ...body, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
