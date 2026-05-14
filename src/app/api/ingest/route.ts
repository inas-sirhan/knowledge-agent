import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ingestText, fetchUrlAsText, pdfBufferToText, DuplicateContentError } from "@/lib/ingest";
import { consumeCredit, outOfCreditsBody } from "@/lib/credits";

function duplicateResponse(err: DuplicateContentError) {
  return NextResponse.json(
    {
      error: "duplicate",
      message: err.message,
      duplicate: err.duplicate,
    },
    { status: 409 }
  );
}

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

const JsonBodySchema = z.discriminatedUnion("type", [PasteSchema, UrlSchema, FilePayloadSchema]);

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Charge a credit BEFORE running the embedding pipeline. One credit per
  // ingestion regardless of how big the document is — keeps the model simple.
  const credit = await consumeCredit(supabase, user.id, "ingest");
  if (!credit.allowed) {
    return NextResponse.json(outOfCreditsBody("ingest"), { status: 402 });
  }

  const contentType = req.headers.get("content-type") || "";

  const force = new URL(req.url).searchParams.get("force") === "1";

  // --- multipart/form-data: PDF or arbitrary file upload ---
  if (contentType.startsWith("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      const overrideTitle = (form.get("title") as string | null) || "";
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "no file" }, { status: 400 });
      }
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: "file too large (max 15 MB)" }, { status: 413 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      let title = overrideTitle || file.name;
      let text: string;
      const metadata: Record<string, unknown> = { original_filename: file.name, mime: file.type };

      if (isPdf) {
        const parsed = await pdfBufferToText(buffer);
        if (!parsed.text || parsed.text.length < 50) {
          return NextResponse.json(
            { error: "PDF parsed to too little text — is it a scanned image without OCR?" },
            { status: 422 }
          );
        }
        text = parsed.text;
        if (parsed.title && !overrideTitle) title = parsed.title;
        metadata.pages = parsed.pages;
      } else {
        // Treat anything non-PDF as UTF-8 text (.md, .txt, .markdown).
        text = buffer.toString("utf8").trim();
        if (!text) {
          return NextResponse.json({ error: "file is empty" }, { status: 422 });
        }
      }

      const result = await ingestText(supabase, {
        userId: user.id,
        title: title.replace(/\.(pdf|txt|md|markdown)$/i, "").trim() || file.name,
        rawText: text,
        sourceType: "upload",
        metadata,
        force,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof DuplicateContentError) return duplicateResponse(err);
      console.error("ingest (multipart) error", err);
      return NextResponse.json(
        { error: (err as Error).message ?? "ingest failed" },
        { status: 500 }
      );
    }
  }

  // --- application/json: paste / url / preflattened upload (legacy) ---
  let parsed;
  try {
    parsed = JsonBodySchema.parse(await req.json());
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
        force,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (parsed.type === "upload") {
      const result = await ingestText(supabase, {
        userId: user.id,
        title: parsed.filename,
        rawText: parsed.text,
        sourceType: "upload",
        force,
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
      force,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DuplicateContentError) return duplicateResponse(err);
    console.error("ingest error", err);
    return NextResponse.json({ error: (err as Error).message ?? "ingest failed" }, { status: 500 });
  }
}
