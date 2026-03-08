create table if not exists public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  symbol text not null,
  price numeric,
  open numeric,
  high numeric,
  low numeric,
  prev_close numeric,
  change_percent numeric,
  volume numeric,
  as_of timestamp with time zone not null,
  captured_at timestamp with time zone not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  summary text,
  url text,
  published_at timestamp with time zone,
  symbols jsonb not null default '[]'::jsonb,
  sentiment_hint numeric,
  keywords jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (source, external_id)
);

create table if not exists public.ai_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  scope text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.market_quotes enable row level security;
alter table public.news_articles enable row level security;
alter table public.ai_context_snapshots enable row level security;

drop policy if exists "Market quotes are publicly readable" on public.market_quotes;
create policy "Market quotes are publicly readable"
on public.market_quotes for select using (true);

drop policy if exists "Service role can write market quotes" on public.market_quotes;
create policy "Service role can write market quotes"
on public.market_quotes for insert with check (true);

drop policy if exists "Service role can update market quotes" on public.market_quotes;
create policy "Service role can update market quotes"
on public.market_quotes for update using (true);

drop policy if exists "News articles are publicly readable" on public.news_articles;
create policy "News articles are publicly readable"
on public.news_articles for select using (true);

drop policy if exists "Service role can write news articles" on public.news_articles;
create policy "Service role can write news articles"
on public.news_articles for insert with check (true);

drop policy if exists "Service role can update news articles" on public.news_articles;
create policy "Service role can update news articles"
on public.news_articles for update using (true);

drop policy if exists "AI context snapshots are publicly readable" on public.ai_context_snapshots;
create policy "AI context snapshots are publicly readable"
on public.ai_context_snapshots for select using (true);

drop policy if exists "Service role can write AI context snapshots" on public.ai_context_snapshots;
create policy "Service role can write AI context snapshots"
on public.ai_context_snapshots for insert with check (true);

create index if not exists idx_market_quotes_symbol_as_of
  on public.market_quotes (symbol, as_of desc);

create index if not exists idx_market_quotes_source_as_of
  on public.market_quotes (source, as_of desc);

create index if not exists idx_news_articles_published_at
  on public.news_articles (published_at desc nulls last);

create index if not exists idx_news_articles_source_published
  on public.news_articles (source, published_at desc nulls last);

create index if not exists idx_ai_context_snapshots_agent_created
  on public.ai_context_snapshots (agent_name, created_at desc);
