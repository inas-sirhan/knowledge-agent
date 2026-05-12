import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(s: string, max = 220) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Like `truncate`, but tries to break at a word boundary when the cut would
 * land more than halfway through the limit. Used for conversation titles
 * derived from the first user message.
 */
export function smartTitle(s: string, max = 60): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > max / 2) return truncated.slice(0, lastSpace).trimEnd() + "…";
  return truncated.trimEnd() + "…";
}
