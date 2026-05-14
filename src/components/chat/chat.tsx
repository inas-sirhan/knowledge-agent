"use client";

import { useState, useRef, useEffect, useMemo, createContext, useContext } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Send, Square, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationDrawer } from "./citation-drawer";

const CitationDrawerContext = createContext<(c: ChatCitation) => void>(() => {});

export interface ChatCitation {
  n: number;
  chunk_id: string;
  document_id: string;
  title?: string;
  url?: string | null;
}

export interface KbIntroProps {
  title: string;
  blurb: string;
  prompts: string[];
}

export interface ChatProps {
  conversationId?: string;
  startingMessages?: UIMessage[];
  /** When provided, sent as `body.conversationId`. */
  onConversationCreated?: (id: string) => void;
  /** Compact mode for the embeddable widget. */
  compact?: boolean;
  /** KB intro text + starter prompts for the empty state. */
  intro?: KbIntroProps;
}

export default function Chat({
  startingMessages,
  conversationId,
  onConversationCreated,
  compact,
  intro,
}: ChatProps) {
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const [input, setInput] = useState("");
  const [activeCitation, setActiveCitation] = useState<ChatCitation | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ conversationId: convId }),
      }),
    [convId]
  );

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    transport,
    messages: startingMessages,
    onFinish: ({ message }) => {
      const meta = (message as unknown as { metadata?: { conversationId?: string } }).metadata;
      if (meta?.conversationId && meta.conversationId !== convId) {
        setConvId(meta.conversationId);
        onConversationCreated?.(meta.conversationId);
      }
      // Let the sidebar conversation list refresh.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("conversation-updated"));
      }
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const isBusy = status === "submitted" || status === "streaming";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <CitationDrawerContext.Provider value={(c) => setActiveCitation(c)}>
    <div className={cn("flex h-full flex-col", compact ? "" : "")}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState compact={compact} intro={intro} onPick={(p) => sendMessage({ text: p })} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> thinking…
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive">
                {/out[_ ]of[_ ]credits|chat credits/i.test(error.message)
                  ? "You're out of chat credits. Sign in as a demo user, or ask an admin to top you up."
                  : "Something went wrong. Try again."}
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t bg-background/80 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder="Ask anything about this knowledge base…"
            className="min-h-[44px] max-h-40 resize-none"
            rows={1}
            disabled={isBusy}
          />
          {isBusy ? (
            <Button type="button" variant="outline" size="icon" onClick={() => stop()}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setConvId(undefined);
              }}
            >
              New chat
            </Button>
          )}
        </div>
      </form>
    </div>
    <CitationDrawer
      chunkId={activeCitation?.chunk_id ?? null}
      citationNumber={activeCitation?.n}
      onClose={() => setActiveCitation(null)}
    />
    </CitationDrawerContext.Provider>
  );
}

function CitationChips({ citations }: { citations: ChatCitation[] }) {
  const openDrawer = useContext(CitationDrawerContext);
  return (
    <div className="flex max-w-[85%] flex-wrap gap-2">
      {citations.map((c) => (
        <button
          key={c.n}
          type="button"
          onClick={() => openDrawer(c)}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={`View source: ${c.title || c.chunk_id}`}
        >
          <BookOpen className="h-3 w-3" />
          <span className="font-medium text-foreground">[{c.n}]</span>
          <span className="max-w-[200px] truncate">{c.title || "source"}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  compact,
  intro,
  onPick,
}: {
  compact?: boolean;
  intro?: KbIntroProps;
  onPick: (p: string) => void;
}) {
  const title = intro?.title ?? "Ask your knowledge base";
  const blurb =
    intro?.blurb ?? "Answers are grounded in your indexed sources, with clickable citations.";
  const prompts =
    intro?.prompts ?? [
      "Summarise the most important ideas in this knowledge base.",
      "I'm new here — where should I start?",
      "Recommend three things I should read next.",
      "What's a common misconception this material clears up?",
    ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-2 pt-12 text-center">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className={cn("font-semibold tracking-tight", compact ? "text-lg" : "text-2xl")}>
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-md border bg-card px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Citations may be sent as a custom data part by the server.
  const citations: ChatCitation[] = ((): ChatCitation[] => {
    type DataCit = { type: `data-${string}`; data: ChatCitation[] };
    const part = message.parts.find(
      (p): p is DataCit => p.type === "data-citations" && Array.isArray((p as DataCit).data)
    );
    return part ? part.data : [];
  })();

  // Tool invocations (for the recommendation tool) — show a compact card per call.
  const toolCalls = message.parts.filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"));

  // The AI SDK can produce a transient "data-only" assistant message envelope when
  // we write a data part before the model starts streaming. Don't render those —
  // their data parts are also attached to the real assistant message that follows.
  if (!isUser && !text && toolCalls.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground border"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ""}</ReactMarkdown>
          </div>
        )}
      </div>

      {!isUser && toolCalls.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap gap-2">
          {toolCalls.map((t, i) => {
            const part = t as unknown as { type: string; state?: string; input?: unknown };
            const name = part.type.replace("tool-", "");
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                <BookOpen className="h-3 w-3" /> {name}
                {part.state && <span className="opacity-70">· {part.state}</span>}
              </span>
            );
          })}
        </div>
      )}

      {!isUser && citations.length > 0 && <CitationChips citations={citations} />}
    </div>
  );
}
