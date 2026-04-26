-- Fix agent_logs log_type constraint to include 'warning'
ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_log_type_check;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_log_type_check 
CHECK (log_type = ANY (ARRAY['info'::text, 'decision'::text, 'error'::text, 'learning'::text, 'trade'::text, 'warning'::text]));

-- Fix trades status constraint to include 'submitted'
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
ALTER TABLE trades ADD CONSTRAINT trades_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'executed'::text, 'cancelled'::text, 'failed'::text, 'submitted'::text]));
