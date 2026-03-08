import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  id?: string;
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
    mandate: "Sets cycle priorities, synchronizes the full swarm, and decides whether the system should press risk or wait.",
    method: "Combines market context, portfolio state, open signals, and recent lessons into a single operating brief.",
    output: "Cycle-level action plan, system posture, and coordination notes for downstream agents.",
    statusAliases: ["Orchestrator"],
  },
  {
    name: "Market Scanner",
    discipline: "Discovery",
    mandate: "Sweeps the live universe for unusual movement, liquidity, and symbol-level opportunities.",
    method: "Ranks movers, scans broad symbol sets, and writes fresh signals plus stream telemetry into storage.",
    output: "Candidate symbols, raw market context, and signal counts per scan.",
    statusAliases: ["Market Scanner", "OmniScanner"],
  },
  {
    name: "Sentiment Analyst",
    discipline: "Context",
    mandate: "Turns incoming news flow into directional context and event pressure.",
    method: "Evaluates article flow and sentiment hints, then emits symbols or market mood shifts when the tape changes.",
    output: "Sentiment-scored headlines and news-driven signals.",
    statusAliases: ["Sentiment Analyst"],
  },
  {
    name: "Strategy Engine",
    discipline: "Selection",
    mandate: "Converts raw signals into candidate trades with sizing logic and entry framing.",
    method: "Filters for quality, ranks by conviction, and proposes the top opportunities for review.",
    output: "Pending trade decisions with strategy and reasoning attached.",
    statusAliases: ["Strategy Engine"],
  },
  {
    name: "Risk Controller",
    discipline: "Risk",
    mandate: "Protects capital before execution by enforcing daily caps, drawdown limits, and exposure rules.",
    method: "Rejects or approves proposed trades based on portfolio state, recent activity, and current market conditions.",
    output: "Approved execution windows, blocked orders, and risk exceptions.",
    statusAliases: ["Risk Controller", "Risk Sentinel"],
  },
  {
    name: "Execution Agent",
    discipline: "Routing",
    mandate: "Moves approved trades into the market and keeps order state accurate.",
    method: "Checks live quotes, validates buying power or inventory, and routes orders to Alpaca.",
    output: "Executed, failed, or queued trades with exchange-facing detail.",
    statusAliases: ["Execution Agent", "Order Agent"],
  },
  {
    name: "Portfolio Optimizer",
    discipline: "Allocation",
    mandate: "Reviews current holdings against portfolio health and capital efficiency.",
    method: "Analyzes allocation, trade history, and current exposures to suggest rebalancing or portfolio cleanup.",
    output: "Allocation notes, Sharpe-related summaries, and rebalance proposals.",
    statusAliases: ["Portfolio Optimizer"],
  },
  {
    name: "Causal Replay",
    discipline: "Learning",
    mandate: "Replays completed trades to test what worked, what failed, and what should be pruned.",
    method: "Runs counterfactual review on recent activity and writes lessons plus improvement scores.",
    output: "Replay summaries, patterns to prune, and system learning pressure.",
    statusAliases: ["Causal Replay", "Causal Replay Arena"],
  },
  {
    name: "Regime Oracle",
    discipline: "Regime",
    mandate: "Identifies the market state the swarm is operating inside and adapts the team accordingly.",
    method: "Estimates volatility and sentiment velocity, then classifies the environment and commissions specialist personas.",
    output: "Regime labels, confidence scores, and dynamic team directives.",
    statusAliases: ["RegimeOracle", "Regime Oracle", "PersonaManager"],
  },
];

const REGIME_COPY: Record<string, { title: string; body: string; directive: string }> = {
  "low-vol-trend": {
    title: "Low-Vol Trend",
    body: "The tape is behaving cleanly. Moves persist longer, entries can be staged more deliberately, and the system should care more about participation quality than emergency defense.",
    directive: "Lean into continuation setups, but insist on orderly liquidity and clean invalidation levels.",
  },
  "high-vol-reversion": {
    title: "High-Vol Reversion",
    body: "Volatility is elevated enough that overshoots matter more than steady trend. The market can still move hard, but the better edge often comes from letting extremes cool and then fading them.",
    directive: "Reduce impulse chasing, shorten decision loops, and prioritize mean-reversion conditions with hard risk limits.",
  },
  "quiet-accumulation": {
    title: "Quiet Accumulation",
    body: "Price action is calm and sentiment is not lurching. This regime usually rewards patience, staggered entries, and sectors quietly building sponsorship before the market notices.",
    directive: "Favor accumulation candidates, watch volume expansion, and avoid forcing turnover just to stay busy.",
  },
  "crisis-transition": {
    title: "Crisis Transition",
    body: "Sentiment is moving fast enough to change the shape of the market. Correlations can jump, narratives can break, and yesterday's playbook starts to decay.",
    directive: "Preserve optionality, tighten gross exposure, and prioritize survival and signal quality over trade count.",
  },
  "commodity-supercycle": {
    title: "Commodity Supercycle",
    body: "Cross-asset pressure is rotating toward energy, resource pricing, or real-world supply constraints. Macro and physical-world data matter more than isolated chart patterns.",
    directive: "Elevate resource-linked opportunities, track external disruption data, and police concentration risk aggressively.",
  },
};

