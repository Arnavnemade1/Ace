DELETE FROM public.agent_logs WHERE created_at < now() - interval '2 days';
DELETE FROM public.ai_context_snapshots WHERE created_at < now() - interval '1 day';
DELETE FROM public.news_articles WHERE created_at < now() - interval '2 days';
DELETE FROM public.market_quotes WHERE captured_at < now() - interval '1 day';
DELETE FROM public.signals WHERE created_at < now() - interval '3 days';
DELETE FROM public.replay_results WHERE created_at < now() - interval '7 days';
DELETE FROM public.regime_shifts WHERE created_at < now() - interval '7 days';
DELETE FROM public.agent_lifecycles WHERE death_time IS NOT NULL AND death_time < now() - interval '3 days';