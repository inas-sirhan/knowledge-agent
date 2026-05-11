import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Chat from "@/components/chat/chat";

export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/widget");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Knowledge Assistant</span>
        <span>Embedded chat</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <Chat compact />
      </div>
    </div>
  );
}
