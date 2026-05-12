-- =========================================================
-- RAG Knowledge Agent — schema, RLS, and search functions
-- =========================================================

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------- documents ----------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  source_type  text not null check (source_type in ('paste','upload','url')),
  source_url   text,
  raw_text     text not null,
  metadata     jsonb not null default '{}'::jsonb,
  token_count  int not null default 0,
  content_hash text,
  created_at   timestamptz not null default now()
);

-- Existing installs: add the column if upgrading from an older schema.
alter table public.documents add column if not exists content_hash text;

create index if not exists documents_user_idx      on public.documents(user_id, created_at desc);
create index if not exists documents_user_hash_idx on public.documents(user_id, content_hash);

-- ---------- chunks ----------
create table if not exists public.chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  chunk_index   int  not null,
  content       text not null,
  token_count   int  not null default 0,
  embedding     vector(1536),
  -- Lazily-maintained tsvector for full-text search
  fts           tsvector generated always as (to_tsvector('english', content)) stored,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists chunks_user_idx       on public.chunks(user_id);
create index if not exists chunks_document_idx   on public.chunks(document_id);
create index if not exists chunks_fts_idx        on public.chunks using gin(fts);
create index if not exists chunks_embedding_idx  on public.chunks using hnsw (embedding vector_cosine_ops);

-- ---------- conversations ----------
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations(user_id, updated_at desc);

-- ---------- messages ----------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system','tool')),
  content         text not null,
  citations       jsonb not null default '[]'::jsonb,
  tool_calls      jsonb not null default '[]'::jsonb,
  token_usage     jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);
create index if not exists messages_user_idx on public.messages(user_id, created_at desc);

-- ---------- per-user agent config ----------
create table if not exists public.agent_config (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  persona        text not null default 'Helpful, concise expert assistant.',
  system_prompt  text not null default
    'You answer questions strictly using the provided knowledge base context. ' ||
    'Cite sources by their numeric reference like [1], [2]. ' ||
    'If the context does not contain the answer, say so honestly and suggest a related path forward.',
  model          text not null default 'gpt-4o-mini',
  temperature    real not null default 0.3,
  top_k          int  not null default 8,
  rerank_enabled boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- =========================================================
-- Row-level security — strict per-user isolation
-- =========================================================

alter table public.documents      enable row level security;
alter table public.chunks         enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.agent_config   enable row level security;

drop policy if exists "documents owner all"     on public.documents;
drop policy if exists "chunks owner all"        on public.chunks;
drop policy if exists "conversations owner all" on public.conversations;
drop policy if exists "messages owner all"      on public.messages;
drop policy if exists "agent_config owner all"  on public.agent_config;

create policy "documents owner all"     on public.documents     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chunks owner all"        on public.chunks        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations owner all" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "messages owner all"      on public.messages      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_config owner all"  on public.agent_config  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- Hybrid retrieval: vector + FTS, combined by Reciprocal Rank Fusion
-- =========================================================

create or replace function public.match_chunks_hybrid(
  p_user_id     uuid,
  p_query_text  text,
  p_query_embed vector(1536),
  p_match_count int  default 20,
  p_rrf_k       int  default 60
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  metadata    jsonb,
  vector_rank int,
  fts_rank    int,
  rrf_score   double precision
)
language sql
stable
as $$
  with vector_hits as (
    select c.id, c.document_id, c.content, c.metadata,
           row_number() over (order by c.embedding <=> p_query_embed) as r
    from public.chunks c
    where c.user_id = p_user_id and c.embedding is not null
    order by c.embedding <=> p_query_embed
    limit p_match_count
  ),
  fts_hits as (
    select c.id, c.document_id, c.content, c.metadata,
           row_number() over (order by ts_rank_cd(c.fts, plainto_tsquery('english', p_query_text)) desc) as r
    from public.chunks c
    where c.user_id = p_user_id
      and c.fts @@ plainto_tsquery('english', p_query_text)
    limit p_match_count
  ),
  combined as (
    select coalesce(v.id, f.id)                   as id,
           coalesce(v.document_id, f.document_id) as document_id,
           coalesce(v.content, f.content)         as content,
           coalesce(v.metadata, f.metadata)       as metadata,
           v.r as vector_rank,
           f.r as fts_rank,
           coalesce(1.0 / (p_rrf_k + v.r), 0) +
           coalesce(1.0 / (p_rrf_k + f.r), 0)     as rrf_score
    from vector_hits v
    full outer join fts_hits f using (id)
  )
  select id, document_id, content, metadata, vector_rank, fts_rank, rrf_score
  from combined
  order by rrf_score desc
  limit p_match_count;
$$;

-- Auto-create empty agent_config row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_config (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
