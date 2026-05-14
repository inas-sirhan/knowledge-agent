"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, ExternalLink, BookOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";

interface ChunkDetail {
  chunk: { id: string; content: string; chunk_index: number; token_count: number };
  document: { id: string; title: string; source_type: string; source_url: string | null } | null;
}

export interface CitationDrawerProps {
  chunkId: string | null;
  citationNumber?: number;
  onClose: () => void;
}

/**
 * Side drawer that shows the actual chunk content backing a citation.
 * Opens when a user clicks a citation chip; closes on Escape, backdrop
 * click, or the close button.
 */
export function CitationDrawer({ chunkId, citationNumber, onClose }: CitationDrawerProps) {
  const [data, setData] = useState<ChunkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!chunkId) return;
    setData(null);
    setError(null);
    fetch(`/api/chunks/${chunkId}`).then(async (r) => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `Couldn't load source (${r.status})`);
        return;
      }
      const j = (await r.json()) as ChunkDetail;
      setData(j);
    });
  }, [chunkId]);

  useEffect(() => {
    if (!chunkId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunkId, onClose]);

  if (!mounted || !chunkId) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-drawer-title"
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Source {citationNumber != null ? `[${citationNumber}]` : ""}</span>
            </div>
            <h3 id="citation-drawer-title" className="mt-1 truncate font-semibold tracking-tight">
              {data?.document?.title || (error ? "Source unavailable" : "Loading…")}
            </h3>
            {data && (
              <div className="mt-1 text-xs text-muted-foreground">
                {data.document?.source_type ?? "source"} · chunk {data.chunk.chunk_index + 1} · ~{data.chunk.token_count.toLocaleString()} tokens
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close source panel"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          {!data && !error && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner /> Loading source…
            </div>
          )}
          {error && <p className="text-destructive">{error}</p>}
          {data && (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.chunk.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {data?.document?.source_url && (
          <footer className="border-t bg-muted/30 px-5 py-3">
            <a
              href={data.document.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Open original source
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              Indexed {data.document ? formatDate(new Date()) : ""} · opens in a new tab
            </p>
          </footer>
        )}
      </aside>
    </div>,
    document.body
  );
}