const REGIME_TINT: Record<string, string> = {
  "low-vol-trend": "#8bd450",
  "high-vol-reversion": "#ff7a59",
  "quiet-accumulation": "#74b8ff",
  "crisis-transition": "#ffd166",
  "commodity-supercycle": "#ff9f43",
};

const PALETTE = ["#f4efe6", "#d8c3a5", "#9bb8d3", "#8da47e", "#d97d54", "#f2c14e"];

function formatMoney(value: number | null | undefined, digits = 0) {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPct(value: number | null | undefined, digits = 1) {
  const safe = Number(value ?? 0) * 100;
  return `${safe.toFixed(digits)}%`;
}

function formatSigned(value: number | null | undefined, digits = 2) {
  const safe = Number(value ?? 0);
  const abs = Math.abs(safe).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return safe >= 0 ? `+${abs}` : `-${abs.replace("$", "$")}`;
}

function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));
}

function timeAgo(input: string | null | undefined) {
  if (!input) return "n/a";
  const diff = Date.now() - new Date(input).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function asArray(value: Json | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}

function summarizeTask(task: string | null | undefined) {
  const text = String(task || "").trim();
  if (!text) return "Adaptive mission assigned for the current cycle.";
  return text.replace(/\s*Deliverable:.*$/i, "").trim() || text;
}

function extractTaskField(task: string | null | undefined, label: "Deliverable" | "Success" | "Handoff") {
  const match = String(task || "").match(new RegExp(`${label}:\\s*([^.]*)`, "i"));
  return match?.[1]?.trim() || "";
}

function renderTooltipValue(value: number | string) {
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | string; name: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-white/10 bg-[#0c0f10]/95 px-3 py-2 text-[11px] text-white shadow-2xl backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/40">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-6 text-white/80">
          <span>{item.name}</span>
          <span style={{ color: item.color || "#f4efe6" }}>{renderTooltipValue(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-4 text-[11px] uppercase tracking-[0.32em] text-white/35">{children}</div>;
}

function MetricLine({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="border-b border-white/8 py-4 last:border-b-0">
      <div className="mb-1 text-[10px] uppercase tracking-[0.28em] text-white/30">{label}</div>
      <div
        className={cn("font-display text-3xl tracking-tight text-[#f4efe6]", {
          "text-[#8bd450]": tone === "positive",
          "text-[#ff8a63]": tone === "negative",
        })}
      >
        {value}
      </div>
      {detail ? <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{detail}</p> : null}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        if (!alive) return;
        setError(null);

        const [
          portfolioRes,
          tradesRes,
          signalsRes,
          stateRes,
          logsRes,
          replayRes,
          streamsRes,
          quotesRes,
          newsRes,
          snapshotsRes,
          regimesRes,
          lifecycleRes,
        ] = await Promise.all([
          supabase.from("portfolio_state").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("trades").select("*").order("executed_at", { ascending: true }).limit(250),
          supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(400),
          supabase.from("agent_state").select("*").order("updated_at", { ascending: false }),
          supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(250),
          supabase.from("replay_results").select("*").order("created_at", { ascending: false }).limit(80),
          supabase.from("live_api_streams").select("*").order("created_at", { ascending: false }).limit(200),
          (supabase as any).from("market_quotes").select("source, symbol, price, change_percent, as_of").order("as_of", { ascending: false }).limit(120),
          (supabase as any).from("news_articles").select("id, source, title, summary, published_at, url, sentiment_hint, symbols").order("published_at", { ascending: false }).limit(12),
          (supabase as any).from("ai_context_snapshots").select("id, agent_name, scope, summary, created_at").order("created_at", { ascending: false }).limit(40),
          (supabase as any).from("market_regimes").select("*").order("created_at", { ascending: false }).limit(16),
          (supabase as any).from("agent_lifecycles").select("*").order("spawn_time", { ascending: false }).limit(20),
        ]);

        const firstError =
          portfolioRes.error ||
          tradesRes.error ||
          signalsRes.error ||
          stateRes.error ||
          logsRes.error ||
          replayRes.error ||
          streamsRes.error ||
          quotesRes.error ||
          newsRes.error ||
          snapshotsRes.error ||
          regimesRes.error ||
          lifecycleRes.error;

        if (firstError) throw firstError;

        if (!alive) return;

        setData({
          portfolio: portfolioRes.data ?? null,
          trades: tradesRes.data ?? [],
          signals: signalsRes.data ?? [],
          agentState: stateRes.data ?? [],
          logs: logsRes.data ?? [],
          replayResults: replayRes.data ?? [],
          streams: streamsRes.data ?? [],
          quotes: quotesRes.data ?? [],
          news: newsRes.data ?? [],
          snapshots: snapshotsRes.data ?? [],
          regimes: regimesRes.data ?? [],
          lifecycles: lifecycleRes.data ?? [],
        });
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load analytics");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();

    const refreshTables = [
      "trades",
      "signals",
      "agent_logs",
      "agent_state",
      "portfolio_state",
      "replay_results",
      "live_api_streams",
      "market_quotes",
      "news_articles",
      "ai_context_snapshots",
      "market_regimes",
      "agent_lifecycles",
    ];

    const channel = supabase
      .channel("proof-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "*" }, (payload) => {
        if (refreshTables.includes(payload.table || "")) {
          load();
        }
      })
      .subscribe();

    const interval = window.setInterval(load, 60000);

    return () => {
      alive = false;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;

    const trades = [...data.trades].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
    );
    const executedTrades = trades.filter((trade) => trade.status === "executed");
    const closedTrades = executedTrades.filter((trade) => trade.pnl !== null);
    const wins = closedTrades.filter((trade) => Number(trade.pnl) > 0);
    const losses = closedTrades.filter((trade) => Number(trade.pnl) < 0);
    const totalRealizedPnl = closedTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const grossWins = wins.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const grossLosses = losses.reduce((sum, trade) => sum + Math.abs(Number(trade.pnl || 0)), 0);
    const startingEquity =
      Number(data.portfolio?.total_value ?? 100000) -
      Number(data.portfolio?.total_pnl ?? totalRealizedPnl);

    let runningPnl = 0;
    let runningPeak = 0;
    let maxDrawdown = 0;
    const equityCurve = closedTrades.map((trade) => {
      runningPnl += Number(trade.pnl || 0);
      runningPeak = Math.max(runningPeak, runningPnl);
      maxDrawdown = Math.max(maxDrawdown, runningPeak - runningPnl);
      return {
        label: new Date(trade.executed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        pnl: Number(runningPnl.toFixed(2)),
        equity: Number((startingEquity + runningPnl).toFixed(2)),
      };
    });

    const recentSignals = data.signals.filter((signal) => {
      const created = new Date(signal.created_at).getTime();
      return Date.now() - created < 1000 * 60 * 60 * 24 * 7;
    });

    const topSymbols = Array.from(
      closedTrades.reduce((map, trade) => {
        const current = map.get(trade.symbol) || { symbol: trade.symbol, pnl: 0, trades: 0 };
        current.pnl += Number(trade.pnl || 0);
        current.trades += 1;
        map.set(trade.symbol, current);
        return map;
      }, new Map<string, { symbol: string; pnl: number; trades: number }>()),
    )
      .map(([, value]) => value)
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 6);

    const signalStrengthByDay = Array.from(
      recentSignals.reduce((map, signal) => {
        const label = new Date(signal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const current = map.get(label) || { label, avgStrength: 0, count: 0, acted: 0 };
        current.avgStrength += Number(signal.strength || 0);
        current.count += 1;
        current.acted += signal.acted_on ? 1 : 0;
        map.set(label, current);
        return map;
      }, new Map<string, { label: string; avgStrength: number; count: number; acted: number }>()),
    )
      .map(([, value]) => ({
        label: value.label,
        strength: Number((value.avgStrength / Math.max(1, value.count)).toFixed(2)),
        actedRate: Number(((value.acted / Math.max(1, value.count)) * 100).toFixed(1)),
      }))
      .slice(-8);

    const statusCounts = data.agentState.reduce(
      (acc, row) => {
        const key = row.status.toLowerCase();
        if (key === "active") acc.active += 1;
        else if (key === "learning") acc.learning += 1;
        else if (key === "error") acc.error += 1;
        else acc.idle += 1;
        return acc;
      },
      { active: 0, learning: 0, idle: 0, error: 0 },
    );

    const pieData = [
      { name: "Active", value: statusCounts.active },
      { name: "Learning", value: statusCounts.learning },
      { name: "Idle", value: statusCounts.idle },
      { name: "Error", value: statusCounts.error },
    ].filter((item) => item.value > 0);

    const latestRegime = data.regimes[0] || null;
    const regimeHistory = [...data.regimes]
      .reverse()
      .map((row) => ({
        label: new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        confidence: Number((row.confidence * 100).toFixed(1)),
        regime: row.regime_type,
      }));

    const latestSnapshotByAgent = Array.from(
      data.snapshots.reduce((map, snap) => {
        if (!map.has(snap.agent_name)) map.set(snap.agent_name, snap);
        return map;
      }, new Map<string, SnapshotRow>()),
    ).map(([, value]) => value);

    const feedFreshness = Array.from(
      data.streams.reduce((map, stream) => {
        const current = map.get(stream.source);
        if (!current || new Date(stream.created_at).getTime() > new Date(current).getTime()) {
          map.set(stream.source, stream.created_at);
        }
        return map;
      }, new Map<string, string>()),
    )
      .map(([source, created_at]) => ({ source, created_at }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    const latestQuotes = Array.from(
      data.quotes.reduce((map, quote) => {
        if (!map.has(quote.symbol)) map.set(quote.symbol, quote);
        return map;
      }, new Map<string, MarketQuoteRow>()),
    )
      .map(([, value]) => value)
      .slice(0, 8);

    const coreAgents = CORE_AGENT_BLUEPRINTS.map((blueprint) => {
      const state = data.agentState.find((row) => blueprint.statusAliases.includes(row.agent_name));
      const latestLog = data.logs.find((row) => blueprint.statusAliases.includes(row.agent_name));
      const latestSnapshot = latestSnapshotByAgent.find((row) => blueprint.statusAliases.includes(row.agent_name));
      return {
        ...blueprint,
        state,
        latestLog,
        latestSnapshot,
      };
    });

    const activePersonas = data.lifecycles.filter((row) => row.status !== "retired").slice(0, 6);
    const retiredPersonas = data.lifecycles.filter((row) => row.status === "retired").slice(0, 4);
    const latestNews = data.news.slice(0, 6);

    return {
      trades,
      executedTrades,
      closedTrades,
      wins,
      losses,
      totalRealizedPnl,
      grossWins,
      grossLosses,
      maxDrawdown,
      equityCurve,
      recentSignals,
      topSymbols,
      signalStrengthByDay,
      statusCounts,
      pieData,
      latestRegime,
      regimeHistory,
      latestQuotes,
      feedFreshness,
      coreAgents,
      activePersonas,
      retiredPersonas,
      latestNews,
      signalConversionRate:
        recentSignals.length > 0
          ? recentSignals.filter((signal) => signal.acted_on).length / recentSignals.length
          : 0,
      executionRate:
        trades.length > 0
          ? executedTrades.length / trades.length
          : 0,
      replayImprovement:
        data.replayResults.length > 0
          ? data.replayResults.reduce((sum, replay) => sum + Number(replay.improvement_score || 0), 0) /
            data.replayResults.length
          : 0,
      avgSignalStrength:
        recentSignals.length > 0
          ? recentSignals.reduce((sum, signal) => sum + Number(signal.strength || 0), 0) / recentSignals.length
          : 0,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111413] px-6 pt-36 text-[#f4efe6]">
        <div className="mx-auto max-w-7xl border-t border-white/10 pt-6">
          <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">Proof Dashboard</div>
          <div className="mt-8 text-5xl font-display tracking-tight">Loading live evidence...</div>
        </div>
      </div>
    );
  }

  if (error || !data || !model) {
    return (
      <div className="min-h-screen bg-[#111413] px-6 pt-36 text-[#f4efe6]">
        <div className="mx-auto max-w-7xl border-t border-white/10 pt-6">
          <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">Proof Dashboard</div>
          <div className="mt-8 max-w-2xl text-3xl font-display tracking-tight">The analytics surface could not be assembled from live data.</div>
          <p className="mt-4 text-white/60">{error || "Unknown analytics error"}</p>
        </div>
      </div>
    );
  }

  const regimeMeta = model.latestRegime ? REGIME_COPY[model.latestRegime.regime_type] : null;
  const regimeTint = model.latestRegime ? REGIME_TINT[model.latestRegime.regime_type] || "#f4efe6" : "#f4efe6";

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#111413] text-[#f4efe6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(206,172,114,0.08),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(107,138,177,0.12),transparent_26%),linear-gradient(180deg,#111413_0%,#0f1110_100%)]" />

      <main className="relative z-10 px-6 pb-24 pt-32">
        <div className="mx-auto max-w-7xl">
          <section className="border-t border-white/10 pt-6">
            <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/35">Proof Dashboard</div>
                <h1 className="mt-6 max-w-5xl font-display text-5xl leading-[0.94] tracking-[-0.04em] md:text-7xl">
                  Built from trades, signals, replays, and live system state instead of synthetic motion.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-white/58">
                  This page is a live dossier. Performance, conversion, operating mode, feed freshness, and swarm behavior are all computed from the current Supabase records backing the system.
                </p>
              </div>

              <div className="self-end border-l border-white/10 pl-0 lg:pl-8">
                <div className="space-y-5 text-sm text-white/52">
                  <div className="flex items-end justify-between border-b border-white/8 pb-4">
                    <span className="uppercase tracking-[0.24em] text-white/30">Live Equity</span>
                    <span className="font-display text-3xl tracking-tight">{formatMoney(data.portfolio?.total_value ?? data.portfolio?.equity ?? 0)}</span>
                  </div>
                  <div className="flex items-end justify-between border-b border-white/8 pb-4">
                    <span className="uppercase tracking-[0.24em] text-white/30">Executed Trades</span>
                    <span className="font-display text-3xl tracking-tight">{model.executedTrades.length}</span>
                  </div>
                  <div className="flex items-end justify-between border-b border-white/8 pb-4">
                    <span className="uppercase tracking-[0.24em] text-white/30">Replay Studies</span>
                    <span className="font-display text-3xl tracking-tight">{data.replayResults.length}</span>
                  </div>
                  <div className="flex items-end justify-between pb-2">
                    <span className="uppercase tracking-[0.24em] text-white/30">Active Agents</span>
                    <span className="font-display text-3xl tracking-tight">{model.statusCounts.active + model.statusCounts.learning}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-20 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Performance Proof</SectionLabel>
              <MetricLine
                label="Realized P&L"
                value={formatSigned(model.totalRealizedPnl)}
                tone={model.totalRealizedPnl >= 0 ? "positive" : "negative"}
                detail="Calculated from executed trades with non-null P&L. This is realized trade outcome, not an animated placeholder curve."
              />
              <MetricLine
                label="Win Rate"
                value={formatPct(model.wins.length / Math.max(1, model.closedTrades.length))}
                detail={`${model.wins.length} winning closes against ${model.losses.length} losing closes in the recorded trade set.`}
              />
              <MetricLine
                label="Profit Factor"
                value={grossLossesSafe(model.grossWins, model.grossLosses)}
                detail="Gross winning dollars divided by gross losing dollars. Higher means the system is extracting more from winners than it is bleeding on losers."
              />
              <MetricLine
                label="Observed Max Drawdown"
                value={formatMoney(model.maxDrawdown)}
                tone={model.maxDrawdown > 0 ? "negative" : "default"}
                detail="Measured from the realized P&L curve reconstructed from closed trades."
              />
            </div>

            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Realized Equity Curve</SectionLabel>
              <div className="mb-4 flex items-end justify-between">
                <div className="max-w-xl text-sm leading-7 text-white/56">
                  Each point advances only when the database records a closed trade. That makes the line sparse when the system is patient, which is exactly what a real record should look like.
                </div>
                <div className="text-right text-[11px] uppercase tracking-[0.26em] text-white/30">
                  {model.closedTrades.length} closed trades
                </div>
              </div>
              <div className="h-[360px] border border-white/8 bg-black/10 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={model.equityCurve}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d8c3a5" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#d8c3a5" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }}
                      tickFormatter={(value) => `$${formatCompact(value)}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="equity" stroke="#f4efe6" strokeWidth={2} fill="url(#equityFill)" name="Equity" />
                    <Line type="monotone" dataKey="pnl" stroke="#8da47e" strokeWidth={1.4} dot={false} name="Cum P&L" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Signal Quality</SectionLabel>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Signal Conversion</div>
                  <div className="mt-2 font-display text-5xl tracking-tight">{formatPct(model.signalConversionRate)}</div>
                  <p className="mt-3 text-sm leading-7 text-white/56">
                    Share of last-7-day signals that were acted on. This shows whether discovery is creating tradeable ideas or just noise.
                  </p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Average Strength</div>
                  <div className="mt-2 font-display text-5xl tracking-tight">{model.avgSignalStrength.toFixed(2)}</div>
                  <p className="mt-3 text-sm leading-7 text-white/56">
                    Mean conviction on recent signals. Useful on its own, but more useful when compared against conversion and realized results.
                  </p>
                </div>
              </div>

              <div className="mt-10 h-[280px] border border-white/8 bg-black/10 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.signalStrengthByDay}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="strength" stroke="#9bb8d3" strokeWidth={2} dot={false} name="Avg strength" />
                    <Line type="monotone" dataKey="actedRate" stroke="#f2c14e" strokeWidth={2} dot={false} name="Acted %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Execution & Learning</SectionLabel>
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border-b border-white/8 pb-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Execution Rate</div>
                    <div className="mt-2 font-display text-4xl tracking-tight">{formatPct(model.executionRate)}</div>
                    <p className="mt-2 text-sm leading-7 text-white/56">
                      Executed trades as a share of all recorded trade intents. This reflects routing quality and rejection pressure together.
                    </p>
                  </div>
                  <div className="border-b border-white/8 pb-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Replay Improvement</div>
                    <div className="mt-2 font-display text-4xl tracking-tight">{model.replayImprovement.toFixed(1)}%</div>
                    <p className="mt-2 text-sm leading-7 text-white/56">
                      Average `improvement_score` recorded by the replay engine across stored studies.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[0.52fr_0.48fr]">
                  <div className="border-r border-white/10 pr-0 md:pr-6">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Top P&L Symbols</div>
                    <div className="mt-4 space-y-4">
                      {model.topSymbols.map((row) => (
                        <div key={row.symbol} className="flex items-end justify-between border-b border-white/8 pb-3">
                          <div>
                            <div className="font-display text-2xl tracking-tight">{row.symbol}</div>
                            <div className="text-[11px] uppercase tracking-[0.24em] text-white/32">{row.trades} closed trades</div>
                          </div>
                          <div className={cn("text-xl", row.pnl >= 0 ? "text-[#8bd450]" : "text-[#ff8a63]")}>{formatSigned(row.pnl)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pl-0 md:pl-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Live Agent State</div>
                    <div className="mt-2 h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={model.pieData} innerRadius={52} outerRadius={84} paddingAngle={4} dataKey="value">
                            {model.pieData.map((entry, index) => (
                              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-white/62">
                      {model.pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center justify-between border-b border-white/8 pb-2">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
                            {entry.name}
                          </span>
                          <span>{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Operating Regime</SectionLabel>
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/30">Current State</div>
                <div className="mt-4 font-display text-5xl tracking-tight" style={{ color: regimeTint }}>
                  {regimeMeta?.title || "No regime captured yet"}
                </div>
                <div className="mt-3 text-xl text-white/60">
                  {model.latestRegime ? `${(model.latestRegime.confidence * 100).toFixed(1)}% confidence` : "Waiting on regime data"}
                </div>
                <p className="mt-6 max-w-xl text-base leading-8 text-white/58">{regimeMeta?.body || "Once the Oracle records a regime, the page will describe how the swarm should behave in it."}</p>
                <div className="mt-8 border-l border-white/12 pl-5">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Directive</div>
                  <p className="mt-2 text-base leading-8 text-white/74">{regimeMeta?.directive || "No live directive yet."}</p>
                </div>
                {model.latestRegime ? (
                  <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className="border-b border-white/8 pb-3">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">SPY Volatility</div>
                      <div className="mt-2 text-xl">
                        {(() => {
                          const factors = asObject(model.latestRegime.macro_factors);
                          const vol = Number(factors.spy_volatililty || 0);
                          return formatPct(vol);
                        })()}
                      </div>
                    </div>
                    <div className="border-b border-white/8 pb-3">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Sentiment Velocity</div>
                      <div className="mt-2 text-xl">
                        {(() => {
                          const factors = asObject(model.latestRegime.macro_factors);
                          return Number(factors.sentiment_velocity || 0).toFixed(2);
                        })()}
                      </div>
                    </div>
                    <div className="border-b border-white/8 pb-3">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Logged</div>
                      <div className="mt-2 text-xl">{timeAgo(model.latestRegime.created_at)}</div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-4 flex items-end justify-between">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Regime Confidence History</div>
                  <div className="text-[11px] text-white/40">latest {model.regimeHistory.length} observations</div>
                </div>
                <div className="h-[280px] border border-white/8 bg-black/10 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={model.regimeHistory}>
                      <defs>
                        <linearGradient id="regimeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={regimeTint} stopOpacity={0.38} />
                          <stop offset="100%" stopColor={regimeTint} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="confidence" stroke={regimeTint} strokeWidth={2} fill="url(#regimeFill)" name="Confidence %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <div className="border-t border-white/8 pt-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Live Quote Tape</div>
                    <div className="mt-4 space-y-3">
                      {model.latestQuotes.map((quote) => (
                        <div key={`${quote.symbol}-${quote.source}`} className="flex items-end justify-between border-b border-white/8 pb-3">
                          <div>
                            <div className="font-display text-2xl tracking-tight">{quote.symbol}</div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-white/32">{quote.source}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl">{formatMoney(quote.price, 2)}</div>
                            <div className={cn("text-sm", Number(quote.change_percent || 0) >= 0 ? "text-[#8bd450]" : "text-[#ff8a63]")}>
                              {Number(quote.change_percent || 0) >= 0 ? "+" : ""}
                              {Number(quote.change_percent || 0).toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/8 pt-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Feed Freshness</div>
                    <div className="mt-4 space-y-3">
                      {model.feedFreshness.map((feed) => (
                        <div key={feed.source} className="flex items-end justify-between border-b border-white/8 pb-3">
                          <div className="font-medium text-white/78">{feed.source}</div>
                          <div className="text-sm text-white/45">{timeAgo(feed.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Agent Briefing</SectionLabel>
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr]">
              <div>
                <h2 className="max-w-lg font-display text-4xl tracking-tight">Every core agent explained in plain operational terms.</h2>
                <p className="mt-6 max-w-xl text-base leading-8 text-white/58">
                  The system isn&apos;t just a list of names. Each role has a specific job, a clear output, and a live state pulled from current logs or agent state when available.
                </p>
              </div>
              <div className="space-y-10">
                {model.coreAgents.map((agent, index) => (
                  <motion.article
                    key={agent.name}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="grid gap-5 border-b border-white/8 pb-8 md:grid-cols-[0.2fr_0.8fr]"
                  >
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-white/28">{agent.discipline}</div>
                      <div className="mt-3 font-display text-2xl tracking-tight">{agent.name}</div>
                      <div className="mt-3 text-sm text-white/42">
                        {agent.state ? `${agent.state.status} • ${timeAgo(agent.state.updated_at)}` : "No current status row"}
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.26em] text-white/28">Mandate</div>
                        <p className="mt-2 text-sm leading-7 text-white/72">{agent.mandate}</p>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.26em] text-white/28">Method</div>
                        <p className="mt-2 text-sm leading-7 text-white/72">{agent.method}</p>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.26em] text-white/28">Output</div>
                        <p className="mt-2 text-sm leading-7 text-white/72">{agent.output}</p>
                        {agent.latestLog ? (
                          <div className="mt-4 border-l border-white/12 pl-4 text-sm leading-7 text-white/54">
                            Latest: {agent.latestLog.message}
                          </div>
                        ) : null}
                        {agent.latestSnapshot ? (
                          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/30">
                            Snapshot {agent.latestSnapshot.scope} • {timeAgo(agent.latestSnapshot.created_at)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Dynamic Roster</SectionLabel>
            <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <h2 className="font-display text-4xl tracking-tight">Temporary specialist personas commissioned by the regime engine.</h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/58">
                  These are the adaptive agents the system spawns for the current market state. Their missions, handoffs, and retirements come directly from lifecycle records instead of static marketing copy.
                </p>
                <div className="mt-8 space-y-8">
                  {model.activePersonas.map((agent) => (
                    <article key={agent.id} className="border-b border-white/8 pb-6">
                      <div className="grid gap-4 md:grid-cols-[0.28fr_0.72fr]">
                        <div>
                          <div className="font-display text-2xl tracking-tight">{agent.persona}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/34">
                            {agent.specialization || "Adaptive ops"} • {agent.regime_affinity.replace(/-/g, " ")}
                          </div>
                          <div className="mt-4 text-sm text-white/44">spawned {timeAgo(agent.spawn_time)}</div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-white/28">Mission</div>
                            <p className="mt-2 text-sm leading-7 text-white/74">{summarizeTask(agent.task)}</p>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-white/28">Deliverable</div>
                            <p className="mt-2 text-sm leading-7 text-white/74">
                              {extractTaskField(agent.task, "Deliverable") || "No explicit deliverable captured."}
                            </p>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.24em] text-white/28">Success / Handoff</div>
                            <p className="mt-2 text-sm leading-7 text-white/74">
                              {extractTaskField(agent.task, "Success") || "No success metric captured."}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-white/50">
                              Handoff: {extractTaskField(agent.task, "Handoff") || "Orchestrator"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <div className="border-b border-white/8 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Recent Retirements</div>
                  <div className="mt-4 space-y-4">
                    {model.retiredPersonas.length === 0 ? (
                      <div className="text-white/45">No retired personas recorded yet.</div>
                    ) : (
                      model.retiredPersonas.map((agent) => (
                        <div key={agent.id} className="border-b border-white/8 pb-4">
                          <div className="font-display text-2xl tracking-tight text-white/82">{agent.persona}</div>
                          <div className="mt-2 text-sm leading-7 text-white/52">{agent.death_reason || "Retired at the end of its cycle."}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/30">
                            {agent.regime_affinity.replace(/-/g, " ")} • retired {timeAgo(agent.death_time || agent.spawn_time)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-10 border-b border-white/8 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Latest Intelligence Notes</div>
                  <div className="mt-4 space-y-4">
                    {data.snapshots.slice(0, 4).map((snapshot) => (
                      <div key={snapshot.id} className="border-b border-white/8 pb-4 last:border-b-0">
                        <div className="flex items-center justify-between gap-4">
                          <div className="font-medium text-white/78">{snapshot.agent_name}</div>
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">
                            {snapshot.scope} • {timeAgo(snapshot.created_at)}
                          </div>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-white/56">{summarizeSnapshot(snapshot.summary)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Market Context</SectionLabel>
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Recent Articles</div>
                <div className="mt-6 space-y-6">
                  {model.latestNews.map((article) => (
                    <article key={article.id} className="border-b border-white/8 pb-5">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-white/30">
                        <span>{article.source}</span>
                        <span>{timeAgo(article.published_at)}</span>
                        {article.sentiment_hint !== null ? (
                          <span className={cn(Number(article.sentiment_hint) >= 0 ? "text-[#8bd450]" : "text-[#ff8a63]")}>
                            sentiment {Number(article.sentiment_hint).toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 max-w-2xl font-display text-2xl tracking-tight">{article.title}</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">{article.summary || "No summary captured for this article."}</p>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/30">
                        symbols {symbolsLabel(article.symbols)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">Decision Stream</div>
                <div className="mt-6 space-y-4">
                  {data.logs.slice(0, 10).map((log) => (
                    <div key={log.id} className="grid gap-2 border-b border-white/8 pb-4 md:grid-cols-[0.24fr_0.76fr]">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">{log.agent_name}</div>
                        <div className="mt-1 text-sm text-white/42">{timeAgo(log.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-base text-white/84">{log.message}</div>
                        {log.reasoning ? <div className="mt-2 text-sm leading-7 text-white/52">{log.reasoning}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function summarizeSnapshot(summary: Json) {
  if (typeof summary === "string") return summary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const record = summary as Record<string, Json>;
    const summaryText = record.market_outlook || record.summary || record.portfolio_health || record.loss_lessons;
    if (typeof summaryText === "string") return summaryText;
    const tradeCount = typeof record.trade_count === "number" ? `${record.trade_count} proposed trades` : null;
    const outlook = typeof record.market_outlook === "string" ? record.market_outlook : null;
    return [outlook, tradeCount].filter(Boolean).join(" | ") || "Structured context snapshot captured.";
  }
  return "Structured context snapshot captured.";
}

function symbolsLabel(value: Json) {
  const symbols = asArray(value).map((item) => String(item)).filter(Boolean);
  if (!symbols.length) return "broad market";
  return symbols.join(", ");
}

function grossLossesSafe(grossWins: number, grossLosses: number) {
  if (!grossLosses) return grossWins > 0 ? "Infinite" : "0.00";
  return (grossWins / grossLosses).toFixed(2);
}
