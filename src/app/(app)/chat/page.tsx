import { redirect } from "next/navigation";
import type { UIMessage } from "ai";
import Chat from "@/components/chat/chat";
import { createClient } from "@/lib/supabase/server";
import { rowToUIMessage } from "@/lib/ui-messages";
import { deriveKbIntro } from "@/lib/starter-prompts";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const { conv } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Persona drives the empty-state intro + starter prompts.
  const { data: cfg } = await supabase
    .from("agent_config")
    .select("persona")
    .eq("user_id", user.id)
    .maybeSingle();
  const intro = deriveKbIntro(cfg?.persona);

  // Optionally resume an existing conversation.
  let conversationId: string | undefined;
  let startingMessages: UIMessage[] | undefined;
  if (conv) {
    const { data: convRow } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conv)
      .maybeSingle();
    if (convRow) {
      conversationId = convRow.id;
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, citations, created_at")
        .eq("conversation_id", conv)
        .order("created_at");
      startingMessages = (msgs ?? []).map(rowToUIMessage);
    }
  }

  return (
    <div className="h-[calc(100vh-0px)] md:h-screen">
      <Chat
        // Force a fresh useChat instance when navigating between conversations.
        // Without this key, switching /chat?conv=A → /chat?conv=B keeps A's
        // messages on screen because useChat only consumes `messages` as
        // initial state on mount.
        key={conversationId ?? "__new__"}
        intro={intro}
        conversationId={conversationId}
        startingMessages={startingMessages}
      />
    </div>
  );
}
