import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  TrendingUp,
  Shield,
  Cpu,
  RefreshCw,
  Eye,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";

interface Agent {
  name: string;
  role: string;
  status: "active" | "idle" | "learning";
  icon: ReactNode;
  metric: string;
  metricLabel: string;
}

const agents: Agent[] = [
  {
    name: "Market Scanner",
    role: "Real-time signal detection across US equities, ETFs & futures",
    status: "active",
    icon: <Eye className="w-5 h-5" />,
    metric: "1,247",
    metricLabel: "signals / hr",
  },
  {
    name: "Strategy Engine",
    role: "Multi-strategy allocation: momentum, mean-reversion, vol-arb",
    status: "active",
    icon: <Target className="w-5 h-5" />,
    metric: "12",
    metricLabel: "active strategies",
  },
  {
    name: "Risk Controller",
    role: "Portfolio-level risk management with dynamic position sizing",
    status: "active",
    icon: <Shield className="w-5 h-5" />,
    metric: "0.8%",
    metricLabel: "current VaR",
  },
  {
    name: "Execution Agent",
    role: "Alpaca paper trading with smart order routing & slippage control",
    status: "active",
    icon: <Activity className="w-5 h-5" />,
    metric: "34",
    metricLabel: "trades today",
  },
  {
    name: "Sentiment Analyst",
    role: "NLP-driven sentiment from news, filings & social feeds",
    status: "active",
    icon: <BarChart3 className="w-5 h-5" />,
    metric: "0.72",
    metricLabel: "bullish score",
  },
  {
    name: "Causal Replay",
    role: "Nightly self-improvement: replays decisions, prunes bad patterns",
    status: "learning",
    icon: <RefreshCw className="w-5 h-5" />,
    metric: "8.2%",
    metricLabel: "improvement rate",
  },
  {
    name: "Portfolio Optimizer",
    role: "Continuous rebalancing with Markowitz-enhanced allocation",
    status: "active",
    icon: <TrendingUp className="w-5 h-5" />,
    metric: "1.34",
    metricLabel: "Sharpe ratio",
  },
  {
    name: "Orchestrator",
    role: "Central coordination, conflict resolution & agent lifecycle mgmt",
    status: "active",
    icon: <Cpu className="w-5 h-5" />,
    metric: "99.97%",
    metricLabel: "uptime",
  },
];

const statusColors: Record<string, string> = {
  active: "bg-profit",
  idle: "bg-muted-foreground",
  learning: "bg-accent",
};

const AgentOverview = () => {
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
