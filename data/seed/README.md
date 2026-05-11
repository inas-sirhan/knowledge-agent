# Seed knowledge bases

Each subfolder is one demo user's KB. Drop `.md` or `.txt` files here and run `npm run seed` to ingest them.

- `ai-and-the-programmer/` → User A (alice@demo.local). Theme: AI tools, LLM-assisted development, model evals. Sourced from Simon Willison's blog atom feed.
- `muscle-building/` → User B (bob@demo.local). Theme: hypertrophy, lean-bulk diet, evidence-based supplements. Sourced from Stronger By Science + Renaissance Periodization atom feeds, plus a curated supplement catalog (`000-supplement-catalog.md`) with doses, monthly cost, expected time-to-effect, and evidence levels.

## File format

- Plain Markdown or text.
- The first `# Heading` becomes the document title (otherwise the filename is used).
- One file = one document.
- Aim for ≥20 docs or ≥50k tokens per KB (per the assignment spec).

## Refreshing the fetched content

The atom-feed content is committed as `.md` files so reviewers only need
`npm run seed`. To refresh from the live feeds:

```bash
npx tsx scripts/fetch-seed.ts
npm run seed
```

`fetch-seed` preserves any file prefixed with `000-` (curated content),
overwrites the rest. Add a new feed by editing the `FEEDS` array at the top
of [scripts/fetch-seed.ts](../../scripts/fetch-seed.ts).
