-- ============================================================
-- 0003 — per-user credit budgets for paid-API endpoints
-- Safe to run on a live database. Idempotent.
-- ============================================================
--
-- Every endpoint that costs us money (OpenAI embeddings, OpenAI chat,
-- Cohere rerank) is credit-gated. Each user has independent balances per
-- bucket. The seed script tops up the demo users; the handle_new_user
-- trigger gives fresh signups a small starter pool so they can try the
-- app without being able to drain anyone's API bill.
-- ============================================================

create table if not exists public.user_credits (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  chat_credits   int  not null default 0,  -- new signups have no budget; only seeded demo users get credits
  ingest_credits int  not null default 0,
  updated_at     timestamptz not null default now()
);

-- Force defaults on re-runs (in case an older 0003 was applied with
-- different non-zero defaults — keeps the table definitive across deploys).
alter table public.user_credits alter column chat_credits   set default 0;
alter table public.user_credits alter column ingest_credits set default 0;

alter table public.user_credits enable row level security;

drop policy if exists "user_credits owner read" on public.user_credits;
create policy "user_credits owner read"
  on public.user_credits
  for select
  using (auth.uid() = user_id);

-- No update / insert / delete policies for users. Only the server (via the
-- security-definer function below or the service-role key) can mutate
-- credits. Users can't grant themselves more.

-- Atomically decrement a credit. Returns the post-decrement balance, or -1
-- if the user didn't have enough. Single-statement = no race condition.
create or replace function public.use_credit(
  p_user_id uuid,
  p_bucket  text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after int;
begin
  if p_bucket = 'chat' then
    update public.user_credits
    set chat_credits = chat_credits - 1, updated_at = now()
    where user_id = p_user_id and chat_credits > 0
    returning chat_credits into v_after;
  elsif p_bucket = 'ingest' then
    update public.user_credits
    set ingest_credits = ingest_credits - 1, updated_at = now()
    where user_id = p_user_id and ingest_credits > 0
    returning ingest_credits into v_after;
  else
    raise exception 'unknown credit bucket: %', p_bucket;
  end if;
  return coalesce(v_after, -1);
end;
$$;

-- Extend the signup trigger to also create a user_credits row with the
-- table defaults. The agent_config insert already lived here; we add the
-- credits insert alongside it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_config (user_id) values (new.id) on conflict do nothing;
  insert into public.user_credits (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Existing users: backfill a credits row so they don't get instant 402s.
insert into public.user_credits (user_id)
select id from auth.users
on conflict do nothing;
