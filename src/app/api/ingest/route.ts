import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ingestText, fetchUrlAsText } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const PasteSchema = z.object({
  type: z.literal("paste"),
  title: z.string().min(1).max(200),
  text: z.string().min(1),
});
const UrlSchema = z.object({
  type: z.literal("url"),
  url: z.string().url(),
  title: z.string().max(200).optional(),
});
const FilePayloadSchema = z.object({
  type: z.literal("upload"),
  filename: z.string(),
  text: z.string().min(1),
});

const BodySchema = z.discriminatedUnion("type", [PasteSchema, UrlSchema, FilePayloadSchema]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "invalid body", detail: String(err) }, { status: 400 });
  }

  try {
    if (parsed.type === "paste") {
      const result = await ingestText(supabase, {
        userId: user.id,
        title: parsed.title,
        rawText: parsed.text,
        sourceType: "paste",
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (parsed.type === "upload") {
      const result = await ingestText(supabase, {
        userId: user.id,
        title: parsed.filename,
        rawText: parsed.text,
        sourceType: "upload",
      });
      return NextResponse.json({ ok: true, ...result });
    }
    // url
    const { title, text } = await fetchUrlAsText(parsed.url);
    if (!text || text.length < 100) {
      return NextResponse.json({ error: "fetched page had too little text" }, { status: 422 });
    }
    const result = await ingestText(supabase, {
      userId: user.id,
      title: parsed.title || title || parsed.url,
      rawText: text,
      sourceType: "url",
      sourceUrl: parsed.url,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("ingest error", err);
    return NextResponse.json({ error: (err as Error).message ?? "ingest failed" }, { status: 500 });
  }
}
