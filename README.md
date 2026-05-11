# Knowledge Agent — RAG over your own KB

A plug-and-play, multi-user **Retrieval-Augmented Generation** chat agent built on **Next.js 15
(App Router) + Supabase (Postgres + pgvector + Auth)**, with a streaming chat widget, admin panel,
and per-account isolation.

> **Live demo**: _add Vercel URL after deploy_
> **Repo**: _add GitHub URL_

## Demo accounts

| User | Email | Password | Knowledge base |
|------|-------|----------|----------------|
| A | `alice@demo.local` | `demo-password-A!` | _AI & the Programmer_ — essays on how AI tools change the craft of programming |
| B | `bob@demo.local` | `demo-password-B!` | _Developer Mind_ — imposter syndrome, burnout, and identity for software engineers |

Switching accounts visibly changes persona, sources, and recommendations. Cross-user reads are
blocked at the database layer by Postgres RLS — see `npm run test:isolation`.

> Credentials are configurable via `SEED_USER_*` env vars (see `.env.example`).

---

## What's in here

| Capability | Where |
|---|---|
| Streaming chat with citations | [src/components/chat/chat.tsx](src/components/chat/chat.tsx), [src/app/api/chat/route.ts](src/app/api/chat/route.ts) |
| Hybrid retrieval (pgvector + FTS, RRF-fused) | [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → `match_chunks_hybrid` |
| Cohere rerank (optional, falls back gracefully) | [src/lib/cohere.ts](src/lib/cohere.ts) |
| Query rewriting for follow-ups | `refineQuery` in [src/app/api/chat/route.ts](src/app/api/chat/route.ts) |
| `search_kb` tool the model can call mid-stream | [src/app/api/chat/route.ts](src/app/api/chat/route.ts) |
| Admin: sources, chunks, config, conversations, analytics | [src/components/admin/admin-client.tsx](src/components/admin/admin-client.tsx) |
| Ingestion (paste / upload / URL) | [src/lib/ingest.ts](src/lib/ingest.ts), [src/app/api/ingest/route.ts](src/app/api/ingest/route.ts) |
| Embeddable widget | [src/app/widget/page.tsx](src/app/widget/page.tsx) — iframe `/widget` from any host page |
| Per-user isolation (RLS) | All policies in [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) |
| Isolation proof | [scripts/test-isolation.ts](scripts/test-isolation.ts) — `npm run test:isolation` |
| Eval harness (golden questions) | [scripts/eval.ts](scripts/eval.ts) — `npm run eval` |
| Seed script | [scripts/seed.ts](scripts/seed.ts) — `npm run seed` |

---

## Setup (local, ~5 minutes)

```bash
git clone <this-repo>
cd ai-agent
cp .env.example .env.local        # then fill in the values
npm install
# Apply the schema (option 1: Supabase CLI)
#   supabase db push
# (option 2: open Supabase dashboard → SQL editor → paste supabase/migrations/0001_init.sql)
npm run seed                       # creates demo users + ingests their KBs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with one of the demo accounts.

### Required env vars

See [.env.example](.env.example). The minimum to boot the app:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from
  Supabase project → Settings → API.
- `OPENAI_API_KEY` — used for both embeddings (`text-embedding-3-small`) and chat (`gpt-4o-mini`
  by default).
- `COHERE_API_KEY` — optional. When unset, rerank is a no-op and we fall back to the RRF-fused
  hybrid score.

### Seed knowledge bases

`npm run seed` reads `data/seed/<folder>/*.md` and ingests one document per file for each demo
user. To swap in different content for either KB, drop new `.md` files into the matching folder
(see [data/seed/README.md](data/seed/README.md)) and re-run `npm run seed`.

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
- **PDF + DOCX ingestion** — current upload supports plain text and Markdown; a server-side
  parser would unlock the most common "drop in your handbook" use case.
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
