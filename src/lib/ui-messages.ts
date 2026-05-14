import type { UIMessage } from "ai";

interface DbMessage {
  id: string;
  role: string;
  content: string;
  citations?: unknown;
  created_at: string;
}

/**
 * Convert a row from public.messages into the UIMessage shape that
 * `useChat` consumes as `messages` (initial state). The original citations
 * (if any) ride along as a `data-citations` part so the chip row renders
 * on a resumed conversation exactly as it did originally.
 */
export function rowToUIMessage(row: DbMessage): UIMessage {
  const text = row.content || "";
  const cites = Array.isArray(row.citations) ? (row.citations as unknown[]) : [];
  const parts: UIMessage["parts"] = [{ type: "text", text }];
  if (row.role !== "user" && cites.length > 0) {
    // Mirror the runtime shape the chat client expects.
    parts.push({ type: "data-citations", data: cites } as unknown as UIMessage["parts"][number]);
  }
  return {
    id: row.id,
    role: (row.role === "user" ? "user" : "assistant"),
    parts,
  } as UIMessage;
}
