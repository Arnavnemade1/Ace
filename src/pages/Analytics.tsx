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

type TooltipPayload = {
  value: number | string;
  name: string;
  color?: string;
};

const CORE_AGENT_BLUEPRINTS: AgentBlueprint[] = [
  {
    name: "Orchestrator",
    discipline: "Command",
    mandate: "Sets cycle priorities, synchronizes the swarm, and decides whether the system should commit risk or stand down.",
    method: "Combines market context, portfolio state, active signals, and recent lessons into a single operating brief.",
    output: "Cycle-level posture, trade intent, and system coordination notes.",
    statusAliases: ["Orchestrator"],
  },
  {
    name: "Market Scanner",
    discipline: "Discovery",
    mandate: "Sweeps the universe for movement, liquidity, and cross-asset anomalies.",
    method: "Ranks movers, samples symbol sets, and writes raw market context and signal counts into storage.",
    output: "Candidate symbols, scan telemetry, and feed snapshots.",
    statusAliases: ["Market Scanner", "OmniScanner"],
  },
  {
    name: "Sentiment Analyst",
    discipline: "Context",
    mandate: "Turns article flow into directional pressure and timing context.",
    method: "Reads news batches and sentiment hints, then emits mood shifts and headline-linked ideas.",
    output: "Sentiment-scored market context and news-sensitive signals.",
    statusAliases: ["Sentiment Analyst"],
  },
  {
    name: "Strategy Engine",
    discipline: "Selection",
    mandate: "Converts raw findings into actual candidate trades with conviction and framing.",
    method: "Filters for quality, ranks opportunities, and proposes the best setups for review.",
    output: "Pending trades with strategy, side, and reasoning.",
    statusAliases: ["Strategy Engine"],
  },
  {
    name: "Risk Controller",
    discipline: "Risk",
    mandate: "Protects the account before execution with caps, cooldowns, and exposure checks.",
    method: "Approves or blocks orders based on portfolio state, recent trading, and current market conditions.",
    output: "Approved execution windows, blocked orders, and capital guardrail events.",
    statusAliases: ["Risk Controller", "Risk Sentinel"],
  },
  {
    name: "Execution Agent",
    discipline: "Routing",
    mandate: "Moves approved trades into the market and keeps order state honest.",
    method: "Checks quotes, validates inventory or buying power, then routes through Alpaca.",
    output: "Executed, failed, or queued trades with broker-facing detail.",
    statusAliases: ["Execution Agent", "Order Agent"],
  },
  {
    name: "Portfolio Optimizer",
    discipline: "Allocation",
    mandate: "Reviews the current book for balance, concentration, and efficiency.",
    method: "Analyzes trade history and holdings, then suggests cleanup or rebalance actions.",
    output: "Allocation notes, Sharpe-related summaries, and rebalance proposals.",
    statusAliases: ["Portfolio Optimizer"],
  },
  {
    name: "Causal Replay",
    discipline: "Learning",
    mandate: "Replays completed trades to extract lessons and prune bad behavior.",
    method: "Runs counterfactual review across recent activity and scores potential improvement.",
    output: "Replay summaries, lessons, and patterns to retire.",
    statusAliases: ["Causal Replay", "Causal Replay Arena"],
  },
  {
    name: "Regime Oracle",
    discipline: "Regime",
    mandate: "Identifies the current market state and reshapes the roster around it.",
    method: "Measures volatility and sentiment velocity, classifies the environment, and commissions specialist personas.",
    output: "Regime labels, confidence, and adaptive team directives.",
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
    body: "Volatility is elevated enough that overshoots matter more than steady trend. The market can still move hard, but the cleaner edge often comes from letting extremes cool and fading them with discipline.",
    directive: "Reduce impulse chasing, shorten decision loops, and prioritize reversion setups with hard exits.",
  },
  "quiet-accumulation": {
    title: "Quiet Accumulation",
    body: "Price action is calm and sentiment is not lurching. This regime usually rewards patience, staggered entries, and sectors quietly building sponsorship before the market notices.",
    directive: "Favor accumulation candidates, watch for volume expansion, and avoid forcing turnover.",
  },
  "crisis-transition": {
    title: "Crisis Transition",
    body: "Sentiment is moving fast enough to change the shape of the market. Correlations can jump, narratives can break, and yesterday's playbook starts to decay under pressure.",
    directive: "Preserve optionality, tighten gross exposure, and prioritize survival over trade count.",
  },
  "commodity-supercycle": {
    title: "Commodity Supercycle",
    body: "Cross-asset pressure is rotating toward energy, resource pricing, or supply constraints. Macro and real-world data matter more than isolated chart patterns.",
    directive: "Elevate resource-linked opportunities, track disruption data, and police concentration aggressively.",
  },
};

