import Chat from "@/components/chat/chat";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-0px)] md:h-screen">
      <Chat />
    </div>
  );
}
