"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Plus } from "lucide-react";
import { cn, truncate } from "@/lib/utils";

interface ConvRow {
  id: string;
  title: string;
  updated_at: string;
}

/**
 * Recent-conversations list rendered in the protected layout's sidebar.
 *
 * - Fetches /api/conversations on mount, on pathname change, and whenever
 *   the chat dispatches a `conversation-updated` event (after onFinish).
 * - The currently-active conversation (from ?conv=) is highlighted.
 * - "New chat" button navigates to /chat with no conv param.
 */
export default function SidebarConversations() {
  const [convs, setConvs] = useState<ConvRow[] | null>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const activeId = params.get("conv");
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations");
      if (!r.ok) return;
      const j = await r.json();
      setConvs((j.conversations ?? []).slice(0, 10));
    } catch {
      // ignore — sidebar is best-effort
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    function onUpdate() {
      refresh();
    }
    window.addEventListener("conversation-updated", onUpdate);
    return () => window.removeEventListener("conversation-updated", onUpdate);
  }, [refresh]);

  return (
    <div className="mt-4 flex flex-col gap-1 border-t pt-3 text-sm">
      <div className="flex items-center justify-between px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Recent chats</span>
        <button
          type="button"
          onClick={() => router.push("/chat")}
          title="Start a new conversation"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {convs == null ? (
        <div className="px-2 text-xs text-muted-foreground">Loading…</div>
      ) : convs.length === 0 ? (
        <div className="px-2 text-xs text-muted-foreground">No conversations yet.</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {convs.map((c) => (
            <li key={c.id}>
              <Link
                href={`/chat?conv=${c.id}`}
                className={cn(
                  "flex items-center gap-2 truncate rounded-md px-2 py-1 text-xs",
                  activeId === c.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={c.title}
              >
                <MessagesSquare className="h-3 w-3 shrink-0" />
                <span className="truncate">{truncate(c.title, 32)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
