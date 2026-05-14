# Knowledge Agent — RAG over your own KB

A plug-and-play, multi-user **Retrieval-Augmented Generation** chat agent built on **Next.js 15
(App Router) + Supabase (Postgres + pgvector + Auth)**, with a streaming chat widget, admin panel,
and per-account isolation.

> **Live demo**: _add Vercel URL after deploy_
> **Repo**: _add GitHub URL_

## Demo accounts

| User | Email | Password | Knowledge base |
|------|-------|----------|----------------|
| A | `alice@demo.local` | `demo-password-A!` | _Pizza Making_ — every major style (Neapolitan, NY, Detroit, Sicilian, Roman, Chicago…), dough chemistry, sauce/cheese/toppings, ovens & equipment buying, troubleshooting, canonical recipes. Hand-curated reference. |
| B | `bob@demo.local` | `demo-password-B!` | _Muscle Building_ — hypertrophy, diet for lean gains, supplements (Stronger By Science + Renaissance Periodization + a curated supplement catalog with prices, doses, time-to-effect, evidence levels) |

Switching accounts visibly changes persona, sources, and recommendations. Cross-user reads are
blocked at the database layer by Postgres RLS — see `npm run test:isolation`.

> The demo credentials are hard-coded in [scripts/_lib.ts](scripts/_lib.ts) so reviewers can
> clone, seed, and log in with no extra setup. The seed script gives each demo user
> **500 chat credits + 30 ingest credits** — far more than any review session needs. New
> signups start with **0 credits** so a randomly-signed-up account can't drain the OpenAI
> bill. Credits are enforced in production only (`NODE_ENV=production`).

---

## What's in here, mapped to the brief

Each row is annotated with where it came from: ✅ = required by the spec,
🟦 = explicitly-called-out **optional**, 🏆 = explicitly-called-out **bonus**,
✨ = extras I added beyond spec.

### Required (PDF sections 2–6)

| Capability | Where |
|---|---|
| ✅ RAG agent ingests a KB and indexes it | [src/lib/ingest.ts](src/lib/ingest.ts), [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) |
| ✅ Answers grounded in KB with **citations** (titles + clickable links) | [src/app/api/chat/route.ts](src/app/api/chat/route.ts), citation chips in [src/components/chat/chat.tsx](src/components/chat/chat.tsx) |
| ✅ Recommendations (persona-driven; documented choice below) | [scripts/_lib.ts](scripts/_lib.ts) personas + `search_kb` tool in [chat route](src/app/api/chat/route.ts) |
| ✅ Out-of-scope refusal (no hallucinations) | System-prompt guardrails in [src/lib/persona.ts](src/lib/persona.ts) |
| ✅ Embeddable chat widget | [src/app/widget/page.tsx](src/app/widget/page.tsx) — iframe `/widget` |
| ✅ Streaming responses (Vercel AI SDK) | `streamText` + `createUIMessageStream` in [chat route](src/app/api/chat/route.ts) |
| ✅ Admin: paste / URL / upload + (re)index + view chunks + configure prompt & persona | [src/components/admin/admin-client.tsx](src/components/admin/admin-client.tsx) |
| ✅ Auth (Supabase email/password) + 2 isolated demo users | [src/lib/supabase/](src/lib/supabase/) + [scripts/seed.ts](scripts/seed.ts) |
| ✅ Strict per-user isolation, **proven** by an automated test | RLS in [0001_init.sql](supabase/migrations/0001_init.sql) + [scripts/test-isolation.ts](scripts/test-isolation.ts) (6/6) |
| ✅ Plug-and-play: clone → env → install → seed → dev | See "Run it locally" below |
| ✅ Multi-turn chat with follow-up handling | full message history + `refineQuery` rewrite |
| ✅ Next.js 15 App Router + TS + Tailwind + shadcn-style UI + Supabase + pgvector + OpenAI | stack throughout |

### Optional (PDF marks as "optional")

| Capability | Where |
|---|---|
| 🟦 Streaming chat (PDF: "strongly preferred — optional") | ✅ shipped |
| 🟦 Admin: model selection, temperature, retrieval-k | Configuration tab in admin |
| 🟦 Admin: recent conversations + basic usage analytics | Conversations + Analytics tabs |

