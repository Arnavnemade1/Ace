
-- Portfolio state table
CREATE TABLE public.portfolio_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total_value NUMERIC NOT NULL DEFAULT 100000,
  cash NUMERIC NOT NULL DEFAULT 100000,
  positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_pnl NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  sharpe_ratio NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Portfolio state is publicly readable" ON public.portfolio_state FOR SELECT USING (true);

-- Trades table
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total_value NUMERIC NOT NULL,
  pnl NUMERIC,
  agent TEXT NOT NULL,
  strategy TEXT,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'executed' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  alpaca_order_id TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trades are publicly readable" ON public.trades FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert trades" ON public.trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Edge functions can update trades" ON public.trades FOR UPDATE USING (true);

-- Signals table
CREATE TABLE public.signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  strength NUMERIC NOT NULL DEFAULT 0,
  source_agent TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  acted_on BOOLEAN DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signals are publicly readable" ON public.signals FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert signals" ON public.signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Edge functions can update signals" ON public.signals FOR UPDATE USING (true);

-- Agent logs table
CREATE TABLE public.agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'info' CHECK (log_type IN ('info', 'decision', 'error', 'learning', 'trade')),
  message TEXT NOT NULL,
  reasoning TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agent logs are publicly readable" ON public.agent_logs FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert agent logs" ON public.agent_logs FOR INSERT WITH CHECK (true);

-- Agent state table (tracks each agent's current status and metrics)
CREATE TABLE public.agent_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('active', 'idle', 'learning', 'error')),
  metric_value TEXT,
  metric_label TEXT,
  last_action TEXT,
  last_action_at TIMESTAMP WITH TIME ZONE,
  config JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agent state is publicly readable" ON public.agent_state FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert agent state" ON public.agent_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Edge functions can update agent state" ON public.agent_state FOR UPDATE USING (true);

-- Replay results table (for Causal Replay Arena)
CREATE TABLE public.replay_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID REFERENCES public.trades(id),
  original_outcome JSONB NOT NULL,
  counterfactual_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvement_score NUMERIC DEFAULT 0,
  patterns_pruned INTEGER DEFAULT 0,
  lessons_learned TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.replay_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Replay results are publicly readable" ON public.replay_results FOR SELECT USING (true);
CREATE POLICY "Edge functions can insert replay results" ON public.replay_results FOR INSERT WITH CHECK (true);

-- Initialize portfolio state
INSERT INTO public.portfolio_state (total_value, cash) VALUES (100000, 100000);

-- Initialize agent states
INSERT INTO public.agent_state (agent_name, status, metric_value, metric_label) VALUES
  ('Market Scanner', 'idle', '0', 'signals / hr'),
  ('Strategy Engine', 'idle', '0', 'active strategies'),
  ('Risk Controller', 'idle', '0%', 'current VaR'),
  ('Execution Agent', 'idle', '0', 'trades today'),
  ('Sentiment Analyst', 'idle', '0', 'bullish score'),
  ('Causal Replay', 'idle', '0%', 'improvement rate'),
  ('Portfolio Optimizer', 'idle', '0', 'Sharpe ratio'),
  ('Orchestrator', 'idle', '0%', 'uptime');

-- Create indexes for performance
CREATE INDEX idx_trades_executed_at ON public.trades(executed_at DESC);
CREATE INDEX idx_trades_symbol ON public.trades(symbol);
CREATE INDEX idx_signals_created_at ON public.signals(created_at DESC);
CREATE INDEX idx_signals_symbol ON public.signals(symbol);
CREATE INDEX idx_agent_logs_created_at ON public.agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_agent ON public.agent_logs(agent_name);
