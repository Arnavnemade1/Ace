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

// Map numeric placeholders to professional labels
const formatMetric = (val: string, label: string) => {
  if (val === "0" || !val || val === "-") {
    if (label.toLowerCase().includes("position") || label.toLowerCase().includes("trades")) return "NOMINAL";
    return "ACTIVE";
  }
  return val;
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
    <section className="relative py-32 overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="mb-24"
        >
          <p className="text-[10px] text-primary uppercase tracking-[0.4em] font-mono mb-6">Agent Collective</p>
          <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter leading-[0.9]">
            Eight minds.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#0ea5e9]">
              One objective.
            </span>
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
              className="group relative p-8 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="text-white/20 group-hover:text-primary transition-colors duration-500">
                  {agent.icon}
                </div>
                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full border border-white/5 bg-black/20">
                  <div className={`w-1 h-1 rounded-full ${statusColors[agent.status]} animate-pulse`} />
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-mono">{agent.status}</span>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-white font-display font-bold text-lg tracking-tight mb-2 uppercase">{agent.name}</h3>
                <p className="text-white/30 text-xs leading-relaxed font-light">{agent.role}</p>
              </div>

              <div className="pt-6 border-t border-white/5 flex items-baseline gap-2">
                <span className="text-2xl font-display font-black text-white tracking-widest">
                  {formatMetric(agent.metric, agent.metricLabel)}
                </span>
                <span className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-mono">{agent.metricLabel}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AgentOverview;
