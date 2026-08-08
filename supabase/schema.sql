-- =============================================================================
--  Scale Up — database schema
-- =============================================================================
--  What this file does
--  -------------------
--  Creates the single table the app needs (public.projects), locks it down so
--  that every user can only ever see and change their own rows, and keeps the
--  "last updated" timestamp accurate automatically.
--
--  How to run it
--  -------------
--  Supabase dashboard -> SQL Editor -> New query -> paste this whole file ->
--  Run.  See SUPABASE_SETUP.md for screenshot-level instructions.
--
--  This script is IDEMPOTENT: running it twice (or ten times) is harmless and
--  will not delete any of your data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
-- gen_random_uuid() lives in pgcrypto.  On Supabase this is already installed,
-- but we ask for it explicitly so the script also works on a bare Postgres.
create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. Table: public.projects
-- -----------------------------------------------------------------------------
-- One row per saved quantity-surveying project.
-- The JSON columns mirror the shape the browser app already uses, so a project
-- can be round-tripped without any conversion.
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),

  -- Owner of the row.  Points at Supabase's built-in auth.users table.
  -- ON DELETE CASCADE: if an account is deleted, its projects go with it.
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  name          text not null default 'Unnamed Project',

  -- Contractor / company details shown on exports
  company_name  text,
  company_email text,
  company_phone text,

  -- Drawing calibration
  scale         text,
  unit          text,
  pix_per_unit  double precision,
  file_name     text,

  -- Free-form application data (kept as JSON so the app can evolve without
  -- another migration)
  results       jsonb,
  rates         jsonb not null default '{}'::jsonb,
  manual_items  jsonb not null default '[]'::jsonb,
  export_secs   jsonb,
  audit_log     jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- Re-running safety net -------------------------------------------------
-- If the table was created by an earlier version of this script, the CREATE
-- TABLE above is skipped entirely.  These statements bring an older table up to
-- date.  They are all no-ops on a freshly created table.
alter table public.projects add column if not exists user_id       uuid;
alter table public.projects add column if not exists name          text;
alter table public.projects add column if not exists company_name  text;
alter table public.projects add column if not exists company_email text;
alter table public.projects add column if not exists company_phone text;
alter table public.projects add column if not exists scale         text;
alter table public.projects add column if not exists unit          text;
alter table public.projects add column if not exists pix_per_unit  double precision;
alter table public.projects add column if not exists file_name     text;
alter table public.projects add column if not exists results       jsonb;
alter table public.projects add column if not exists rates         jsonb;
alter table public.projects add column if not exists manual_items  jsonb;
alter table public.projects add column if not exists export_secs   jsonb;
alter table public.projects add column if not exists audit_log     jsonb;
alter table public.projects add column if not exists created_at    timestamptz;
alter table public.projects add column if not exists updated_at    timestamptz;

-- Defaults (safe to re-apply; they only affect future inserts)
alter table public.projects alter column id           set default gen_random_uuid();
alter table public.projects alter column user_id      set default auth.uid();
alter table public.projects alter column name         set default 'Unnamed Project';
alter table public.projects alter column rates        set default '{}'::jsonb;
alter table public.projects alter column manual_items set default '[]'::jsonb;
alter table public.projects alter column audit_log    set default '[]'::jsonb;
alter table public.projects alter column created_at   set default now();
alter table public.projects alter column updated_at   set default now();


-- -----------------------------------------------------------------------------
-- 2. Index
-- -----------------------------------------------------------------------------
-- The projects list is always "my projects, newest first", so this is the exact
-- index that query wants.
create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);


-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------
-- Keeps updated_at honest even if the client forgets to send it, and stops a
-- client from back-dating a row.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  -- created_at is immutable: ignore any attempt to change it.
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- 4. ROW LEVEL SECURITY  — this is the security boundary
-- =============================================================================
--  With RLS enabled and these four policies in place, the database itself
--  refuses to return or modify a row that does not belong to the signed-in
--  user.  Even if the browser code were tampered with, or someone took the
--  public anon key and made their own requests, they still cannot read anybody
--  else's projects.
--
--  auth.uid() is the ID of the currently signed-in user, taken from the request's
--  JWT.  For a signed-out visitor it is NULL, and `NULL = user_id` is never
--  true — so a signed-out visitor sees nothing at all.
-- =============================================================================

alter table public.projects enable row level security;

-- Optional but recommended: also force RLS for the table owner, so nothing
-- accidentally bypasses the policies.
alter table public.projects force row level security;

-- ---- SELECT -----------------------------------------------------------------
drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects"
  on public.projects
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ---- INSERT -----------------------------------------------------------------
-- WITH CHECK is evaluated against the NEW row: you may only create a row that
-- is stamped with your own user id.
drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---- UPDATE -----------------------------------------------------------------
-- USING      -> which existing rows you are allowed to touch.
-- WITH CHECK -> what the row is allowed to look like afterwards.
-- Both are required: without WITH CHECK a user could edit their own row and
-- hand it to somebody else by rewriting user_id.
drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- DELETE -----------------------------------------------------------------
drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects
  for delete
  to authenticated
  using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 5. Table privileges
-- -----------------------------------------------------------------------------
-- RLS decides WHICH ROWS; grants decide WHETHER THE ROLE MAY ASK AT ALL.
-- Signing in is required in this app, so the anonymous role gets nothing.
grant select, insert, update, delete on public.projects to authenticated;
revoke all on public.projects from anon;


-- =============================================================================
--  Done.  Quick self-check (optional) — paste into the SQL Editor and Run:
--
--    select policyname, cmd
--    from pg_policies
--    where schemaname = 'public' and tablename = 'projects'
--    order by cmd;
--
--  You should get exactly four rows: DELETE, INSERT, SELECT, UPDATE.
-- =============================================================================
