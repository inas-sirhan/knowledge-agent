import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, MessagesSquare, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <Link href="/chat" className="mb-6 inline-flex items-center gap-2 px-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Knowledge Agent
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink href="/chat" icon={<MessagesSquare className="h-4 w-4" />}>
            Chat
          </NavLink>
          <NavLink href="/admin" icon={<Settings className="h-4 w-4" />}>
            Admin
          </NavLink>
        </nav>
        <div className="mt-auto border-t pt-3">
          <div className="px-2 text-xs text-muted-foreground">Signed in as</div>
          <div className="truncate px-2 text-sm font-medium" title={user.email || ""}>
            {user.email}
          </div>
          <form action="/auth/signout" method="post" className="mt-2">
            <button
              type="submit"
              className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Link href="/chat" className="inline-flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Knowledge Agent
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/chat" className="rounded px-2 py-1 hover:bg-accent">
              Chat
            </Link>
            <Link href="/admin" className="rounded px-2 py-1 hover:bg-accent">
              Admin
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded px-2 py-1 hover:bg-accent">
                Sign out
              </button>
            </form>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
    >
      {icon}
      {children}
    </Link>
  );
}
