import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { Sparkles, MessagesSquare, ShieldCheck, Database } from "lucide-react";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/chat");

  return (
    <main className="flex-1">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Knowledge Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
          Plug &amp; play RAG over any knowledge base
        </div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          A grounded chat agent for your own corpus.
        </h1>
        <p className="mt-4 max-w-2xl text-balance text-muted-foreground">
          Upload sources, configure the persona, drop in the embeddable widget.
          Hybrid retrieval with reranking, streaming answers with citations,
          isolated multi-user knowledge bases.
        </p>
        <div className="mt-7 flex gap-2">
          <Button asChild>
            <Link href="/signup">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Try demo accounts →</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-6 pb-24 md:grid-cols-3">
        <Feature icon={<Database className="h-5 w-5" />} title="Hybrid retrieval">
          pgvector + Postgres FTS fused with Reciprocal Rank Fusion, optionally reranked by Cohere.
        </Feature>
        <Feature icon={<MessagesSquare className="h-5 w-5" />} title="Streaming chat">
          Multi-turn conversations with tool calling, citations, and a recommendation tool.
        </Feature>
        <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Isolated by default">
          Postgres RLS keys every row to <code>auth.uid()</code>. Cross-user reads are impossible.
        </Feature>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
