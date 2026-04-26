create table if not exists public.fins_watchlists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  schedule_config jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.fins_watchlist_companies (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.fins_watchlists(id) on delete cascade,
  ticker text not null,
  company_name text,
  cik text,
  exchange text,
  sector text,
  priority_tier smallint not null default 2 check (priority_tier between 1 and 5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (watchlist_id, ticker)
);

create table if not exists public.fins_disclosure_events (
  id uuid primary key default gen_random_uuid(),
  watchlist_company_id uuid not null references public.fins_watchlist_companies(id) on delete cascade,
  ticker text not null,
  filing_type text not null,
  source_type text not null,
  source_name text not null,
  source_document_id text not null,
  source_url text,
  raw_artifact_uri text,
  content_hash text,
  event_timestamp timestamp with time zone not null,
  period_end date,
  title text,
  status text not null default 'detected' check (status in ('detected', 'ingesting', 'normalized', 'analyzed', 'failed')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (ticker, source_type, source_document_id)
);

create table if not exists public.fins_section_summaries (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  section_key text not null,
  section_type text not null,
  title text,
  summary text not null,
  importance numeric(5,4) check (importance is null or (importance >= 0 and importance <= 1)),
  evidence_snippets jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (disclosure_event_id, section_key)
);

create table if not exists public.fins_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid references public.fins_disclosure_events(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  scheduled_for timestamp with time zone not null default now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.fins_agent_runs (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  agent_name text not null,
  agent_version text,
  model_name text,
  prompt_version text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.fins_agent_signals (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  agent_run_id uuid references public.fins_agent_runs(id) on delete set null,
  agent_name text not null,
  directional_sentiment text not null check (directional_sentiment in ('positive', 'neutral', 'negative')),
  risk_adjustment text not null check (risk_adjustment in ('increase', 'decrease', 'stable')),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  signal_summary text,
  signal_payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.fins_signal_evidence (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  agent_signal_id uuid references public.fins_agent_signals(id) on delete cascade,
  fused_signal_id uuid,
  section_key text,
  snippet text not null,
  source_pointer jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.fins_fused_signals (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null unique references public.fins_disclosure_events(id) on delete cascade,
  ticker text not null,
  directional_sentiment text not null check (directional_sentiment in ('positive', 'neutral', 'negative')),
  risk_adjustment text not null check (risk_adjustment in ('increase', 'decrease', 'stable')),
  conviction_impact numeric(10,4),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  causal_summary text,
  comparative_context jsonb not null default '{}'::jsonb,
  signal_payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.fins_signal_evidence
  drop constraint if exists fins_signal_evidence_fused_signal_id_fkey;

alter table public.fins_signal_evidence
  add constraint fins_signal_evidence_fused_signal_id_fkey
  foreign key (fused_signal_id)
  references public.fins_fused_signals(id)
  on delete cascade;

create table if not exists public.fins_decision_records (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  fused_signal_id uuid references public.fins_fused_signals(id) on delete set null,
  ticker text not null,
  action text not null check (action in ('increase_exposure', 'reduce_exposure', 'exit_position', 'hold')),
  magnitude numeric(10,4) not null default 0,
  conviction_before numeric(10,4),
  conviction_after numeric(10,4),
  causal_explanation jsonb not null default '{}'::jsonb,
  policy_name text,
  policy_version text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.fins_alerts (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid not null references public.fins_disclosure_events(id) on delete cascade,
  fused_signal_id uuid references public.fins_fused_signals(id) on delete set null,
  ticker text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  alert_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.fins_watchlists enable row level security;
alter table public.fins_watchlist_companies enable row level security;
alter table public.fins_disclosure_events enable row level security;
alter table public.fins_section_summaries enable row level security;
alter table public.fins_ingestion_jobs enable row level security;
alter table public.fins_agent_runs enable row level security;
alter table public.fins_agent_signals enable row level security;
alter table public.fins_signal_evidence enable row level security;
alter table public.fins_fused_signals enable row level security;
alter table public.fins_decision_records enable row level security;
alter table public.fins_alerts enable row level security;

drop policy if exists "FINS watchlists are publicly readable" on public.fins_watchlists;
create policy "FINS watchlists are publicly readable"
on public.fins_watchlists for select using (true);

drop policy if exists "FINS watchlist companies are publicly readable" on public.fins_watchlist_companies;
create policy "FINS watchlist companies are publicly readable"
on public.fins_watchlist_companies for select using (true);

drop policy if exists "FINS disclosure events are publicly readable" on public.fins_disclosure_events;
create policy "FINS disclosure events are publicly readable"
on public.fins_disclosure_events for select using (true);

drop policy if exists "FINS section summaries are publicly readable" on public.fins_section_summaries;
create policy "FINS section summaries are publicly readable"
on public.fins_section_summaries for select using (true);

drop policy if exists "FINS ingestion jobs are publicly readable" on public.fins_ingestion_jobs;
create policy "FINS ingestion jobs are publicly readable"
on public.fins_ingestion_jobs for select using (true);

drop policy if exists "FINS agent runs are publicly readable" on public.fins_agent_runs;
create policy "FINS agent runs are publicly readable"
on public.fins_agent_runs for select using (true);

drop policy if exists "FINS agent signals are publicly readable" on public.fins_agent_signals;
create policy "FINS agent signals are publicly readable"
on public.fins_agent_signals for select using (true);

drop policy if exists "FINS signal evidence are publicly readable" on public.fins_signal_evidence;
create policy "FINS signal evidence are publicly readable"
on public.fins_signal_evidence for select using (true);

drop policy if exists "FINS fused signals are publicly readable" on public.fins_fused_signals;
create policy "FINS fused signals are publicly readable"
on public.fins_fused_signals for select using (true);

drop policy if exists "FINS decision records are publicly readable" on public.fins_decision_records;
create policy "FINS decision records are publicly readable"
on public.fins_decision_records for select using (true);

drop policy if exists "FINS alerts are publicly readable" on public.fins_alerts;
create policy "FINS alerts are publicly readable"
on public.fins_alerts for select using (true);

drop policy if exists "Service role can write FINS watchlists" on public.fins_watchlists;
create policy "Service role can write FINS watchlists"
on public.fins_watchlists for insert with check (true);

drop policy if exists "Service role can update FINS watchlists" on public.fins_watchlists;
create policy "Service role can update FINS watchlists"
on public.fins_watchlists for update using (true);

drop policy if exists "Service role can write FINS watchlist companies" on public.fins_watchlist_companies;
create policy "Service role can write FINS watchlist companies"
on public.fins_watchlist_companies for insert with check (true);

drop policy if exists "Service role can update FINS watchlist companies" on public.fins_watchlist_companies;
create policy "Service role can update FINS watchlist companies"
on public.fins_watchlist_companies for update using (true);

drop policy if exists "Service role can write FINS disclosure events" on public.fins_disclosure_events;
create policy "Service role can write FINS disclosure events"
on public.fins_disclosure_events for insert with check (true);

drop policy if exists "Service role can update FINS disclosure events" on public.fins_disclosure_events;
create policy "Service role can update FINS disclosure events"
on public.fins_disclosure_events for update using (true);

drop policy if exists "Service role can write FINS section summaries" on public.fins_section_summaries;
create policy "Service role can write FINS section summaries"
on public.fins_section_summaries for insert with check (true);

drop policy if exists "Service role can update FINS section summaries" on public.fins_section_summaries;
create policy "Service role can update FINS section summaries"
on public.fins_section_summaries for update using (true);

drop policy if exists "Service role can write FINS ingestion jobs" on public.fins_ingestion_jobs;
create policy "Service role can write FINS ingestion jobs"
on public.fins_ingestion_jobs for insert with check (true);

drop policy if exists "Service role can update FINS ingestion jobs" on public.fins_ingestion_jobs;
create policy "Service role can update FINS ingestion jobs"
on public.fins_ingestion_jobs for update using (true);

drop policy if exists "Service role can write FINS agent runs" on public.fins_agent_runs;
create policy "Service role can write FINS agent runs"
on public.fins_agent_runs for insert with check (true);

drop policy if exists "Service role can update FINS agent runs" on public.fins_agent_runs;
create policy "Service role can update FINS agent runs"
on public.fins_agent_runs for update using (true);

drop policy if exists "Service role can write FINS agent signals" on public.fins_agent_signals;
create policy "Service role can write FINS agent signals"
on public.fins_agent_signals for insert with check (true);

drop policy if exists "Service role can update FINS agent signals" on public.fins_agent_signals;
create policy "Service role can update FINS agent signals"
on public.fins_agent_signals for update using (true);

drop policy if exists "Service role can write FINS signal evidence" on public.fins_signal_evidence;
create policy "Service role can write FINS signal evidence"
on public.fins_signal_evidence for insert with check (true);

drop policy if exists "Service role can update FINS signal evidence" on public.fins_signal_evidence;
create policy "Service role can update FINS signal evidence"
on public.fins_signal_evidence for update using (true);

drop policy if exists "Service role can write FINS fused signals" on public.fins_fused_signals;
create policy "Service role can write FINS fused signals"
on public.fins_fused_signals for insert with check (true);

drop policy if exists "Service role can update FINS fused signals" on public.fins_fused_signals;
create policy "Service role can update FINS fused signals"
on public.fins_fused_signals for update using (true);

drop policy if exists "Service role can write FINS decision records" on public.fins_decision_records;
create policy "Service role can write FINS decision records"
on public.fins_decision_records for insert with check (true);

drop policy if exists "Service role can update FINS decision records" on public.fins_decision_records;
create policy "Service role can update FINS decision records"
on public.fins_decision_records for update using (true);

drop policy if exists "Service role can write FINS alerts" on public.fins_alerts;
create policy "Service role can write FINS alerts"
on public.fins_alerts for insert with check (true);

drop policy if exists "Service role can update FINS alerts" on public.fins_alerts;
create policy "Service role can update FINS alerts"
on public.fins_alerts for update using (true);

create index if not exists idx_fins_watchlist_companies_watchlist_ticker
  on public.fins_watchlist_companies (watchlist_id, ticker);

create index if not exists idx_fins_disclosure_events_ticker_event_timestamp
  on public.fins_disclosure_events (ticker, event_timestamp desc);

create index if not exists idx_fins_disclosure_events_status_created
  on public.fins_disclosure_events (status, created_at desc);

create index if not exists idx_fins_section_summaries_event_type
  on public.fins_section_summaries (disclosure_event_id, section_type);

create index if not exists idx_fins_ingestion_jobs_status_scheduled
  on public.fins_ingestion_jobs (status, scheduled_for);

create index if not exists idx_fins_agent_runs_event_agent
  on public.fins_agent_runs (disclosure_event_id, agent_name, created_at desc);

create index if not exists idx_fins_agent_signals_event_agent
  on public.fins_agent_signals (disclosure_event_id, agent_name, created_at desc);

create index if not exists idx_fins_fused_signals_ticker_created
  on public.fins_fused_signals (ticker, created_at desc);

create index if not exists idx_fins_decision_records_ticker_created
  on public.fins_decision_records (ticker, created_at desc);

create index if not exists idx_fins_alerts_ticker_created
  on public.fins_alerts (ticker, created_at desc);
