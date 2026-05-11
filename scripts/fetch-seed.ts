/**
 * One-time content acquisition script. Pulls fresh entries from public Atom/RSS
 * feeds and writes them as Markdown files into data/seed/<folder>/.
 *
 * Not exposed via npm — the generated .md files are committed to the repo so
 * reviewers only need `npm run seed`. Maintainers can refresh with:
 *
 *   npx tsx scripts/fetch-seed.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "../src/lib/ingest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, "..", "data", "seed");

interface Feed {
  folder: string;
  label: string;
  url: string;
  // soft cap on how many entries to keep
  max: number;
  // optional content filter — keep only entries whose title matches
  matchTitle?: RegExp;
}

const FEEDS: Feed[] = [
  // KB A — AI & the Programmer. Long-form essays from Simon Willison.
  {
    folder: "ai-and-the-programmer",
    label: "AI & the Programmer (entries)",
    url: "https://simonwillison.net/atom/entries/",
    max: 60,
  },
  {
    folder: "ai-and-the-programmer",
    label: "AI & the Programmer (notes)",
    url: "https://simonwillison.net/atom/everything/",
    max: 60,
  },
  // KB B — Muscle building, hypertrophy, diet, supplements.
  // Stronger By Science (Greg Nuckols) — science-based lifting + supplement reviews.
  // Renaissance Periodization (Mike Israetel) — programming + diet for lean gains.
  {
    folder: "muscle-building",
    label: "Stronger By Science",
    url: "https://www.strongerbyscience.com/feed/",
    max: 50,
  },
  {
    folder: "muscle-building",
    label: "Renaissance Periodization",
    url: "https://rpstrength.com/blogs/articles.atom",
    max: 50,
  },
];

interface Entry {
  title: string;
  url: string;
  published?: string;
  content: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseAtomOrRss(xml: string): Entry[] {
  // Try Atom first
  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/g);
  if (atomEntries) {
    return atomEntries
      .map((blob) => {
        const title =
          decodeEntities(unwrapCdata(blob.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "").trim());
        const link =
          blob.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ||
          blob.match(/<link[^>]*href="([^"]+)"/)?.[1] ||
          "";
        const content =
          unwrapCdata(blob.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "") ||
          unwrapCdata(blob.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || "");
        const published =
          blob.match(/<published[^>]*>([\s\S]*?)<\/published>/)?.[1] ||
          blob.match(/<updated[^>]*>([\s\S]*?)<\/updated>/)?.[1] ||
          undefined;
        return { title, url: link, published, content };
      })
      .filter((e) => e.title && e.content);
  }

  // RSS 2.0 fallback
  const rssItems = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  return rssItems
    .map((blob) => {
      const title = decodeEntities(unwrapCdata(blob.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "").trim());
      const link = unwrapCdata(blob.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || "").trim();
      const content =
        unwrapCdata(blob.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/)?.[1] || "") ||
        unwrapCdata(blob.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "");
      const published =
        blob.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1] || undefined;
      return { title, url: link, published, content };
    })
    .filter((e) => e.title && e.content);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fetchFeed(feed: Feed, seenUrls: Set<string>, fileIndex: { value: number }) {
  console.log(`\n→ Fetching ${feed.label} from ${feed.url}`);
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "KnowledgeAgent/1.0 (+seed fetcher)" },
  });
  if (!res.ok) throw new Error(`feed fetch failed (${res.status})`);
  const xml = await res.text();

  let entries = parseAtomOrRss(xml);
  if (feed.matchTitle) entries = entries.filter((e) => feed.matchTitle!.test(e.title));
  entries = entries.slice(0, feed.max);

  const outDir = path.join(SEED_DIR, feed.folder);
  await fs.mkdir(outDir, { recursive: true });

  let written = 0;
  let totalChars = 0;
  for (const e of entries) {
    if (seenUrls.has(e.url)) continue;
    const body = htmlToText(e.content).trim();
    if (body.length < 600) continue;
    seenUrls.add(e.url);

    const slug = slugify(e.title) || `entry-${fileIndex.value}`;
    const filename = `${String(fileIndex.value).padStart(3, "0")}-${slug}.md`;
    fileIndex.value++;
    const front = `# ${e.title}\n\nSource: ${e.url}${e.published ? `\nPublished: ${e.published}` : ""}\n\n`;
    await fs.writeFile(path.join(outDir, filename), front + body, "utf8");
    written++;
    totalChars += body.length;
  }
  const approxTokens = Math.round(totalChars / 4);
  console.log(`  ✓ wrote ${written} documents (~${approxTokens.toLocaleString()} tokens)`);
}

async function main() {
  // Wipe each output folder ONCE before fetching, so multiple feeds can target
  // the same folder without overwriting each other. Preserve curated docs that
  // are hand-written by us — anything prefixed with `000-` is kept.
  const folders = Array.from(new Set(FEEDS.map((f) => f.folder)));
  for (const folder of folders) {
    const dir = path.join(SEED_DIR, folder);
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (!f.endsWith(".md")) continue;
      if (f.startsWith("000-")) continue; // curated catalog
      await fs.unlink(path.join(dir, f));
    }
  }

  // Track URLs across feeds to skip duplicates within a KB.
  const seenByFolder = new Map<string, Set<string>>();
  const indexByFolder = new Map<string, { value: number }>();
  for (const folder of folders) {
    seenByFolder.set(folder, new Set());
    indexByFolder.set(folder, { value: 1 });
  }

  for (const f of FEEDS) {
    try {
      await fetchFeed(f, seenByFolder.get(f.folder)!, indexByFolder.get(f.folder)!);
    } catch (err) {
      console.error(`  ! failed: ${(err as Error).message}`);
    }
  }
  console.log("\nDone. Next: npm run seed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
