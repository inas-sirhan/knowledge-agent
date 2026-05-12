"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, formatDate, truncate } from "@/lib/utils";
import {
  Database,
  Settings,
  MessagesSquare,
  BarChart3,
  Plus,
  Trash2,
  FileText,
  Globe,
  ClipboardPaste,
  Upload,
  X,
} from "lucide-react";

type Tab = "sources" | "config" | "conversations" | "analytics";

interface Doc {
  id: string;
  title: string;
  source_type: "paste" | "upload" | "url";
  source_url: string | null;
  token_count: number;
  chunk_count: number;
  created_at: string;
}
interface Conv {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}
interface AgentConfig {
  persona: string;
  system_prompt: string;
  model: "gpt-4o-mini" | "gpt-4o" | "gpt-4.1-mini";
  temperature: number;
  top_k: number;
  rerank_enabled: boolean;
}

export default function AdminClient({ userEmail }: { userEmail: string }) {
  const [tab, setTab] = useState<Tab>("sources");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage <span className="font-medium text-foreground">{userEmail}</span>&apos;s knowledge base, agent
          configuration, and conversations.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 rounded-md border bg-card p-1 text-sm">
        <TabButton active={tab === "sources"} onClick={() => setTab("sources")}>
          <Database className="h-4 w-4" /> Sources
        </TabButton>
        <TabButton active={tab === "config"} onClick={() => setTab("config")}>
          <Settings className="h-4 w-4" /> Configuration
        </TabButton>
        <TabButton active={tab === "conversations"} onClick={() => setTab("conversations")}>
          <MessagesSquare className="h-4 w-4" /> Conversations
        </TabButton>
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          <BarChart3 className="h-4 w-4" /> Analytics
        </TabButton>
      </nav>

      {tab === "sources" && <SourcesTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "conversations" && <ConversationsTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Sources ---------- */
function SourcesTab() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [adding, setAdding] = useState<"paste" | "url" | "upload" | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    const res = await fetch("/api/documents");
    const j = await res.json();
    setDocs(j.documents ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string, title: string) {
    const ok = await confirm({
      title: "Delete this document?",
      description: `“${truncate(title, 60)}” and all of its indexed chunks will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document deleted");
      load();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error("Couldn't delete document", j.error || `${res.status}`);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Knowledge sources</CardTitle>
            <CardDescription>
              Anything you add here is chunked, embedded, and indexed for retrieval.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding("paste")}>
              <ClipboardPaste className="h-4 w-4" /> Paste
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding("url")}>
              <Globe className="h-4 w-4" /> URL
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding("upload")}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {adding && <AddSourceForm kind={adding} onDone={() => { setAdding(null); load(); }} onCancel={() => setAdding(null)} />}
          {docs == null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading…</div>
          ) : docs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No documents yet. Add one above to start.
            </div>
          ) : (
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <SourceIcon type={d.source_type} />
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => setOpenDocId(openDocId === d.id ? null : d.id)}
                        className="block w-full truncate text-left text-sm font-medium hover:underline"
                      >
                        {d.title}
                      </button>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {d.source_type}
                        {d.source_url && (
                          <> · <a href={d.source_url} target="_blank" rel="noreferrer" className="underline">source</a></>
                        )}
                        · {d.chunk_count} chunks · ~{d.token_count.toLocaleString()} tokens · {formatDate(d.created_at)}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => del(d.id, d.title)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {openDocId === d.id && <DocumentChunks documentId={d.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceIcon({ type }: { type: Doc["source_type"] }) {
  const cls = "mt-0.5 h-4 w-4 text-muted-foreground";
  if (type === "url") return <Globe className={cls} />;
  if (type === "upload") return <Upload className={cls} />;
  return <FileText className={cls} />;
}

function DocumentChunks({ documentId }: { documentId: string }) {
  const [chunks, setChunks] = useState<{ id: string; chunk_index: number; content: string; token_count: number }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${documentId}`).then(async (r) => {
      const j = await r.json();
      if (!cancelled) setChunks(j.chunks ?? []);
    });
    return () => { cancelled = true; };
  }, [documentId]);

  if (chunks == null) return <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Spinner /> Loading chunks…</div>;
  return (
    <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto rounded-md border bg-muted/40 p-3">
      {chunks.map((c) => (
        <div key={c.id} className="rounded border bg-background p-3 text-sm">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            chunk {c.chunk_index + 1} · ~{c.token_count} tokens
          </div>
          <div className="prose-chat text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{truncate(c.content, 1200)}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddSourceForm({ kind, onDone, onCancel }: { kind: "paste" | "url" | "upload"; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function postIngest(force: boolean): Promise<Response> {
    const qs = force ? "?force=1" : "";
    if (kind === "upload" && file) {
      const fd = new FormData();
      fd.set("file", file);
      if (title) fd.set("title", title);
      return fetch(`/api/ingest${qs}`, { method: "POST", body: fd });
    }
    const body =
      kind === "paste"
        ? { type: "paste", title, text }
        : kind === "url"
          ? { type: "url", url, title }
          : { type: "upload", filename: title, text };
    return fetch(`/api/ingest${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      let res = await postIngest(false);
      let j = await res.json();
      if (res.status === 409 && j?.error === "duplicate" && j.duplicate) {
        const ok = await confirm({
          title: "Already in your knowledge base",
          description: `Identical content was ingested earlier as “${j.duplicate.title}” on ${formatDate(j.duplicate.created_at)}. Replace it?`,
          confirmLabel: "Replace",
          destructive: true,
        });
        if (!ok) {
          toast.info("Ingest cancelled", "Existing copy left in place.");
          setBusy(false);
          return;
        }
        res = await postIngest(true);
        j = await res.json();
      }
      if (!res.ok) throw new Error(j.error || `failed (${res.status})`);
      toast.success(
        "Document ingested",
        `${j.chunkCount ?? "?"} chunks · ~${(j.tokenCount ?? 0).toLocaleString()} tokens`
      );
      onDone();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Ingest failed", (err as Error).message);
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setTitle(f.name.replace(/\.(pdf|md|markdown|txt)$/i, ""));
    // For text-ish files, pre-fill the text body so the user sees what's there.
    // For PDFs, defer parsing to the server.
    if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
      f.text().then((t) => setText(t.slice(0, 50_000)));
    } else {
      setText("");
    }
  }

  const isPdf = file && (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf"));

  return (
    <form onSubmit={submit} className="mb-4 rounded-md border bg-muted/30 p-4">
      <div className="grid gap-3">
        {kind === "url" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://example.com/post" />
          </div>
        )}
        {kind === "upload" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">File (.txt, .md, .pdf)</Label>
            <input
              id="file"
              type="file"
              accept=".txt,.md,.markdown,.pdf,text/*,application/pdf"
              onChange={onFile}
              className="text-sm"
              required
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
                {isPdf && " · PDF (parsed on the server)"}
              </p>
            )}
          </div>
        )}
        {kind !== "url" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Onboarding guide" />
          </div>
        )}
        {kind === "url" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title (optional, falls back to page &lt;title&gt;)</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
          </div>
        )}
        {kind === "paste" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text">Content</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={8}
              placeholder="Paste your content here"
            />
          </div>
        )}
        {kind === "upload" && !isPdf && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text">Content (loaded from file — edit if you like)</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={8}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <><Plus className="h-4 w-4" /> Add</>}</Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

/* ---------- Configuration ---------- */
function ConfigTab() {
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/config").then(async (r) => {
      const j = await r.json();
      setCfg(
        j.config || {
          persona: "Helpful, concise expert assistant.",
          system_prompt:
            "You answer questions strictly using the provided knowledge base context. Cite sources by their numeric reference like [1], [2].",
          model: "gpt-4o-mini",
          temperature: 0.3,
          top_k: 8,
          rerank_enabled: true,
        }
      );
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setBusy(true);
    try {
      const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      if (res.ok) {
        toast.success("Configuration saved", "Takes effect on the next message.");
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error("Couldn't save configuration", j.error || `${res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent configuration</CardTitle>
        <CardDescription>Per-account settings. Changes take effect on the next message.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="persona">Persona</Label>
            <Input id="persona" value={cfg.persona} onChange={(e) => setCfg({ ...cfg, persona: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">System prompt</Label>
            <Textarea id="prompt" rows={6} value={cfg.system_prompt} onChange={(e) => setCfg({ ...cfg, system_prompt: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value as AgentConfig["model"] })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="temp">Temperature ({cfg.temperature.toFixed(2)})</Label>
              <input
                id="temp" type="range" min={0} max={1.5} step={0.05}
                value={cfg.temperature}
                onChange={(e) => setCfg({ ...cfg, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topk">Retrieval k ({cfg.top_k})</Label>
              <input
                id="topk" type="range" min={1} max={20} step={1}
                value={cfg.top_k}
                onChange={(e) => setCfg({ ...cfg, top_k: parseInt(e.target.value, 10) })}
              />
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox" checked={cfg.rerank_enabled}
              onChange={(e) => setCfg({ ...cfg, rerank_enabled: e.target.checked })}
            />
            Enable Cohere rerank (falls back gracefully when no API key is set)
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Save changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ---------- Conversations ---------- */
function ConversationsTab() {
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [openConv, setOpenConv] = useState<Conv | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/conversations").then(async (r) => {
      const j = await r.json();
      setConvs(j.conversations ?? []);
    });
  }, []);

  async function del(conv: Conv) {
    const ok = await confirm({
      title: "Delete this conversation?",
      description: `“${truncate(conv.title, 60)}” and all of its messages will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Conversation deleted");
      setConvs((c) => (c ? c.filter((x) => x.id !== conv.id) : c));
      if (openConv?.id === conv.id) setOpenConv(null);
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error("Couldn't delete conversation", j.error || `${res.status}`);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent conversations</CardTitle>
          <CardDescription>Last 50 conversations across all sessions. Click any row to view the full thread.</CardDescription>
        </CardHeader>
        <CardContent>
          {convs == null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading…</div>
          ) : convs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No conversations yet.</div>
          ) : (
            <ul className="divide-y">
              {convs.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setOpenConv(c)} className="min-w-0 flex-1 text-left text-sm font-medium hover:underline">
                      {truncate(c.title, 90)}
                    </button>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{c.message_count} msgs · {formatDate(c.updated_at)}</span>
                    <Button variant="ghost" size="icon" onClick={() => del(c)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {openConv && <ConversationModal conv={openConv} onClose={() => setOpenConv(null)} />}
    </>
  );
}

interface Citation { n: number; chunk_id: string; document_id: string; title?: string; url?: string | null }
interface ConvMessage {
  id: string;
  role: string;
  content: string;
  citations?: Citation[];
  created_at: string;
}

function ConversationModal({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ConvMessage[] | null>(null);

  useEffect(() => {
    fetch(`/api/conversations/${conv.id}`).then(async (r) => {
      const j = await r.json();
      setMsgs(j.messages ?? []);
    });
  }, [conv.id]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-modal-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 id="conversation-modal-title" className="truncate font-semibold tracking-tight">{conv.title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {conv.message_count} messages · created {formatDate(conv.created_at)} · last updated {formatDate(conv.updated_at)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!msgs ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading…</div>
          ) : msgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
          ) : (
            <ol className="flex flex-col gap-5">
              {msgs.map((m) => {
                const cites = Array.isArray(m.citations) ? m.citations : [];
                return (
                  <li key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.role} · {formatDate(m.created_at)}
                    </div>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                          : "bg-muted text-foreground border"
                      )}
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <div className="prose-chat">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {m.role !== "user" && cites.length > 0 && (
                      <div className="flex max-w-[88%] flex-wrap gap-1.5">
                        {cites.map((c) => (
                          <a
                            key={c.n}
                            href={c.url || "#"}
                            target={c.url ? "_blank" : undefined}
                            rel={c.url ? "noopener noreferrer" : undefined}
                            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            title={c.title || c.chunk_id}
                          >
                            <span className="font-medium text-foreground">[{c.n}]</span>
                            <span className="max-w-[140px] truncate">{c.title || "source"}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Analytics ---------- */
function AnalyticsTab() {
  const [data, setData] = useState<{ documents: number; chunks: number; tokens: number; conversations: number; messages: number; totalTokens: number } | null>(null);

  useEffect(() => {
    (async () => {
      const [docsRes, convRes] = await Promise.all([fetch("/api/documents"), fetch("/api/conversations")]);
      const docs = await docsRes.json();
      const conv = await convRes.json();
      const documents = (docs.documents ?? []).length;
      const chunks = (docs.documents ?? []).reduce((acc: number, d: Doc) => acc + d.chunk_count, 0);
      const tokens = (docs.documents ?? []).reduce((acc: number, d: Doc) => acc + d.token_count, 0);
      setData({
        documents,
        chunks,
        tokens,
        conversations: (conv.conversations ?? []).length,
        messages: conv.totalMessages ?? 0,
        totalTokens: conv.totalTokens ?? 0,
      });
    })();
  }, []);

  if (!data) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading…</div>;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Stat label="Documents" value={data.documents.toLocaleString()} />
      <Stat label="Chunks" value={data.chunks.toLocaleString()} />
      <Stat label="KB tokens (approx)" value={data.tokens.toLocaleString()} />
      <Stat label="Conversations" value={data.conversations.toLocaleString()} />
      <Stat label="Messages" value={data.messages.toLocaleString()} />
      <Stat label="LLM tokens used" value={data.totalTokens.toLocaleString()} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