### Bonus (PDF "Bonus points (not required) for…")

| Capability | Where |
|---|---|
| 🏆 Evaluation harness with golden questions | [scripts/eval.ts](scripts/eval.ts) — `npm run eval` (10/10) |
| 🏆 Hybrid search (semantic + keyword) | `match_chunks_hybrid` SQL function in [0001_init.sql](supabase/migrations/0001_init.sql), fused with RRF |
| 🏆 Reranking | Cohere rerank in [src/lib/cohere.ts](src/lib/cohere.ts) — toggleable per-user, falls back gracefully if no key |
| 🏆 Conversation history persistence | `conversations` + `messages` tables; full thread visible in admin |

### Extras I added beyond the spec ✨

| Capability | Where |
|---|---|
| ✨ Query rewriting for follow-ups ("and what about the second one?" → standalone query) | `refineQuery` in [chat route](src/app/api/chat/route.ts) |
| ✨ `search_kb` tool the model can call mid-stream — and its results join the citation chips live | [chat route](src/app/api/chat/route.ts) |
| ✨ **PDF ingestion** via `pdf-parse` v2 (PDF spec said "files… your choice" — we picked txt/md + PDF) | [src/lib/ingest.ts](src/lib/ingest.ts) `pdfBufferToText`, multipart path in [ingest route](src/app/api/ingest/route.ts) |
| ✨ Content-hash dedupe with "replace existing?" confirm modal | [src/lib/ingest.ts](src/lib/ingest.ts) `DuplicateContentError` + UI in [admin-client.tsx](src/components/admin/admin-client.tsx) |
| ✨ Citation chips as a custom `data-citations` UI message part (typed end-to-end) | [chat route](src/app/api/chat/route.ts), [chat.tsx](src/components/chat/chat.tsx) |
| ✨ Toast notifications + custom confirm modal (no native `alert`/`confirm`) | [src/components/ui/toast.tsx](src/components/ui/toast.tsx), [confirm-dialog.tsx](src/components/ui/confirm-dialog.tsx) |
| ✨ Markdown rendering inside admin conversation modal (citations preserved) | [admin-client.tsx](src/components/admin/admin-client.tsx) `ConversationModal` |
| ✨ ARIA-correct dialogs (`role="dialog"`, `aria-modal`, `aria-labelledby`) | confirm + conversation modals + citation drawer + mobile nav |
| ✨ Top-bar nav progress indicator on route transitions | [src/components/nav-progress.tsx](src/components/nav-progress.tsx) |
| ✨ Dark mode via `prefers-color-scheme` | [src/app/globals.css](src/app/globals.css) |
| ✨ Hand-curated reference docs alongside RSS-fetched seed | `data/seed/muscle-building/000-supplement-catalog.md`, `data/seed/pizza-making/000a-style-neapolitan.md`, etc. |
| ✨ **Per-user credit budgets** (production abuse prevention) — atomic Postgres decrement, 0/0 default for signups, 500/30 for demo users | [src/lib/credits.ts](src/lib/credits.ts), [supabase/migrations/0003_credits.sql](supabase/migrations/0003_credits.sql), `npm run test:credits` |
| ✨ **Citation drawer** — click any citation chip → side panel with the cited chunk, markdown-rendered + "Open original source ↗" link | [src/components/chat/citation-drawer.tsx](src/components/chat/citation-drawer.tsx), [src/app/api/chunks/\[id\]/route.ts](src/app/api/chunks/[id]/route.ts) |
| ✨ **Conversation history sidebar** with click-to-resume | [src/components/sidebar-conversations.tsx](src/components/sidebar-conversations.tsx) + `/chat?conv=<id>` hydrated from saved messages |
| ✨ **KB-aware empty state** — persona-driven title + blurb + four KB-specific starter prompts | [src/lib/starter-prompts.ts](src/lib/starter-prompts.ts) |
| ✨ **Mobile slide-out drawer** with same content as the desktop sidebar | [src/components/mobile-nav-drawer.tsx](src/components/mobile-nav-drawer.tsx) |
| ✨ Playwright e2e suite (smoke + crawl) | [e2e/](e2e/) — `npm run test:e2e` |
| ✨ Targeted backend test scripts — RLS isolation, PDF parsing, content-hash dedupe, signup trigger, credits concurrency, paste / URL / upload paths | `npm run test:isolation`, `test:pdf`, `test:dedupe`, `test:signup`, `test:credits`, `test:ingest` |
| ✨ Loading skeletons for App Router route transitions | `loading.tsx` in each `(app)` segment |

