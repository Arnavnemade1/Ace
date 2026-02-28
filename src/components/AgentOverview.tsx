import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Target, Shield, Activity, BarChart3, RefreshCw, TrendingUp, Cpu } from "lucide-react";
import type { ReactNode } from "react";

interface Agent {
  name: string;
  role: string;
  status: "active" | "idle" | "learning" | "error";
  icon: ReactNode;
  metric: string;
  metricLabel: string;
}

const baseAgents = [
  { name: "Market Scanner", role: "Real-time signal detection across US equities, ETFs & futures", icon: <Eye className="w-5 h-5" /> },
  { name: "Strategy Engine", role: "Multi-strategy allocation: momentum, mean-reversion, vol-arb", icon: <Target className="w-5 h-5" /> },
  { name: "Risk Controller", role: "Portfolio-level risk management with dynamic position sizing", icon: <Shield className="w-5 h-5" /> },
  { name: "Execution Agent", role: "Alpaca paper trading with smart order routing & slippage control", icon: <Activity className="w-5 h-5" /> },
  { name: "Sentiment Analyst", role: "NLP-driven sentiment from news, filings & social feeds", icon: <BarChart3 className="w-5 h-5" /> },
  { name: "Causal Replay", role: "Nightly self-improvement: replays decisions, prunes bad patterns", icon: <RefreshCw className="w-5 h-5" /> },
  { name: "Portfolio Optimizer", role: "Continuous rebalancing with Markowitz-enhanced allocation", icon: <TrendingUp className="w-5 h-5" /> },
  { name: "Orchestrator", role: "Central coordination, conflict resolution & agent lifecycle mgmt", icon: <Cpu className="w-5 h-5" /> },
];

const statusColors: Record<string, string> = {
  active: "bg-profit",
  idle: "bg-muted-foreground",
  learning: "bg-accent",
  error: "bg-destructive",
};

const AgentOverview = () => {
  const [agents, setAgents] = useState<Agent[]>(baseAgents.map(a => ({ ...a, status: 'idle', metric: '0', metricLabel: '-' })));

  useEffect(() => {
    const fetchState = async () => {
      const { data } = await supabase.from('agent_state').select('*');
      if (data) {
        setAgents(prev => prev.map(a => {
          const stateData = data.find((d: any) => d.agent_name === a.name);
          return stateData ? {
            ...a,
            status: stateData.status as Agent["status"],
            metric: stateData.metric_value || '0',
            metricLabel: stateData.metric_label || '-',
          } : a;
        }));
      }
    };

    fetchState();

    const channel = supabase.channel('public:agent_state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_state' }, (payload: any) => {
        setAgents(prev => prev.map(a => {
          if (a.name === payload.new.agent_name) {
            return {
              ...a,
              status: payload.new.status,
              metric: payload.new.metric_value || '0',
              metricLabel: payload.new.metric_label || '-'
            };
          }
          return a;
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <section className="relative py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <p className="section-title mb-3">Agent Collective</p>
          <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
            Eight minds.<br />
            <span className="text-primary">One objective.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="glass-card-hover p-6 flex flex-col justify-between min-h-[200px] group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-primary opacity-60 group-hover:opacity-100 transition-opacity">
                    {agent.icon}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]}`} />
                    <span className="text-xs text-muted-foreground capitalize">{agent.status}</span>
                  </div>
                </div>
                <h3 className="text-foreground font-display font-semibold text-base mb-1.5">{agent.name}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{agent.role}</p>
              </div>
              <div className="mt-5 pt-4 border-t border-border/40">
                <span className="text-2xl font-display font-bold text-foreground">{agent.metric}</span>
                <span className="text-xs text-muted-foreground ml-2">{agent.metricLabel}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AgentOverview;
