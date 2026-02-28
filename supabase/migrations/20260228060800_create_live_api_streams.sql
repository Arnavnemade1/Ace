create table
  public.live_api_streams (
    id uuid not null default extensions.uuid_generate_v4 (),
    created_at timestamp with time zone not null default now(),
    source text not null,
    symbol_or_context text not null,
    payload jsonb not null,
    constraint live_api_streams_pkey primary key (id)
  );

-- Enable RLS
alter table public.live_api_streams enable row level security;

-- Policies
create policy "Allow public read access to streams" on public.live_api_streams for select using (true);
create policy "Allow service role write access to streams" on public.live_api_streams for insert with check (true);
create policy "Allow service role update access to streams" on public.live_api_streams for update using (true);

-- Indexes for fast querying
create index idx_api_streams_created_at on public.live_api_streams (created_at desc);
create index idx_api_streams_source on public.live_api_streams (source);