---

## Run it locally — step by step

Total time: ~10 minutes the first time, mostly waiting on `npm install`.
You will need free accounts at **Supabase**, **OpenAI**, and optionally **Cohere**.

### 1. Clone and install

```bash
git clone https://github.com/inas-sirhan/knowledge-agent.git
cd knowledge-agent
npm install
cp .env.example .env.local
```

Leave `.env.local` open in your editor — you'll fill values into it as you go.

### 2. Create a Supabase project (free tier)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Set a project name and database password (save the password in a password manager — you won't need it for this app, only for direct DB access later)
3. Pick a region close to you (or close to Vercel if you'll deploy)
4. Wait ~2 minutes for the project to provision

Once it's ready, open **Project Settings → API Keys** (or **Data API**) and copy three values into `.env.local`:

| Settings field | `.env.local` variable |
|---|---|
| Project URL (e.g. `https://abc123.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_...`) — or legacy "anon" JWT | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_...`) — or legacy "service_role" JWT | `SUPABASE_SERVICE_ROLE_KEY` |

> Supabase shipped a new key format (`sb_publishable_*` / `sb_secret_*`) in 2025.
> The env-var names in this app still say `..._ANON_KEY` and `..._SERVICE_ROLE_KEY`
> for backwards compatibility, but the new keys work fine — same wire format.

### 3. Apply the database schema

In your Supabase dashboard, open **SQL Editor → New query** and apply both migrations:

1. Paste [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → **Run**
2. Then [supabase/migrations/0003_credits.sql](supabase/migrations/0003_credits.sql) → **Run**

You should see "Success. No rows returned." for both. If you check **Table Editor**, you'll
find six tables (`documents`, `chunks`, `conversations`, `messages`, `agent_config`,
`user_credits`) each with a 🔒 icon (Row-Level Security enabled).

> Both migrations are **idempotent** — re-running them is safe. The credits migration
> (0003) is what protects the deployed demo from runaway API spend.

### 4. Get an OpenAI API key

1. Go to [platform.openai.com](https://platform.openai.com) → **API keys** → **Create new secret key**
2. Add ~$2 of credit (covers embedding both demo KBs + extensive chat usage)
3. Paste into `.env.local`:

```
OPENAI_API_KEY=sk-proj-...
```

### 5. (Optional) Get a Cohere API key for rerank

1. Sign up at [dashboard.cohere.com](https://dashboard.cohere.com) (free)
2. Copy your trial API key
3. Paste into `.env.local`:

```
COHERE_API_KEY=...
```

Skip this and the rerank step becomes a graceful no-op — retrieval falls back to the
RRF-fused hybrid score. Slightly worse answer quality, no other impact.

### 6. Seed the demo accounts + content

```bash
npm run seed
```

This creates two users (`alice@demo.local` / `bob@demo.local`) in your Supabase project and
ingests their pre-built knowledge bases from `data/seed/`. Expect this to take ~30 seconds —
most of it is OpenAI embedding calls.

You'll see output like:

```
→ Seeding A: alice@demo.local
  · ingesting "Neapolitan pizza — the canonical style" … 5 chunks, ~2,300 tokens
  ...
  ✓ Pizza Making: 24 docs, 88 chunks, ~45,381 tokens
```

### 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click "Try demo accounts →", hit **Demo A**
or **Demo B**, click **Sign in**, and start chatting.

### 8. Verify everything works (optional sanity checks)

```bash
npm run test:isolation   # 6/6 — RLS keeps users from seeing each other's KBs
npm run eval             # 10/10 — golden questions against both KBs
```

---

### Required env vars at a glance

See [.env.example](.env.example) for the full list with placeholders. Required:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret / service-role key (**server-only**) |
| `OPENAI_API_KEY` | platform.openai.com |
| `COHERE_API_KEY` | Optional — dashboard.cohere.com |

### Bringing your own knowledge base

Drop `.md` or `.txt` files into `data/seed/<folder>/` (one per document), then re-run
`npm run seed`. Folder names map to demo users in [scripts/_lib.ts](scripts/_lib.ts).

Or, after signing in, use the **Admin → Sources** tab to paste text, fetch a URL, or upload
a `.pdf` / `.md` / `.txt` file — the same pipeline runs.

### Common setup gotchas

- **Migration error "vector type not available"** — pgvector isn't enabled. The first line of
  `0001_init.sql` does `create extension if not exists vector;`. If your Supabase plan blocks
  extensions, you'll need to enable it via the dashboard's Database → Extensions page.
- **`npm run seed` says "Missing env: NEXT_PUBLIC_SUPABASE_URL"** — your `.env.local` is empty
  or in the wrong directory. It must live at the repo root.
- **Chat answers are empty / 401** — your `OPENAI_API_KEY` is missing or has no credit.
- **`pdf-parse` fails on a specific PDF** — most likely a scanned image PDF without OCR. The
  parser only extracts embedded text.

---

## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Browser                 │        │  Vercel / Next.js 15     │
│                          │  POST  │                          │
│  useChat (AI SDK)  ─────►│  /api/chat (Route Handler)       │
│  /widget iframe          │        │                          │
│  Admin panel             │  REST  │  /api/ingest             │
│                          │ ◄──── │  /api/documents          │
└──────────────────────────┘        │  /api/conversations      │
                                    │  /api/config             │
                                    │                          │
                                    │  RAG pipeline:           │
                                    │   1. refineQuery (LLM)   │
                                    │   2. hybrid retrieval    │
                                    │      (pgvector + FTS,    │
                                    │      RRF in SQL)         │
                                    │   3. Cohere rerank       │
                                    │   4. streamText + tools  │
                                    │   5. persist messages    │
                                    └──────────┬───────────────┘
                                               │ RLS by auth.uid()
                                               ▼
                              ┌─────────────────────────────────┐
                              │  Supabase Postgres              │
                              │   - documents                   │
                              │   - chunks(embedding vector,    │
                              │            fts tsvector)        │
                              │   - conversations / messages    │
                              │   - agent_config                │
                              │   - HNSW index on embedding     │
                              │   - GIN index on fts            │
                              └─────────────────────────────────┘
```

### Key technical decisions

- **Single Next.js app, App Router, Route Handlers.** No separate Python service. Server-side
  Supabase clients via `@supabase/ssr`; auth refresh handled in `middleware.ts`.

- **Hybrid retrieval, fused in SQL.** `match_chunks_hybrid` runs the vector search and the FTS
  search in two CTEs and combines them with **Reciprocal Rank Fusion** (`1 / (k + rank)`) so we
  get one ranked list back to the app. Pure semantic similarity misses keyword-heavy queries
  ("show me posts about pgvector"); pure FTS misses paraphrases. RRF is robust to either signal
  being noisy.

- **Per-user `user_id` filter inside the RPC, on top of RLS.** Defence in depth. The function
  filters by the passed `p_user_id`, but RLS will reject any row where `auth.uid() <> user_id`
  even if the function ever forgot. The isolation test calls the RPC with the *other user's id*
  to prove this.

- **Rerank is optional.** When `COHERE_API_KEY` is set we rerank the top-20 RRF candidates down
  to the top-K. When it's missing, we fall through to the RRF order — no error, no silent
  degradation. Toggleable per-user from the admin panel.

- **Query rewriting before retrieval.** Follow-ups like "and what about the second one?" are
  resolved into a standalone query using a tiny `gpt-4o-mini` call before retrieval runs.
  Skipped on the first turn.

- **Recommendations as part of the prompt, plus a `search_kb` tool.** The system prompt
  explicitly trains the model to recommend specific sources with one-sentence rationales when
  asked "where should I start?" / "what's relevant to X?" / "what next?". A `search_kb` tool
  lets the model issue an extra retrieval mid-stream when the initial context is insufficient.

- **Citations as a custom data part.** The server writes a `data-citations` part with structured
  `{ n, chunk_id, document_id, title, url }` so the client can render clickable hover-cards,
  rather than relying on the model to format Markdown links correctly.

- **Strict per-user isolation via Postgres RLS.** Every domain table (`documents`, `chunks`,
  `conversations`, `messages`, `agent_config`) has a `for all using (auth.uid() = user_id)`
  policy. The seed script uses the service-role key explicitly and sets `user_id` on insert.
  No business logic ever uses the service-role key in user-facing routes.

- **Conversations + messages are persisted.** Each user message is stored before the model is
  called; each assistant message is stored in `onFinish` together with citations and token usage
  (powers the analytics tab).

### Trade-offs around serverless ingestion

- **Synchronous ingestion behind `/api/ingest`** with `maxDuration = 60`. Good enough for
  per-document uploads up to a few thousand chunks. For corpus-scale ingestion (10k+ chunks),
  you'd want a background worker (Inngest, Trigger.dev, or Supabase Edge Functions + a queue).
- **Embeddings are batched at 96 inputs/request** (`text-embedding-3-small` allows more, but
  this stays under most timeouts and gives clear progress).
- **Re-ingest is destructive on title collisions**: uploading a doc with the same title for the
  same user replaces the prior version + chunks. Simple, predictable, fits the admin UX.

### What the LLM sees

```
[system] Persona: <user's persona>
         <user's system prompt>
         <hard guardrails: cite [n], don't invent, decline off-topic gracefully>
         KNOWLEDGE BASE CONTEXT:
         [1 — Document Title]
         <chunk text>
         ---
         [2 — Another Document]
         <chunk text>
         ...

[user/assistant turns]
[available tool: search_kb({ query: string })]
```

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Local dev server on port 3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Create demo users + ingest their KBs |
| `npm run eval` | Run golden-question eval harness against both KBs |
| `npm run test:isolation` | Verify RLS isolation between users (six checks) |
| `npm run test:pdf <file.pdf>` | End-to-end PDF parse → chunk → embed → retrieve test |
| `npm run test:dedupe` | Smoke test for the content-hash dedupe guard |
| `npm run test:signup` | End-to-end signup test (user creation → trigger → defaults → isolation) |
| `npm run test:credits` | Credit decrement / concurrency / locked-signup test (11 checks) |
| `npm run test:ingest` | Paste / URL / text-upload pipeline test (8 checks) |
| `npm run test:e2e` | Playwright e2e suite — smoke + crawl. Requires `npm run dev` running. |
| `npm run test:e2e:build` | Same, but spins up a fresh production server first (slower but rock-solid in CI) |
| `npm run test:e2e:ui` | Playwright's interactive UI mode for debugging tests |
| `npm run db:push` | Reminder/instruction for applying the SQL migration |

---

## What I would do next with another week

- **Background ingestion** with progress streaming to the admin panel (Inngest or Supabase Edge
  Functions + a queue). Right now anything > 60s runs into Vercel function limits.
- **Per-user widget tokens** so the embeddable widget can be dropped into a third-party site
  without sharing Supabase auth cookies (signed JWT in the iframe URL, server-side validation).
- **Conversation continuation** in the chat UI — currently each visit starts a new conversation;
  a sidebar of recent conversations would close the loop with the admin "Conversations" tab.
- **Reranker A/B tracking** — log retrieval rank and final-answer relevance so we can quantify
  what Cohere rerank actually buys us per-KB.
- **DOCX ingestion** — PDF is supported via `pdf-parse` v2; adding `mammoth` for `.docx`
  files would close the last common "drop in your handbook" gap.
- **Tighter chunking** — switch from char-based approximation to a proper tokenizer
  (`tiktoken`) and try semantic chunking (group by topic boundaries instead of fixed window).

---

## Notes

- Tested on Node 22 / npm 10. Minimum Node 18.
- Vercel deployment requires the env vars above. Make sure to mark Supabase service role and
  OpenAI key as **server-only** (no `NEXT_PUBLIC_` prefix) so they're never bundled into the
  client.
- The widget at `/widget` requires an authenticated session via cookies. For embedding on a
  third-party site, see "What I would do next".
