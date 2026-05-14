import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCredits } from "@/lib/credits";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const credits = await getCredits(supabase, user.id);
  return NextResponse.json({ credits });
}
