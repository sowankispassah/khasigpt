create extension if not exists vector;

do $$ begin
  if not exists (
    select 1
    from information_schema.tables
    where table_name = 'rag_embeddings'
  ) then
    create table rag_embeddings (
      id uuid primary key default gen_random_uuid(),
      rag_entry_id uuid unique not null,
      content text not null,
      metadata jsonb not null default '{}',
      status text not null default 'inactive',
      models text[] not null default '{}',
      embedding vector(3072) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

create or replace function match_rag_embeddings(
  query_embedding vector(3072),
  match_count int default 4,
  match_threshold double precision default 0.75,
  filter_status text default 'active',
  filter_models uuid[] default null
) returns table (
  rag_entry_id uuid,
  content text,
  metadata jsonb,
  score double precision
) language sql stable as $$
  select
    rag_entry_id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as score
  from rag_embeddings
  where (filter_status is null or status = filter_status)
    and (
      filter_models is null
      or cardinality(models) = 0
      or models && array(select id::text from unnest(filter_models) id)
    )
    and 1 - (embedding <=> query_embedding) >= match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