const REGIME_TINT: Record<string, string> = {
  "low-vol-trend": "#93d24a",
  "high-vol-reversion": "#ff8362",
  "quiet-accumulation": "#74b8ff",
  "crisis-transition": "#ffd166",
  "commodity-supercycle": "#ff9f43",
};

const PIE_COLORS = ["#f4efe6", "#d8c3a5", "#9bb8d3", "#8da47e", "#d97d54", "#f2c14e"];
const LIVE_SYMBOL_PRIORITY = ["SPY", "QQQ", "BTCUSD", "XLE", "USO", "NVDA", "AAPL", "MSFT"];

function formatMoney(value: number | null | undefined, digits = 0) {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPctFromRatio(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPct(value: number | null | undefined, digits = 1) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

function formatSignedMoney(value: number | null | undefined, digits = 2) {
  const safe = Number(value ?? 0);
  const abs = Math.abs(safe);
  return `${safe >= 0 ? "+" : "-"}${formatMoney(abs, digits)}`;
}

function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value ?? 0));
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

function symbolsLabel(value: Json) {
  const symbols = asArray(value).map((item) => String(item)).filter(Boolean);
  return symbols.length > 0 ? symbols.join(", ") : "broad market";
}

function grossProfitFactor(grossWins: number, grossLosses: number) {
  if (!grossLosses) return grossWins > 0 ? "Infinite" : "--";
  return (grossWins / grossLosses).toFixed(2);
}

