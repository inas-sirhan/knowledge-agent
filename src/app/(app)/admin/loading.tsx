import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
