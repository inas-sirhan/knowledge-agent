-- ============================================================
-- 0002 — content-hash dedupe for documents
-- Safe to run on a live database. Idempotent.
-- ============================================================

alter table public.documents add column if not exists content_hash text;

create index if not exists documents_user_hash_idx on public.documents(user_id, content_hash);
