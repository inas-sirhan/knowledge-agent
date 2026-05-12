"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = React.createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{
    open: boolean;
    opts?: ConfirmOptions;
    resolve?: (v: boolean) => void;
  }>({ open: false });
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => setState({ open: true, opts, resolve }));
  }, []);

  function close(result: boolean) {
    state.resolve?.(result);
    setState({ open: false });
  }

  React.useEffect(() => {
    if (!state.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {mounted &&
        state.open &&
        state.opts &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => close(false)}
          >
            <div
              className="w-full max-w-md rounded-lg border bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-3 p-5">
                {state.opts.destructive && (
                  <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-tight">{state.opts.title}</h3>
                  {state.opts.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{state.opts.description}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">
                <Button variant="ghost" size="sm" onClick={() => close(false)}>
                  {state.opts.cancelLabel || "Cancel"}
                </Button>
                <Button
                  size="sm"
                  variant={state.opts.destructive ? "destructive" : "default"}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {state.opts.confirmLabel || "Confirm"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}
