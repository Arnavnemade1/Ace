import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface Agent {
  name: string;
  role: string;
  status: "active" | "idle" | "learning" | "error";
  metric: string;
  metricLabel: string;
}

const baseAgents = [
  { name: "Market Scanner", role: "Real-time signal detection across US equities, ETFs & futures" },
  { name: "Strategy Engine", role: "Multi-strategy allocation: momentum, mean-reversion, vol-arb" },
  { name: "Risk Controller", role: "Portfolio-level risk management with dynamic position sizing" },
  { name: "Execution Agent", role: "Alpaca paper trading with smart order routing & slippage control" },
  { name: "Sentiment Analyst", role: "NLP-driven sentiment from news, filings & social feeds" },
  { name: "Causal Replay", role: "Nightly self-improvement: replays decisions, prunes bad patterns" },
  { name: "Portfolio Optimizer", role: "Continuous rebalancing with Markowitz-enhanced allocation" },
  { name: "Orchestrator", role: "Central coordination, conflict resolution & agent lifecycle mgmt" },
];

const statusColors: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-white/20",
  learning: "bg-cyan-400",
  error: "bg-amber-500",
};

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
    <section className="relative py-32 overflow-hidden bg-[#020202]">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="mb-24"
        >
          <p className="text-[10px] text-white/20 uppercase tracking-[0.4em] font-mono mb-6 italic">// Collective Intelligence</p>
          <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter leading-[0.9]">
            Eight Minds.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#d8c3a5] to-[#f4efe6]">
              One Objective.
            </span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group relative p-8 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500"
            >
              <div className="flex items-center justify-between mb-12">
                <div className="text-[9px] font-mono tracking-[0.3em] text-white/10 uppercase">Node_0{i+1}</div>
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]} shadow-[0_0_8px_currentcolor]`} />
                  <span className="text-[9px] text-white/30 uppercase tracking-widest font-mono">{agent.status}</span>
                </div>
              </div>

              <div className="mb-12">
                <h3 className="text-white font-display font-black text-xl tracking-tighter mb-3 uppercase leading-none">{agent.name}</h3>
                <p className="text-white/30 text-[11px] leading-relaxed font-light tracking-wide uppercase">{agent.role}</p>
              </div>

              <div className="pt-8 border-t border-white/5 flex items-baseline gap-3">
                <span className="text-3xl font-display font-black text-white tracking-tighter">
                  {formatMetric(agent.metric, agent.metricLabel)}
                </span>
                <span className="text-[9px] text-white/10 uppercase tracking-[0.3em] font-mono">{agent.metricLabel}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AgentOverview;
