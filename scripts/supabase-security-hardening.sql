-- Supabase security hardening baseline for project ccbkjjgfxzbqplsnlpck
--
-- What this script fixes:
-- 1) Revokes the default anon/authenticated grants on all existing public tables.
-- 2) Revokes the default anon/authenticated grants on all existing public sequences.
-- 3) Prevents future postgres-created tables/sequences/functions in public from inheriting open grants.
-- 4) Enables RLS on every existing public table.
-- 5) Hardens the custom public.match_rag_embeddings(...) function and removes anon/authenticated execute access.
--
-- What this script does NOT change:
-- - The public storage bucket "jobs-pdfs". The app currently uses public URLs for that bucket.
--   If that bucket is not intentional, make it private separately and switch the app to signed URLs.
--
-- Safe assumption used here:
-- - The app uses server-side Postgres access as the postgres role and server-only Supabase service-role access.
-- - No browser Supabase client usage was found in this repo.

begin;

-- Remove broad table and sequence privileges from client-facing roles.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- Prevent future objects created by postgres in public from inheriting open grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Turn on RLS for every application table in public.
do $$
declare
  item record;
begin
  for item in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      item.schemaname,
      item.tablename
    );
  end loop;
end
$$;

-- Harden the custom SQL function if it exists.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_rag_embeddings'
      and pg_get_function_identity_arguments(p.oid) =
        'query_embedding vector, match_count integer, match_threshold double precision, filter_status text, filter_models uuid[]'
  ) then
    execute 'alter function public.match_rag_embeddings(vector, integer, double precision, text, uuid[]) set search_path = public';
    execute 'revoke all privileges on function public.match_rag_embeddings(vector, integer, double precision, text, uuid[]) from anon, authenticated';
  end if;
end
$$;

commit;

-- Optional verification queries:
--
-- select
--   n.nspname as schema,
--   c.relname as table_name,
--   c.relrowsecurity as rls_enabled,
--   coalesce(p.policy_count, 0) as policy_count
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- left join (
--   select schemaname, tablename, count(*)::int as policy_count
--   from pg_policies
--   group by schemaname, tablename
-- ) p on p.schemaname = n.nspname and p.tablename = c.relname
-- where c.relkind = 'r'
--   and n.nspname = 'public'
-- order by c.relname;
--
-- select grantee, count(distinct table_name) as table_count
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
-- group by grantee
-- order by grantee;