function summarizeSnapshot(summary: Json) {
  if (typeof summary === "string") return summary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const record = summary as Record<string, Json>;
    const summaryText = record.market_outlook || record.summary || record.portfolio_health || record.loss_lessons;
    if (typeof summaryText === "string") return summaryText;
    const tradeCount = typeof record.trade_count === "number" ? `${record.trade_count} proposed trades` : null;
    const thesis = typeof record.thesis === "string" ? record.thesis : null;
    return [thesis, tradeCount].filter(Boolean).join(" | ") || "Structured context snapshot captured.";
  }
  return "Structured context snapshot captured.";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-white/10 bg-[#0c0f10]/95 px-3 py-2 text-[11px] text-white shadow-2xl backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/40">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-6 text-white/82">
          <span>{item.name}</span>
          <span style={{ color: item.color || "#f4efe6" }}>
            {typeof item.value === "number" ? item.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-4 text-[11px] uppercase tracking-[0.32em] text-white/34">{children}</div>;
}

function MetricStatement({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="border-b border-white/8 py-5 last:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">{label}</div>
      <div
        className={cn("mt-2 font-display text-4xl tracking-tight text-[#f4efe6]", {
          "text-[#93d24a]": tone === "positive",
          "text-[#ff8362]": tone === "negative",
        })}
      >
        {value}
      </div>
      <p className="mt-3 max-w-2xl text-base leading-8 text-white/56">{detail}</p>
    </div>
  );
}

function LiveChartPanel({
  title,
  subtitle,
  value,
  delta,
  data,
  color,
  valuePrefix = "",
}: {
  title: string;
  subtitle: string;
  value: number | null;
  delta?: number | null;
  data: Array<Record<string, number | string>>;
  color: string;
  valuePrefix?: string;
}) {
  return (
    <div className="border border-white/8 bg-black/10 p-5">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.26em] text-white/28">{title}</div>
          <div className="mt-1 text-sm text-white/46">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl tracking-tight">{value === null ? "--" : `${valuePrefix}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</div>
          {delta !== undefined && delta !== null ? (
            <div className={cn("mt-1 text-sm", delta >= 0 ? "text-[#93d24a]" : "text-[#ff8362]")}>
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(2)}%
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-5 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`fill-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.38)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#fill-${title})`} name={title} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
          Promise.resolve({ data: [], error: null }), // Mocked to save quota! 
          (supabase as any).from("market_quotes").select("source, symbol, price, change_percent, as_of").order("as_of", { ascending: false }).limit(320),
          (supabase as any).from("news_articles").select("id, source, title, summary, published_at, url, sentiment_hint, symbols").order("published_at", { ascending: false }).limit(14),
          (supabase as any).from("ai_context_snapshots").select("id, agent_name, scope, summary, created_at").order("created_at", { ascending: false }).limit(40),
          (supabase as any).from("market_regimes").select("*").order("created_at", { ascending: false }).limit(18),
          (supabase as any).from("agent_lifecycles").select("*").order("spawn_time", { ascending: false }).limit(24),
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
      "market_quotes",
      "news_articles",
      "ai_context_snapshots",
      "market_regimes",
      "agent_lifecycles",
    ];

    const channels = refreshTables.map((table) =>
      supabase
        .channel(`proof-${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          load();
        })
        .subscribe(),
    );

    const interval = window.setInterval(load, 45000);

    return () => {
      alive = false;
      window.clearInterval(interval);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;

    const trades = [...data.trades].sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime());
    const executedTrades = trades.filter((trade) => trade.status === "executed");
    const closedTrades = executedTrades.filter((trade) => trade.pnl !== null);
    const wins = closedTrades.filter((trade) => Number(trade.pnl) > 0);
    const losses = closedTrades.filter((trade) => Number(trade.pnl) < 0);
    const totalRealizedPnl = closedTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const grossWins = wins.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
    const grossLosses = losses.reduce((sum, trade) => sum + Math.abs(Number(trade.pnl || 0)), 0);

    let cumulativePnl = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const startingEquity = Number(data.portfolio?.total_value ?? 100000) - Number(data.portfolio?.total_pnl ?? totalRealizedPnl);
    const equityCurve = closedTrades.map((trade) => {
      cumulativePnl += Number(trade.pnl || 0);
      peak = Math.max(peak, cumulativePnl);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulativePnl);
      return {
        label: new Date(trade.executed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Number((startingEquity + cumulativePnl).toFixed(2)),
        pnl: Number(cumulativePnl.toFixed(2)),
      };
    });

    const quoteSeriesMap = data.quotes.reduce((map, quote) => {
      if (!quote.price) return map;
      const list = map.get(quote.symbol) || [];
      list.push(quote);
      map.set(quote.symbol, list);
      return map;
    }, new Map<string, MarketQuoteRow[]>());

    const quoteSeries = Array.from(quoteSeriesMap.entries())
      .map(([symbol, rows]) => ({
        symbol,
        rows: rows
          .sort((a, b) => new Date(a.as_of).getTime() - new Date(b.as_of).getTime())
          .map((row) => ({
            label: new Date(row.as_of).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            value: Number(row.price || 0),
            raw: row,
          })),
      }))
      .filter((entry) => entry.rows.length > 1);

    const featuredSeries = LIVE_SYMBOL_PRIORITY.map((symbol) => quoteSeries.find((entry) => entry.symbol === symbol)).filter(Boolean).slice(0, 3) as Array<{
      symbol: string;
      rows: Array<{ label: string; value: number; raw: MarketQuoteRow }>;
    }>;

    const fallbackSeries =
      featuredSeries[0]?.rows ||
      quoteSeries[0]?.rows ||
      data.streams
        .slice()
        .reverse()
        .slice(-24)
        .map((stream) => ({
          label: new Date(stream.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          value: 1,
        }));

    const recentSignals = data.signals.filter((signal) => Date.now() - new Date(signal.created_at).getTime() < 1000 * 60 * 60 * 24 * 7);
    const signalStrengthByDay = Array.from(
      recentSignals.reduce((map, signal) => {
        const label = new Date(signal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const current = map.get(label) || { label, strengthTotal: 0, count: 0, acted: 0 };
        current.strengthTotal += Number(signal.strength || 0);
        current.count += 1;
        current.acted += signal.acted_on ? 1 : 0;
        map.set(label, current);
        return map;
      }, new Map<string, { label: string; strengthTotal: number; count: number; acted: number }>()),
    )
      .map(([, value]) => ({
        label: value.label,
        value: Number((value.strengthTotal / Math.max(1, value.count)).toFixed(2)),
        actedRate: Number(((value.acted / Math.max(1, value.count)) * 100).toFixed(1)),
      }))
      .slice(-8);

    const activityBuckets = new Map<string, { label: string; streams: number; logs: number; signals: number; trades: number }>();

    const addBucket = (dateString: string, field: "streams" | "logs" | "signals" | "trades") => {
      const date = new Date(dateString);
      const key = `${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      const existing = activityBuckets.get(key) || {
        label: date.toLocaleTimeString("en-US", { hour: "numeric" }),
        streams: 0,
        logs: 0,
        signals: 0,
        trades: 0,
      };
      existing[field] += 1;
      activityBuckets.set(key, existing);
    };

    data.streams.slice(0, 120).forEach((row) => addBucket(row.created_at, "streams"));
    data.logs.slice(0, 120).forEach((row) => addBucket(row.created_at, "logs"));
    data.signals.slice(0, 120).forEach((row) => addBucket(row.created_at, "signals"));
    data.trades.slice(0, 120).forEach((row) => addBucket(row.executed_at, "trades"));

    const activitySeries = Array.from(activityBuckets.values())
      .slice(-12)
      .map((row) => ({
        label: row.label,
        streams: row.streams,
        logs: row.logs,
        signals: row.signals,
        trades: row.trades,
        value: row.streams + row.logs + row.signals + row.trades,
      }));

    const statusCounts = data.agentState.reduce(
      (acc, row) => {
        const status = row.status.toLowerCase();
        if (status === "active") acc.active += 1;
        else if (status === "learning") acc.learning += 1;
        else if (status === "error") acc.error += 1;
        else acc.idle += 1;
        return acc;
      },
      { active: 0, learning: 0, idle: 0, error: 0 },
    );

    const agentStatePie = [
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
        value: Number((row.confidence * 100).toFixed(1)),
      }));

    const latestQuotes = Array.from(
      data.quotes.reduce((map, quote) => {
        if (!map.has(quote.symbol)) map.set(quote.symbol, quote);
        return map;
      }, new Map<string, MarketQuoteRow>()),
    )
      .map(([, quote]) => quote)
      .sort((a, b) => LIVE_SYMBOL_PRIORITY.indexOf(a.symbol) - LIVE_SYMBOL_PRIORITY.indexOf(b.symbol))
      .slice(0, 8);

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
      .slice(0, 5);

    const latestSnapshotByAgent = Array.from(
      data.snapshots.reduce((map, snap) => {
        if (!map.has(snap.agent_name)) map.set(snap.agent_name, snap);
        return map;
      }, new Map<string, SnapshotRow>()),
    ).map(([, snap]) => snap);

    const coreAgents = CORE_AGENT_BLUEPRINTS.map((blueprint) => {
      const state = data.agentState.find((row) => blueprint.statusAliases.includes(row.agent_name));
      const latestLog = data.logs.find((row) => blueprint.statusAliases.includes(row.agent_name));
      const latestSnapshot = latestSnapshotByAgent.find((row) => blueprint.statusAliases.includes(row.agent_name));
      return { ...blueprint, state, latestLog, latestSnapshot };
    });

    return {
      executedTrades,
      closedTrades,
      wins,
      losses,
      totalRealizedPnl,
      grossWins,
      grossLosses,
      maxDrawdown,
      equityCurve,
      featuredSeries,
      fallbackSeries,
      signalStrengthByDay,
      activitySeries,
      latestRegime,
      regimeHistory,
      latestQuotes,
      feedFreshness,
      topSymbols,
      coreAgents,
      activePersonas: data.lifecycles.filter((row) => row.status !== "retired").slice(0, 6),
      retiredPersonas: data.lifecycles.filter((row) => row.status === "retired").slice(0, 4),
      latestNews: data.news.slice(0, 6),
      latestSnapshots: data.snapshots.slice(0, 4),
      latestLogs: data.logs.slice(0, 10),
      statusCounts,
      agentStatePie,
      signalConversionRate: recentSignals.length > 0 ? recentSignals.filter((signal) => signal.acted_on).length / recentSignals.length : null,
      executionRate: trades.length > 0 ? executedTrades.length / trades.length : null,
      replayImprovement:
        data.replayResults.length > 0
          ? data.replayResults.reduce((sum, replay) => sum + Number(replay.improvement_score || 0), 0) / data.replayResults.length
          : null,
      avgSignalStrength:
        recentSignals.length > 0
          ? recentSignals.reduce((sum, signal) => sum + Number(signal.strength || 0), 0) / recentSignals.length
          : null,
      recentSignalCount: recentSignals.length,
      hasClosedTrades: closedTrades.length > 0,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#101312] px-6 pt-36 text-[#f4efe6]">
        <div className="mx-auto max-w-[92rem] border-t border-white/10 pt-6">
          <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">Proof Dashboard</div>
          <div className="mt-8 font-display text-5xl tracking-tight">Loading live evidence...</div>
        </div>
      </div>
    );
  }

  if (error || !data || !model) {
    return (
      <div className="min-h-screen bg-[#101312] px-6 pt-36 text-[#f4efe6]">
        <div className="mx-auto max-w-[92rem] border-t border-white/10 pt-6">
          <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">Proof Dashboard</div>
          <div className="mt-8 max-w-3xl font-display text-4xl tracking-tight">The analytics surface could not be assembled from live data.</div>
          <p className="mt-4 text-white/60">{error || "Unknown analytics error"}</p>
        </div>
      </div>
    );
  }

  const regimeMeta = model.latestRegime ? REGIME_COPY[model.latestRegime.regime_type] : null;
  const regimeTint = model.latestRegime ? REGIME_TINT[model.latestRegime.regime_type] || "#f4efe6" : "#f4efe6";
  const proofHeadline = model.hasClosedTrades
    ? {
        label: "Realized P&L",
        value: formatSignedMoney(model.totalRealizedPnl),
        detail: "Computed from executed trades with non-null P&L. This is realized outcome, not animated filler.",
        tone: model.totalRealizedPnl >= 0 ? "positive" as const : "negative" as const,
      }
    : {
        label: "Portfolio P&L",
        value: formatSignedMoney(data.portfolio?.total_pnl ?? data.portfolio?.daily_pnl ?? 0),
        detail: "No closed round trips are recorded yet, so the page falls back to current portfolio-level performance instead of pretending 0% is informative.",
        tone: Number(data.portfolio?.total_pnl ?? data.portfolio?.daily_pnl ?? 0) >= 0 ? "positive" as const : "negative" as const,
      };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#101312] text-[#f4efe6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(206,172,114,0.1),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(107,138,177,0.14),transparent_24%),linear-gradient(180deg,#101312_0%,#0b0d0d_100%)]" />

      <main className="relative z-10 px-6 pb-24 pt-32">
        <div className="mx-auto max-w-[92rem]">
          <section className="border-t border-white/10 pt-6">
            <div className="grid gap-10 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/35">Proof Dashboard</div>
                <h1 className="mt-6 max-w-6xl font-display text-5xl leading-[0.92] tracking-[-0.05em] md:text-7xl">
                  Live proof, cleaner hierarchy, and enough motion to feel alive without faking the numbers.
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-white/58">
                  This surface now leans on actual trades, quote captures, signal flow, regime history, logs, and replay studies. When one proof track is sparse, the layout pivots to another real one instead of collapsing into meaningless zeros.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Live Equity</div>
                  <div className="mt-3 font-display text-4xl tracking-tight">{formatMoney(data.portfolio?.total_value ?? data.portfolio?.equity ?? 0)}</div>
                  <div className="mt-3 text-sm text-white/48">Account-level value pulled from `portfolio_state`.</div>
                </div>
                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Executed Trades</div>
                  <div className="mt-3 font-display text-4xl tracking-tight">{model.executedTrades.length}</div>
                  <div className="mt-3 text-sm text-white/48">Recorded executions across the current trade history.</div>
                </div>
                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Recent Signals</div>
                  <div className="mt-3 font-display text-4xl tracking-tight">{model.recentSignalCount}</div>
                  <div className="mt-3 text-sm text-white/48">Last 7 days of signal generation, not synthetic placeholders.</div>
                </div>
                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Active Agents</div>
                  <div className="mt-3 font-display text-4xl tracking-tight">{model.statusCounts.active + model.statusCounts.learning}</div>
                  <div className="mt-3 text-sm text-white/48">Agents currently active or learning from the live `agent_state` table.</div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-14 grid gap-4 xl:grid-cols-3">
            {model.featuredSeries.map((series, index) => {
              const last = series.rows[series.rows.length - 1];
              const delta = Number(last.raw.change_percent ?? 0);
              const colors = ["#d8c3a5", "#9bb8d3", "#93d24a"];
              return (
                <LiveChartPanel
                  key={series.symbol}
                  title={series.symbol}
                  subtitle={`live quote tape from ${timeAgo(last.raw.as_of)}`}
                  value={last.value}
                  delta={delta}
                  valuePrefix="$"
                  data={series.rows.map(({ label, value }) => ({ label, value }))}
                  color={colors[index % colors.length]}
                />
              );
            })}
            {model.featuredSeries.length < 3 ? (
              <LiveChartPanel
                title="System Activity"
                subtitle="signals, logs, streams, and trades"
                value={model.activitySeries.reduce((sum, row) => sum + row.value, 0)}
                data={model.activitySeries}
                color="#f2c14e"
              />
            ) : null}
          </section>

          <section className="mt-20 grid gap-8 xl:grid-cols-[0.58fr_0.42fr]">
            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Performance Proof</SectionLabel>
              <div className="grid gap-8 xl:grid-cols-[0.56fr_0.44fr]">
                <div>
                  <MetricStatement label={proofHeadline.label} value={proofHeadline.value} detail={proofHeadline.detail} tone={proofHeadline.tone} />
                  <MetricStatement
                    label={model.hasClosedTrades ? "Win Rate" : "Execution Readiness"}
                    value={model.hasClosedTrades ? formatPctFromRatio(model.wins.length / Math.max(1, model.closedTrades.length)) : formatPctFromRatio(model.executionRate)}
                    detail={
                      model.hasClosedTrades
                        ? `${model.wins.length} winning closes against ${model.losses.length} losing closes in the recorded trade set.`
                        : "Until the system has closed trades, execution rate is a better proof signal than a fake 0.0% win rate."
                    }
                  />
                  <MetricStatement
                    label={model.hasClosedTrades ? "Profit Factor" : "Signal Conversion"}
                    value={model.hasClosedTrades ? grossProfitFactor(model.grossWins, model.grossLosses) : formatPctFromRatio(model.signalConversionRate)}
                    detail={
                      model.hasClosedTrades
                        ? "Gross winning dollars divided by gross losing dollars. Higher means the system extracts more from winners than it leaks on losers."
                        : "Share of recent signals that moved into action. Useful while the book is still building realized history."
                    }
                  />
                  <MetricStatement
                    label={model.hasClosedTrades ? "Observed Max Drawdown" : "Replay Improvement"}
                    value={model.hasClosedTrades ? formatMoney(model.maxDrawdown) : model.replayImprovement === null ? "--" : `${model.replayImprovement.toFixed(1)}%`}
                    tone={model.hasClosedTrades && model.maxDrawdown > 0 ? "negative" : "default"}
                    detail={
                      model.hasClosedTrades
                        ? "Measured from the realized P&L curve reconstructed from closed trades."
                        : "Average improvement score from replay studies. When realized history is thin, learning quality matters more than pretending there is performance depth."
                    }
                  />
                </div>

                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="flex items-end justify-between gap-6">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">
                        {model.hasClosedTrades ? "Realized Equity Curve" : "Macro Tape Proxy"}
                      </div>
                      <p className="mt-3 max-w-xl text-base leading-8 text-white/56">
                        {model.hasClosedTrades
                          ? "Each point advances only when a closed trade exists in the database. If the system is patient, the line stays sparse."
                          : "There are no closed round trips yet, so this panel switches to real quote history instead of leaving the chart blank."}
                      </p>
                    </div>
                    <div className="text-right text-[11px] uppercase tracking-[0.24em] text-white/30">
                      {model.hasClosedTrades ? `${model.closedTrades.length} closed trades` : `${model.fallbackSeries.length} captured points`}
                    </div>
                  </div>

                  <div className="mt-6 h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={model.hasClosedTrades ? model.equityCurve : model.fallbackSeries}>
                        <defs>
                          <linearGradient id="heroEquityFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d8c3a5" stopOpacity={0.42} />
                            <stop offset="100%" stopColor="#d8c3a5" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }}
                          tickFormatter={(value) => `${model.hasClosedTrades ? "$" : ""}${formatCompact(value)}`}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#f4efe6"
                          strokeWidth={2}
                          fill="url(#heroEquityFill)"
                          name={model.hasClosedTrades ? "Equity" : "Price"}
                        />
                        {model.hasClosedTrades ? <Line type="monotone" dataKey="pnl" stroke="#93d24a" strokeWidth={1.5} dot={false} name="Cum P&L" /> : null}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <SectionLabel>Live System Motion</SectionLabel>
              <div className="space-y-6">
                <div className="border border-white/8 bg-black/10 p-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Activity Cadence</div>
                      <p className="mt-3 text-base leading-8 text-white/56">This is the live pulse of the system: streams, logs, signals, and trades landing over time.</p>
                    </div>
                    <div className="font-display text-4xl tracking-tight">{model.activitySeries.reduce((sum, row) => sum + row.value, 0)}</div>
                  </div>
                  <div className="mt-5 h-[210px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={model.activitySeries}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="streams" stroke="#d8c3a5" strokeWidth={2} dot={false} name="Streams" />
                        <Line type="monotone" dataKey="signals" stroke="#93d24a" strokeWidth={2} dot={false} name="Signals" />
                        <Line type="monotone" dataKey="logs" stroke="#9bb8d3" strokeWidth={2} dot={false} name="Logs" />
                        <Line type="monotone" dataKey="trades" stroke="#f2c14e" strokeWidth={2} dot={false} name="Trades" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border border-white/8 bg-black/10 p-5">
                    <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Average Signal Strength</div>
                    <div className="mt-3 font-display text-4xl tracking-tight">{model.avgSignalStrength === null ? "--" : model.avgSignalStrength.toFixed(2)}</div>
                    <div className="mt-4 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={model.signalStrengthByDay}>
                          <defs>
                            <linearGradient id="strengthFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#9bb8d3" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#9bb8d3" stopOpacity={0.04} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="label" hide />
                          <YAxis hide />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="value" stroke="#9bb8d3" strokeWidth={2} fill="url(#strengthFill)" name="Strength" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="border border-white/8 bg-black/10 p-5">
                    <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Agent State Mix</div>
                    <div className="mt-2 h-[170px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={model.agentStatePie} innerRadius={42} outerRadius={70} paddingAngle={4} dataKey="value">
                            {model.agentStatePie.map((entry, index) => (
                              <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-white/62">
                      {model.agentStatePie.map((entry, index) => (
                        <div key={entry.name} className="flex items-center justify-between border-b border-white/8 pb-2">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
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
            <div className="grid gap-10 xl:grid-cols-[0.52fr_0.48fr]">
              <div className="grid gap-6 lg:grid-cols-[0.62fr_0.38fr]">
                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/30">Current State</div>
                  <div className="mt-4 font-display text-5xl tracking-tight" style={{ color: regimeTint }}>
                    {regimeMeta?.title || "No regime captured yet"}
                  </div>
                  <div className="mt-3 text-xl text-white/60">
                    {model.latestRegime ? `${(model.latestRegime.confidence * 100).toFixed(1)}% confidence` : "Waiting on regime data"}
                  </div>
                  <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
                    {regimeMeta?.body || "Once the Oracle records a regime, this space will describe how the swarm should behave in it."}
                  </p>
                  <div className="mt-8 border-l border-white/12 pl-5">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Directive</div>
                    <p className="mt-2 text-base leading-8 text-white/74">{regimeMeta?.directive || "No live directive yet."}</p>
                  </div>
                </div>

                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Live Quote Tape</div>
                  <div className="mt-5 space-y-4">
                    {model.latestQuotes.map((quote) => (
                      <div key={`${quote.symbol}-${quote.source}`} className="flex items-end justify-between border-b border-white/8 pb-3">
                        <div>
                          <div className="font-display text-2xl tracking-tight">{quote.symbol}</div>
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/32">{quote.source}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl">{formatMoney(quote.price, 2)}</div>
                          <div className={cn("text-sm", Number(quote.change_percent || 0) >= 0 ? "text-[#93d24a]" : "text-[#ff8362]")}>
                            {Number(quote.change_percent || 0) >= 0 ? "+" : ""}
                            {Number(quote.change_percent || 0).toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="mb-4 flex items-end justify-between">
                    <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Regime Confidence History</div>
                    <div className="text-[11px] text-white/40">{model.regimeHistory.length} observations</div>
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={model.regimeHistory}>
                        <defs>
                          <linearGradient id="regimeFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={regimeTint} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={regimeTint} stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "rgba(244,239,230,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="value" stroke={regimeTint} strokeWidth={2} fill="url(#regimeFill)" name="Confidence %" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Feed Freshness</div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {model.feedFreshness.map((feed) => (
                      <div key={feed.source} className="border-b border-white/8 pb-3">
                        <div className="font-medium text-white/80">{feed.source}</div>
                        <div className="mt-1 text-sm text-white/46">{timeAgo(feed.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Agent Briefing</SectionLabel>
            <div className="grid gap-8">
              <div className="grid gap-8 xl:grid-cols-[0.42fr_0.58fr]">
                <h2 className="max-w-3xl font-display text-4xl tracking-tight">Every core agent gets the full width it needs instead of being squeezed into a sidebar.</h2>
                <p className="max-w-3xl text-lg leading-8 text-white/58">
                  Each role below carries a mandate, method, output, and the latest live state or log context when it exists. The point is to make the system legible without drowning the page in dead text.
                </p>
              </div>

              <div className="space-y-6">
                {model.coreAgents.map((agent, index) => (
                  <motion.article
                    key={agent.name}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="border border-white/8 bg-black/10 p-6"
                  >
                    <div className="grid gap-6 xl:grid-cols-[0.22fr_0.78fr]">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">{agent.discipline}</div>
                        <div className="mt-3 font-display text-3xl tracking-tight">{agent.name}</div>
                        <div className="mt-4 text-sm text-white/44">
                          {agent.state ? `${agent.state.status} • ${timeAgo(agent.state.updated_at)}` : "No current status row"}
                        </div>
                      </div>
                      <div className="grid gap-6 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Mandate</div>
                          <p className="mt-3 text-base leading-8 text-white/72">{agent.mandate}</p>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Method</div>
                          <p className="mt-3 text-base leading-8 text-white/72">{agent.method}</p>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Output</div>
                          <p className="mt-3 text-base leading-8 text-white/72">{agent.output}</p>
                          {agent.latestLog ? <div className="mt-4 border-l border-white/12 pl-4 text-sm leading-7 text-white/54">Latest: {agent.latestLog.message}</div> : null}
                          {agent.latestSnapshot ? (
                            <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/30">
                              Snapshot {agent.latestSnapshot.scope} • {timeAgo(agent.latestSnapshot.created_at)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Dynamic Roster</SectionLabel>
            <div className="grid gap-8 xl:grid-cols-[0.62fr_0.38fr]">
              <div className="space-y-6">
                <div className="max-w-3xl">
                  <h2 className="font-display text-4xl tracking-tight">Specialist personas commissioned by the regime engine.</h2>
                  <p className="mt-5 text-lg leading-8 text-white/58">
                    These are the adaptive agents the system spawns for the current market state. Their missions, deliverables, and retirements come from lifecycle records rather than static copy.
                  </p>
                </div>
                {model.activePersonas.map((agent) => (
                  <article key={agent.id} className="border border-white/8 bg-black/10 p-6">
                    <div className="grid gap-6 xl:grid-cols-[0.26fr_0.74fr]">
                      <div>
                        <div className="font-display text-3xl tracking-tight">{agent.persona}</div>
                        <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/34">
                          {agent.specialization || "Adaptive ops"} • {agent.regime_affinity.replace(/-/g, " ")}
                        </div>
                        <div className="mt-4 text-sm text-white/44">spawned {timeAgo(agent.spawn_time)}</div>
                      </div>
                      <div className="grid gap-6 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Mission</div>
                          <p className="mt-3 text-base leading-8 text-white/74">{summarizeTask(agent.task)}</p>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Deliverable</div>
                          <p className="mt-3 text-base leading-8 text-white/74">{extractTaskField(agent.task, "Deliverable") || "No explicit deliverable captured."}</p>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Success / Handoff</div>
                          <p className="mt-3 text-base leading-8 text-white/74">{extractTaskField(agent.task, "Success") || "No success metric captured."}</p>
                          <p className="mt-3 text-base leading-8 text-white/50">Handoff: {extractTaskField(agent.task, "Handoff") || "Orchestrator"}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="space-y-6">
                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Recent Retirements</div>
                  <div className="mt-5 space-y-4">
                    {model.retiredPersonas.length === 0 ? (
                      <div className="text-white/45">No retired personas recorded yet.</div>
                    ) : (
                      model.retiredPersonas.map((agent) => (
                        <div key={agent.id} className="border-b border-white/8 pb-4 last:border-b-0">
                          <div className="font-display text-2xl tracking-tight">{agent.persona}</div>
                          <div className="mt-2 text-base leading-8 text-white/54">{agent.death_reason || "Retired at the end of its cycle."}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/30">
                            {agent.regime_affinity.replace(/-/g, " ")} • retired {timeAgo(agent.death_time || agent.spawn_time)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-white/8 bg-black/10 p-6">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Latest Intelligence Notes</div>
                  <div className="mt-5 space-y-4">
                    {model.latestSnapshots.map((snapshot) => (
                      <div key={snapshot.id} className="border-b border-white/8 pb-4 last:border-b-0">
                        <div className="flex items-center justify-between gap-4">
                          <div className="font-medium text-white/78">{snapshot.agent_name}</div>
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">
                            {snapshot.scope} • {timeAgo(snapshot.created_at)}
                          </div>
                        </div>
                        <p className="mt-3 text-base leading-8 text-white/56">{summarizeSnapshot(snapshot.summary)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 border-t border-white/10 pt-6">
            <SectionLabel>Market Context</SectionLabel>
            <div className="grid gap-8 xl:grid-cols-[0.54fr_0.46fr]">
              <div className="border border-white/8 bg-black/10 p-6">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Recent Articles</div>
                <div className="mt-5 space-y-6">
                  {model.latestNews.map((article) => (
                    <article key={article.id} className="border-b border-white/8 pb-5 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-white/30">
                        <span>{article.source}</span>
                        <span>{timeAgo(article.published_at)}</span>
                        {article.sentiment_hint !== null ? (
                          <span className={cn(Number(article.sentiment_hint) >= 0 ? "text-[#93d24a]" : "text-[#ff8362]")}>
                            sentiment {Number(article.sentiment_hint).toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 max-w-4xl font-display text-3xl tracking-tight">{article.title}</h3>
                      <p className="mt-3 max-w-4xl text-base leading-8 text-white/58">{article.summary || "No summary captured for this article."}</p>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/30">symbols {symbolsLabel(article.symbols)}</div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="border border-white/8 bg-black/10 p-6">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Decision Stream</div>
                <div className="mt-5 space-y-4">
                  {model.latestLogs.map((log) => (
                    <div key={log.id} className="border-b border-white/8 pb-4 last:border-b-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/30">{log.agent_name}</div>
                        <div className="text-sm text-white/42">{timeAgo(log.created_at)}</div>
                      </div>
                      <div className="mt-3 text-lg text-white/84">{log.message}</div>
                      {log.reasoning ? <div className="mt-2 text-base leading-8 text-white/52">{log.reasoning}</div> : null}
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
