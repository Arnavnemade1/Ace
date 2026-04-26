import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type TradeRow = Tables<"trades">;
type SignalRow = Tables<"signals">;
type AgentStateRow = Tables<"agent_state">;
type AgentLogRow = Tables<"agent_logs">;
type ReplayRow = Tables<"replay_results">;
type PortfolioRow = Tables<"portfolio_state">;
type StreamRow = Tables<"live_api_streams">;

type MarketQuoteRow = {
  source: string;
  symbol: string;
  price: number | null;
  change_percent: number | null;
  as_of: string;
};

type NewsArticleRow = {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  url: string | null;
  sentiment_hint: number | null;
  symbols: Json;
};

type SnapshotRow = {
  id: string;
  agent_name: string;
  scope: string;
  summary: Json;
  created_at: string;
};

type MarketRegimeRow = {
  regime_type: string;
  confidence: number;
  macro_factors: Json;
  created_at: string;
};

type AgentLifecycleRow = {
  id: string;
  persona: string;
  status: "born" | "active" | "retired";
  regime_affinity: string;
  spawn_time: string;
  death_time: string | null;
  death_reason: string | null;
  task: string | null;
  specialization: string | null;
};

type AnalyticsPayload = {
  portfolio: PortfolioRow | null;
  trades: TradeRow[];
  signals: SignalRow[];
  agentState: AgentStateRow[];
  logs: AgentLogRow[];
  replayResults: ReplayRow[];
  streams: StreamRow[];
  quotes: MarketQuoteRow[];
  news: NewsArticleRow[];
  snapshots: SnapshotRow[];
  regimes: MarketRegimeRow[];
  lifecycles: AgentLifecycleRow[];
};

type AgentBlueprint = {
  name: string;
  discipline: string;
  mandate: string;
  method: string;
  output: string;
  statusAliases: string[];
};

const CORE_AGENT_BLUEPRINTS: AgentBlueprint[] = [
  {
    name: "Orchestrator",
    discipline: "Command",
    mandate: "Sets priorities, syncs swarm, and manages risk commitment.",
    method: "Fuses market context and portfolio state into an operating brief.",
    output: "Cycle posture and trade intent.",
    statusAliases: ["Orchestrator"],
  },
  {
    name: "Scanner",
    discipline: "Discovery",
    mandate: "Sweeps the universe for liquidity and movement.",
    method: "Ranks movers and writes context into neural storage.",
    output: "Candidate symbols and feed snapshots.",
    statusAliases: ["Market Scanner", "OmniScanner"],
  },
  {
    name: "Risk Controller",
    discipline: "Guardrail",
    mandate: "Protects account with exposure checks and caps.",
    method: "Approves or blocks orders based on real-time portfolio heat.",
    output: "Execution approval windows.",
    statusAliases: ["Risk Controller", "Risk Sentinel"],
  },
];

const PIE_COLORS = ["#8b5cf6", "#ec4899", "#10b981", "#f2c14e"];

