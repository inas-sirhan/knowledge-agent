"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Sparkles, MessagesSquare, Settings, LogOut, Menu, X } from "lucide-react";
import SidebarConversations from "@/components/sidebar-conversations";

/**
 * Mobile-only slide-out drawer with the same content as the desktop sidebar:
 *   - app branding
 *   - Chat / Admin nav links
 *   - recent conversations (re-uses the desktop component)
 *   - signed-in user + sign-out
 *
 * Triggered by a hamburger button rendered in the mobile top bar. Closes on
 * backdrop click, Escape, or after clicking any nav link.
 */
export default function MobileNavDrawer({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Close the drawer whenever the route changes (covers any link click).
  useEffect(() => {
    if (open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <aside
              className="flex h-full w-72 max-w-[85vw] flex-col border-r bg-card p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <Link
                  href="/chat"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 px-2 font-semibold"
                >
                  <Sparkles className="h-5 w-5 text-primary" />
                  Knowledge Agent
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="mt-6 flex flex-col gap-1 text-sm">
                <Link
                  href="/chat"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
                >
                  <MessagesSquare className="h-4 w-4" />
                  Chat
                </Link>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
                >
                  <Settings className="h-4 w-4" />
                  Admin
                </Link>
              </nav>

              <div className="flex-1 overflow-y-auto">
                <Suspense fallback={null}>
                  <SidebarConversations />
                </Suspense>
              </div>

              <div className="border-t pt-3">
                <div className="px-2 text-xs text-muted-foreground">Signed in as</div>
                <div className="truncate px-2 text-sm font-medium" title={userEmail}>
                  {userEmail}
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
          </div>,
          document.body
        )}
    </>
  );
}
