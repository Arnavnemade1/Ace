-- Trim ai_context_snapshots to last 500
DELETE FROM public.ai_context_snapshots
WHERE id NOT IN (
  SELECT id FROM public.ai_context_snapshots ORDER BY created_at DESC LIMIT 500
);

-- Trim live_api_streams to last 1000
DELETE FROM public.live_api_streams
WHERE id NOT IN (
  SELECT id FROM public.live_api_streams ORDER BY created_at DESC LIMIT 1000
);

-- Trim agent_logs to last 5000
DELETE FROM public.agent_logs
WHERE id NOT IN (
  SELECT id FROM public.agent_logs ORDER BY created_at DESC LIMIT 5000
);

-- Indexes for fast ordered queries
CREATE INDEX IF NOT EXISTS idx_ai_context_snapshots_created_at ON public.ai_context_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON public.agent_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_api_streams_created_at ON public.live_api_streams (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON public.news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_quotes_as_of ON public.market_quotes (as_of DESC);