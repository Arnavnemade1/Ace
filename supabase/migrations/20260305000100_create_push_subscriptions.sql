CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Push subscriptions are publicly readable" ON public.push_subscriptions;
CREATE POLICY "Push subscriptions are publicly readable"
  ON public.push_subscriptions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Push subscriptions are writable" ON public.push_subscriptions;
CREATE POLICY "Push subscriptions are writable"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Push subscriptions are updatable" ON public.push_subscriptions;
CREATE POLICY "Push subscriptions are updatable"
  ON public.push_subscriptions
  FOR UPDATE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON public.push_subscriptions(updated_at DESC);