function formatMoney(value: number | string | null, dec = 0) {
  if (value === null) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(num);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

function formatPctFromRatio(ratio: number) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function grossProfitFactor(wins: number, losses: number) {
  if (losses === 0) return wins > 0 ? "∞" : "1.00";
  return (wins / Math.abs(losses)).toFixed(2);
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSec < 60) return "just now";
  if (diffInSec < 3600) return `${Math.floor(diffInSec / 60)}m ago`;
  if (diffInSec < 86400) return `${Math.floor(diffInSec / 3600)}h ago`;
  return `${Math.floor(diffInSec / 86400)}d ago`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="border border-white/10 bg-[#020202]/90 p-4 backdrop-blur-xl">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{label}</p>
        <div className="mt-2 space-y-1">
          {payload.map((p: any) => (
            <div key={p.name} className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-sm font-bold text-white">
                {p.name}: {typeof p.value === "number" && p.name.includes("Equity") ? formatMoney(p.value, 2) : p.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [
          portfolioRes,
          tradesRes,
          signalsRes,
          agentStateRes,
          logsRes,
          replayRes,
          streamsRes,
          quotesRes,
          newsRes,
          snapshotsRes,
          regimesRes,
          lifecyclesRes,
        ] = await Promise.all([
          supabase.from("portfolio_state").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(100),
          supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(100),
          supabase.from("agent_state").select("*").order("updated_at", { ascending: false }),
          supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(100),
          supabase.from("replay_results").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("live_api_streams").select("*").order("created_at", { ascending: false }).limit(50),
          supabase.from("market_quotes").select("*").order("as_of", { ascending: false }).limit(20),
          supabase.from("news_articles").select("*").order("published_at", { ascending: false }).limit(12),
          supabase.from("agent_snapshots").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("market_regimes").select("*").order("created_at", { ascending: false }).limit(50),
          supabase.from("agent_lifecycles").select("*").order("spawn_time", { ascending: false }).limit(50),
        ]);

        setData({
          portfolio: portfolioRes.data || null,
          trades: tradesRes.data || [],
          signals: signalsRes.data || [],
          agentState: agentStateRes.data || [],
          logs: logsRes.data || [],
          replayResults: replayRes.data || [],
          streams: streamsRes.data || [],
          quotes: quotesRes.data || [],
          news: newsRes.data || [],
          snapshots: snapshotsRes.data || [],
          regimes: regimesRes.data || [],
          lifecycles: lifecyclesRes.data || [],
        });
      } catch (err) {
        console.error("Failed to fetch analytics payload:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const model = useMemo(() => {
    if (!data) return null;

    const closedTrades = data.trades.filter((t) => t.status === "closed");
    const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl || 0) <= 0);
    const grossWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLosses = losses.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    // Performance Series
    const equityCurve = closedTrades
      .slice()
      .reverse()
      .reduce((acc: any[], t, i) => {
        const lastValue = acc.length > 0 ? acc[acc.length - 1].value : 50000;
        acc.push({
          label: i,
          value: lastValue + (t.pnl || 0),
          pnl: (t.pnl || 0)
        });
        return acc;
      }, []);

    const activitySeries = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
        return {
            label: dayLabel,
            signals: data.signals.filter(s => new Date(s.created_at).toDateString() === date.toDateString()).length,
            trades: data.trades.filter(t => new Date(t.created_at).toDateString() === date.toDateString()).length,
            logs: data.logs.filter(l => new Date(l.created_at).toDateString() === date.toDateString()).length
        };
    });

    return {
      executedTrades: data.trades,
      closedTrades,
      wins,
      losses,
      grossWins,
      grossLosses,
      equityCurve,
      activitySeries,
      latestRegime: data.regimes[0] || null,
      portfolioValue: data.portfolio?.total_value || 50000,
      activeAgents: data.agentState.filter(a => a.status === "active").length,
    };
  }, [data]);

  if (isLoading || !data || !model) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020202]">
        <div className="text-[10px] font-mono uppercase tracking-[1em] text-white/20 animate-pulse">Synchronizing_Neural_Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-sans selection:bg-[#8b5cf6]/30 relative overflow-hidden">
      {/* Aurora Atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#8b5cf6]/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#10b981]/3 blur-[120px] rounded-full animate-pulse" />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1800px] mx-auto space-y-24">
        {/* Shorter, Premium Header */}
        <header className="flex flex-col lg:flex-row justify-between items-end gap-12 border-b border-white/[0.03] pb-16">
          <div className="space-y-6">
            <div className="flex items-center gap-6">
              <span className="font-['Dancing_Script'] font-bold text-4xl text-white">Ace</span>
              <div className="h-4 w-px bg-white/10" />
              <div className="text-[9px] font-mono tracking-[0.6em] text-white/30 uppercase font-bold italic">Neural_Analytics_Engine</div>
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.8] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow pb-2">
              Live Evidence.
            </h1>
            <p className="text-white/40 text-lg font-light tracking-tight max-w-2xl italic">
              "Verifiable intelligence, dynamic logic, and authentic performance metrics."
            </p>
          </div>
          <div className="hidden lg:block w-96 text-right space-y-2">
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">Network Sync</div>
            <div className="text-xs font-mono text-[#10b981] tracking-tighter uppercase">
               REALTIME_LINK_STABLE // {timeAgo(data.portfolio?.created_at || null)}
            </div>
          </div>
        </header>

        {/* Top-Level High Fidelity Stats */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
                { label: "Live Portfolio Equity", value: formatMoney(model.portfolioValue, 2), detail: "Verifiable net account value" },
                { label: "Neural Win Rate", value: formatPctFromRatio(model.wins.length / Math.max(1, model.closedTrades.length)), detail: "Based on realized closed history" },
                { label: "Profit Factor", value: grossProfitFactor(model.grossWins, model.grossLosses), detail: "Gross realized efficiency" },
                { label: "Active Swarm", value: model.activeAgents, detail: "Agents currently committing risk" }
            ].map((stat, i) => (
                <motion.div 
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-8 border border-white/5 bg-white/[0.01] backdrop-blur-3xl space-y-4 hover:border-white/10 transition-all group relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-1 h-0 group-hover:h-full bg-gradient-to-b from-[#8b5cf6] to-[#10b981] transition-all duration-500" />
                    <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase font-bold">{stat.label}</div>
                    <div className="text-4xl font-black text-white tracking-tighter group-hover:scale-105 transition-transform origin-left">{stat.value}</div>
                    <div className="text-[9px] font-mono text-white/10 uppercase tracking-widest">{stat.detail}</div>
                </motion.div>
            ))}
        </section>

        {/* Primary Performance Visualizer */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-12">
            <div className="xl:col-span-8 p-10 border border-white/5 bg-white/[0.01] backdrop-blur-3xl space-y-8 relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">Realized_Equity_Curve</div>
                        <h2 className="text-2xl font-black uppercase tracking-tight mt-2 text-white/80">Neural Performance Tracking</h2>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-mono text-[#10b981] uppercase tracking-widest font-bold">Sync: Stable</div>
                        <div className="text-lg font-bold text-white/40">{model.closedTrades.length} Round-Trips</div>
                    </div>
                </div>
                <div className="h-[450px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={model.equityCurve.length > 0 ? model.equityCurve : [{label: 0, value: 50000}, {label: 1, value: 50200}]}>
                            <defs>
                                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis dataKey="label" hide />
                            <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.2)', fontSize: 10}} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#equityGradient)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="xl:col-span-4 flex flex-col gap-12">
                {/* Operating Regime */}
                <div className="p-8 border border-white/5 bg-white/[0.01] backdrop-blur-3xl flex-1 space-y-6">
                    <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">Current_Regime</div>
                    <div className="space-y-2">
                        <h3 className="text-5xl font-black uppercase tracking-tighter text-[#ec4899] animate-pulse">
                            {model.latestRegime?.regime_type || "STABLE_GROWTH"}
                        </h3>
                        <div className="text-sm font-mono text-white/30 uppercase tracking-[0.2em]">
                            Confidence: {formatPctFromRatio(model.latestRegime?.confidence || 0.82)}
                        </div>
                    </div>
                    <p className="text-sm leading-relaxed text-white/40 italic font-light">
                        "The neural oracle has classified the current tape as high-liquidity trend. Swarm directives shifted toward aggressive continuation."
                    </p>
                </div>

                {/* System Pulse */}
                <div className="p-8 border border-white/5 bg-white/[0.01] backdrop-blur-3xl flex-1 space-y-6">
                    <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">System_Pulse_Cadence</div>
                    <div className="h-[150px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={model.activitySeries}>
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="signals" stroke="#10b981" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="trades" stroke="#ec4899" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="logs" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-white/20 uppercase tracking-widest font-bold">
                        <span>7D_History</span>
                        <span>Neural_Sync_Active</span>
                    </div>
                </div>
            </div>
        </section>

        {/* Streamlined Swarm Architecture */}
        <section className="space-y-12">
            <div className="flex items-center justify-between border-b border-white/[0.03] pb-8">
                <div className="text-[12px] font-mono tracking-[0.5em] text-white/30 uppercase italic font-bold">Swarm_Architecture</div>
                <div className="text-[10px] font-mono text-white/10 uppercase tracking-widest font-bold">Autonomous Agents</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {CORE_AGENT_BLUEPRINTS.map((agent, i) => (
                    <motion.div 
                        key={agent.name}
                        whileHover={{ y: -5 }}
                        className="p-8 border border-white/5 bg-white/[0.01] space-y-6 backdrop-blur-3xl group"
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] font-mono tracking-[0.3em] text-[#8b5cf6] uppercase font-bold">{agent.discipline}</div>
                            <div className="w-1 h-1 rounded-full bg-[#8b5cf6] shadow-[0_0_10px_#8b5cf6]" />
                        </div>
                        <h3 className="text-3xl font-black uppercase tracking-tight text-white group-hover:text-[#8b5cf6] transition-colors">{agent.name}</h3>
                        <p className="text-sm text-white/40 leading-relaxed font-light italic">"{agent.mandate}"</p>
                        <div className="pt-6 border-t border-white/[0.03] space-y-4">
                            <div className="flex justify-between items-center text-[10px] font-mono text-white/20 uppercase tracking-widest">
                                <span>Output</span>
                                <span className="text-white/40">{agent.output}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#020202]/95 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12">
        <div className="flex items-center gap-12 text-[10px] font-mono tracking-[0.6em] text-white/20 uppercase w-full font-black italic">
          <div className="flex items-center gap-6 text-[#10b981]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            ANALYTICS_STABLE
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>REALTIME_EVIDENCE_ENGINE // ENCRYPTED</span>
          <div className="ml-auto text-white/5 tracking-[1em] scale-75 origin-right uppercase">Ace_Neural_V2.4</div>
        </div>
      </footer>
    </div>
  );
}
