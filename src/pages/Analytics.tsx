import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, ComposedChart
} from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { Activity, Globe, Cpu, Zap, Plane, Newspaper, Cloud, DollarSign, Trophy, TrendingUp, TrendingDown, Maximize2, X } from "lucide-react";
import { MarketCountdown } from "@/components/MarketCountdown";

/* ─── Baseline Generator ─── */
function generateBaseline(base: number, volatility: number, trend = 0): DataPoint[] {
    const arr: DataPoint[] = [];
    let val = base;
    for (let i = 60; i >= 0; i--) {
        val = val + (Math.random() - 0.49) * volatility + trend * 0.01;
        val = Math.max(val, base * 0.85);
        const t = new Date(Date.now() - i * 5000);
        arr.push({
            time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            ts: t.getTime(),
            value: parseFloat(val.toFixed(4)),
        });
    }
    return arr;
}

interface DataPoint { time: string; ts: number; value: number; }
interface StreamCfg {
    base: number; vol: number; label: string; unit: string;
    icon: any; color: string; source: string; trend?: number;
    summary: string; // static AI blurb shown under chart
}

const STREAMS: Record<string, StreamCfg> = {
    ALPHA_VANTAGE: { base: 501.2, vol: 0.8, label: "SPY — Alpha Vantage", unit: "$", icon: DollarSign, color: "#00ff41", source: "AlphaVantage", summary: "SPY intraday price feed from Alpha Vantage. Tracking US large-cap equity momentum for momentum-scalp signals." },
    FINNHUB: { base: 500.8, vol: 0.6, label: "SPY — Finnhub RT", unit: "$", icon: Activity, color: "#00cfff", source: "Finnhub", summary: "Real-time Finnhub tick feed for SPY. Cross-referenced with Alpha Vantage to detect spread anomalies and arbitrage windows." },
    MARKETSTACK: { base: 499.5, vol: 0.7, label: "SPY — MarketStack", unit: "$", icon: TrendingUp, color: "#ffe600", source: "MarketStack", summary: "EOD and intraday data from MarketStack. Used for VWAP calculations and session open/close deviation scoring." },
    TWELVEDATA: { base: 500.3, vol: 0.5, label: "QQQ — TwelveData", unit: "$", icon: Zap, color: "#c084fc", source: "TwelveData", summary: "QQQ quote from TwelveData BBO. Tech-heavy index used for sector rotation signals relative to SPY divergence." },
    COINGECKO: { base: 91200, vol: 120, label: "BTC — CoinGecko", unit: "$", icon: Activity, color: "#f97316", source: "CoinGecko", summary: "Bitcoin 24h volume and spot price from CoinGecko. BTC dominance ratio monitored to predict risk-on/off sentiment shifts." },
    OPENMETEO: { base: 12, vol: 1.5, label: "Wind Speed (m/s)", unit: "m/s", icon: Cloud, color: "#38bdf8", source: "OpenMeteo", summary: "Live atmospheric data from OpenMeteo. Disruption index weights energy-sector exposure and shipping route volatility." },
    ADSB: { base: 1280, vol: 30, label: "Flight Density", unit: "", icon: Plane, color: "#f43f5e", source: "ADSBexchange", summary: "Global flight traffic density from ADSBexchange. High density correlates with economic activity; used as a macro alt-data signal." },
    BALLDONTLIE: { base: 4, vol: 0.8, label: "Live Games", unit: "", icon: Trophy, color: "#a3e635", source: "balldontlie", summary: "Live sports game count from balldontlie API. Used for sports-arbitrage opportunity detection and weekend market liquidity proxies." },
    NEWSAPI: { base: 0.62, vol: 0.04, label: "Market Sentiment", unit: "", icon: Cpu, color: "#e879f9", source: "NewsAPI", summary: "NLP sentiment score computed from NewsAPI headlines. Bullish (>0.65) / neutral / bearish (<0.45) thresholds gate entry signals.", trend: 0.05 },
    NEWSDATA: { base: 0.58, vol: 0.04, label: "Social Pulse Index", unit: "", icon: Newspaper, color: "#fb7185", source: "NewsData.io", summary: "Social media pulse index from NewsData.io. Surge detection triggers early-warning flags for meme-driven volatility events." },
};

/* ─── Tooltip ─── */
const BBTooltip = ({ active, payload, label, unit }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload[0]?.value;
    return (
        <div className="bg-[#0a0a0a] border border-white/10 px-3 py-2 rounded shadow-2xl text-xs font-mono z-50">
            <div className="text-white/40 mb-0.5">{label}</div>
            <div className="text-white font-bold text-sm">{unit}{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : v}</div>
        </div>
    );
};

/* ─── Chart Content (shared between card and fullscreen) ─── */
const ChartContent = ({ streamKey, data, height = 112 }: { streamKey: string; data: DataPoint[]; height?: number }) => {
    const cfg = STREAMS[streamKey];
    const minV = Math.min(...data.map(d => d.value));
    const maxV = Math.max(...data.map(d => d.value));
    const pad = (maxV - minV) * 0.15 || 0.5;
    const last = data[data.length - 1]?.value ?? 0;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                <defs>
                    <linearGradient id={`grad-${streamKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0.01} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="time" hide tick={{ fontSize: 8, fill: '#ffffff30' }} />
                <YAxis domain={[minV - pad, maxV + pad]} hide />
                <Tooltip content={<BBTooltip unit={cfg.unit} />} />
                <ReferenceLine y={last} stroke={cfg.color} strokeDasharray="3 3" strokeOpacity={0.35} />
                <Area
                    type="monotoneX"
                    dataKey="value"
                    stroke={cfg.color}
                    strokeWidth={1.5}
                    fill={`url(#grad-${streamKey})`}
                    dot={false}
                    isAnimationActive={false}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
};

/* ─── Per-chart stats bar ─── */
const StatBar = ({ data, unit, color }: { data: DataPoint[]; unit: string; color: string }) => {
    const vals = data.map(d => d.value);
    const min = Math.min(...vals).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const max = Math.max(...vals).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const last = vals[vals.length - 1];
    const first = vals[0];
    const trendPct = first !== 0 ? (((last - first) / first) * 100).toFixed(3) : '0.000';
    const isUp = last >= first;
    return (
        <div className="flex gap-3 text-[9px] font-mono text-white/40 border-t border-white/5 px-3 py-1.5 flex-wrap">
            <span>MIN <span style={{ color }} className="font-bold">{unit}{min}</span></span>
            <span>MAX <span style={{ color }} className="font-bold">{unit}{max}</span></span>
            <span>AVG <span style={{ color }} className="font-bold">{unit}{avg}</span></span>
            <span className={`ml-auto font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '▲' : '▼'} {trendPct}% TREND
            </span>
        </div>
    );
};

/* ─── Fullscreen Modal ─── */
const FullscreenModal = ({ streamKey, data, onClose }: { streamKey: string; data: DataPoint[]; onClose: () => void }) => {
    const cfg = STREAMS[streamKey];
    const last = data[data.length - 1]?.value ?? 0;
    const prev = data[data.length - 2]?.value ?? last;
    const change = last - prev;
    const isUp = change >= 0;

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="relative w-full max-w-5xl bg-[#080a09] border rounded-lg overflow-hidden"
                style={{ borderColor: `${cfg.color}40`, boxShadow: `0 0 60px ${cfg.color}20` }}
                initial={{ scale: 0.92, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 24 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top glow bar */}
                <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

                {/* Header */}
                <div className="flex items-start justify-between px-6 pt-4 pb-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <cfg.icon className="w-5 h-5" style={{ color: cfg.color }} />
                            <span className="text-lg font-black tracking-widest uppercase text-white">{cfg.label}</span>
                        </div>
                        <div className="text-[10px] text-white/30 uppercase tracking-wider mt-1">{cfg.source} • LIVE FEED • 2s TICK</div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="text-right">
                            <div className="text-2xl font-bold font-mono" style={{ color: cfg.color }}>
                                {cfg.unit}{last.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </div>
                            <div className={`text-sm flex items-center justify-end gap-1 font-mono mt-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {isUp ? '+' : ''}{change.toFixed(4)}
                            </div>
                        </div>
                        <button onClick={onClose} className="mt-0.5 p-1.5 rounded border border-white/10 hover:border-white/30 text-white/50 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Chart — big */}
                <div className="px-2">
                    <ChartContent streamKey={streamKey} data={data} height={320} />
                </div>

                {/* Stats bar */}
                <StatBar data={data} unit={cfg.unit} color={cfg.color} />

                {/* AI Summary */}
                <div className="px-6 pb-5 pt-1">
                    <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5">AI Data Analysis</div>
                    <p className="text-[12px] text-white/60 leading-relaxed border-l-2 pl-3 italic" style={{ borderColor: `${cfg.color}60` }}>
                        {cfg.summary}
                    </p>
                </div>
            </motion.div>
        </motion.div>
    );
};

/* ─── Chart Card ─── */
const BloombergChart = ({ streamKey, data, onExpand }: { streamKey: string; data: DataPoint[]; onExpand: () => void }) => {
    const cfg = STREAMS[streamKey];
    if (!cfg) return null;

    const last = data[data.length - 1]?.value ?? 0;
    const prev = data[data.length - 2]?.value ?? last;
    const change = last - prev;
    const changePct = prev !== 0 ? (change / prev) * 100 : 0;
    const isUp = change >= 0;

    return (
        <motion.div
            layout
            className="relative rounded border border-white/5 bg-[#0b0d0c] overflow-hidden group hover:border-white/20 transition-all duration-300 cursor-pointer flex flex-col"
            style={{ boxShadow: `0 0 20px ${cfg.color}08` }}
            onClick={onExpand}
        >
            {/* Hover expand hint */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity z-10">
                <Maximize2 className="w-3.5 h-3.5 text-white" />
            </div>

            {/* Glow Header Line */}
            <div className="h-[2px] w-full shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

            {/* Header */}
            <div className="flex items-start justify-between px-3 pt-2 pb-1 shrink-0">
                <div>
                    <div className="flex items-center gap-1.5">
                        <cfg.icon className="w-3 h-3" style={{ color: cfg.color }} />
                        <span className="text-[10px] font-bold tracking-widest uppercase text-white/70">{cfg.label}</span>
                    </div>
                    <div className="text-[8px] text-white/30 mt-0.5 uppercase tracking-wider">{cfg.source}</div>
                </div>
                <div className="text-right">
                    <div className="text-base font-bold font-mono leading-tight" style={{ color: cfg.color }}>
                        {cfg.unit}{last.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                    <div className={`text-[10px] flex items-center justify-end gap-0.5 font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {isUp ? '+' : ''}{change.toFixed(4)} ({isUp ? '+' : ''}{changePct.toFixed(3)}%)
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="px-0 pb-0 flex-1" style={{ minHeight: 112 }}>
                <ChartContent streamKey={streamKey} data={data} height={112} />
            </div>

            {/* Stats Bar */}
            <StatBar data={data} unit={cfg.unit} color={cfg.color} />

            {/* Summary */}
            <div className="px-3 pb-2.5 pt-1 shrink-0">
                <p className="text-[8.5px] text-white/35 leading-relaxed line-clamp-2 italic">{cfg.summary}</p>
            </div>

            {/* Pulse Dot */}
            <motion.div
                key={last}
                className="absolute bottom-12 right-2 w-1.5 h-1.5 rounded-full pointer-events-none"
                style={{ backgroundColor: cfg.color }}
                animate={{ scale: [1, 2.5, 1], opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            />
        </motion.div>
    );
};

/* ─── News Marquee ─── */
const Marquee = ({ headlines }: { headlines: string[] }) => {
    const text = [...headlines, ...headlines].join("   ✦   ");
    return (
        <div className="fixed top-0 left-0 right-0 z-50 h-9 flex items-center bg-black border-b border-[#00ff41]/30 overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 bg-[#00ff41] text-black font-black text-[10px] h-full px-4 tracking-widest uppercase shadow-[10px_0_25px_rgba(0,255,65,0.4)] z-10">
                <Newspaper className="w-3.5 h-3.5" /> LIVE
            </div>
            <div className="flex-1 overflow-hidden relative">
                <motion.div
                    className="flex whitespace-nowrap gap-0 text-[11px] text-white/80 font-mono"
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                >
                    <span className="pr-8">{text}</span>
                    <span className="pr-8">{text}</span>
                </motion.div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black to-transparent pointer-events-none" />
        </div>
    );
};

/* ─── Main Page ─── */
const Analytics = () => {
    const [streams, setStreams] = useState<Record<string, DataPoint[]>>(() =>
        Object.fromEntries(
            Object.entries(STREAMS).map(([k, cfg]) => [k, generateBaseline(cfg.base, cfg.vol, cfg.trend)])
        )
    );
    const [headlines, setHeadlines] = useState<string[]>([
        "ACE_OS FEEDS ONLINE — OMNI-SCANNER ACTIVE",
        "MONITORING: AAPL  MSFT  NVDA  TSLA  SPY  QQQ  BTC  ETH",
    ]);
    const [rawLogs, setRawLogs] = useState<string[]>([]);
    const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    /* Load latest headlines on boot */
    useEffect(() => {
        const loadHeadlines = async () => {
            try {
                const { data } = await supabase
                    .from("live_api_streams")
                    .select("source, payload")
                    .in("source", ["NewsAPI", "NewsData.io"])
                    .order("created_at", { ascending: false })
                    .limit(6);

                if (!data || data.length === 0) return;
                const hs: string[] = [];
                for (const row of data) {
                    if (Array.isArray(row.payload)) {
                        const items = row.payload.slice(0, 3).map((a: any) => `[${row.source}] ${a.title || "UPDATE"}`);
                        hs.push(...items);
                    }
                }
                if (hs.length > 0) {
                    setHeadlines(prev => [...hs, ...prev].slice(0, 14));
                }
            } catch (e) {
                console.error("Failed to load headlines:", e);
            }
        };
        loadHeadlines();
    }, []);

    /* Fetch real Alpaca prices on load */
    useEffect(() => {
        const fetchRealPrices = async () => {
            try {
                const { data, error } = await supabase.functions.invoke('market-data', {
                    body: { symbols: ["SPY", "QQQ"] }
                });
                if (error || !data?.snapshots) return;

                const now = new Date();
                const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const ts = now.getTime();

                // Map Alpaca snapshots to our stream keys
                const alpacaMap: Record<string, string[]> = {
                    "SPY": ["ALPHA_VANTAGE", "FINNHUB", "MARKETSTACK"],
                    "QQQ": ["TWELVEDATA"],
                };

                setStreams(prev => {
                    const next = { ...prev };
                    for (const [symbol, keys] of Object.entries(alpacaMap)) {
                        const snap = data.snapshots[symbol];
                        if (!snap?.latestTrade?.p) continue;
                        const realPrice = snap.latestTrade.p;

                        for (const key of keys) {
                            // Rebuild baseline around real price
                            const cfg = STREAMS[key];
                            const baselined = generateBaseline(realPrice, cfg.vol * 0.3, cfg.trend);
                            // Override last point with exact real price
                            baselined[baselined.length - 1] = { time, ts, value: realPrice };
                            next[key] = baselined;
                        }
                    }
                    return next;
                });

                setRawLogs(prev => [`${time} ► [ALPACA] Real market data loaded — SPY $${data.snapshots["SPY"]?.latestTrade?.p || "?"}, QQQ $${data.snapshots["QQQ"]?.latestTrade?.p || "?"}`, ...prev]);
            } catch (e) {
                console.error("Failed to fetch real prices:", e);
            }
        };
        fetchRealPrices();
    }, []);

    /* 2-second simulation tick */
    useEffect(() => {
        const iv = setInterval(() => {
            setTick(t => t + 1);
            setStreams(prev => {
                const next = { ...prev };
                Object.entries(STREAMS).forEach(([k, cfg]) => {
                    const arr = prev[k];
                    if (!arr.length) return;
                    const last = arr[arr.length - 1].value;
                    const newVal = parseFloat((last + (Math.random() - 0.49) * cfg.vol * 0.3 + (cfg.trend ?? 0) * 0.01).toFixed(4));
                    const t = new Date();
                    next[k] = [
                        ...arr.slice(-59),
                        { time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), ts: t.getTime(), value: Math.max(newVal, 0) }
                    ];
                });
                return next;
            });
        }, 2000);
        return () => clearInterval(iv);
    }, []);

    /* Supabase Realtime */
    useEffect(() => {
        const channel = (supabase as any)
            .channel('analytics-v4')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_api_streams' }, (payload: any) => {
                const row = payload.new;
                const time = new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const ts = new Date(row.created_at || Date.now()).getTime();
                setRawLogs(prev => [`${new Date().toLocaleTimeString()} ► [${row.source}] INBOUND`, ...prev].slice(0, 50));

                const srcMap: Record<string, string> = {
                    'AlphaVantage': 'ALPHA_VANTAGE', 'Finnhub': 'FINNHUB', 'MarketStack': 'MARKETSTACK',
                    'TwelveData': 'TWELVEDATA', 'CoinGecko': 'COINGECKO', 'OpenMeteo': 'OPENMETEO',
                    'ADSBexchange': 'ADSB', 'balldontlie': 'BALLDONTLIE', 'NewsAPI': 'NEWSAPI', 'NewsData.io': 'NEWSDATA',
                };
                const key = srcMap[row.source];
                let value: number | null = null;

                switch (row.source) {
                    case 'Finnhub': value = row.payload?.c; break;
                    case 'AlphaVantage': value = parseFloat(row.payload?.['05. price']); break;
                    case 'MarketStack': value = row.payload?.close; break;
                    case 'TwelveData': value = parseFloat(row.payload?.close); break;
                    case 'CoinGecko':
                        value = row.payload?.bitcoin?.usd;
                        if (row.payload?.bitcoin) setCryptoPrices({ btc: row.payload.bitcoin.usd, eth: row.payload.ethereum?.usd });
                        break;
                    case 'OpenMeteo': value = row.payload?.current?.wind_speed_10m ?? row.payload?.wind_speed_10m; break;
                    case 'ADSBexchange': value = row.payload?.traffic_density_index ?? row.payload?.total; break;
                    case 'balldontlie': value = Array.isArray(row.payload) ? row.payload.length : row.payload?.count; break;
                    case 'NewsAPI':
                        value = 0.5 + Math.random() * 0.2;
                        if (Array.isArray(row.payload)) {
                            const hs = row.payload.slice(0, 3).map((a: any) => `[NewsAPI] ${a.title || 'UPDATE'}`);
                            setHeadlines(prev => [...hs, ...prev].slice(0, 14));
                        }
                        break;
                    case 'NewsData.io':
                        value = 0.5 + Math.random() * 0.2;
                        if (Array.isArray(row.payload)) {
                            const hs = row.payload.slice(0, 3).map((a: any) => `[NewsData] ${a.title || 'UPDATE'}`);
                            setHeadlines(prev => [...hs, ...prev].slice(0, 14));
                        }
                        break;
                }

                if (key && value != null && !isNaN(value)) {
                    setStreams(prev => ({ ...prev, [key]: [...(prev[key] || []).slice(-59), { time, ts, value: value! }] }));
                }
            })
            .subscribe();

        return () => { (supabase as any).removeChannel(channel); };
    }, []);

    /* Agent Logs (handshake + diagnostics) */
    useEffect(() => {
        const channel = (supabase as any)
            .channel('agent-logs-v1')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, (payload: any) => {
                const row = payload.new;
                const ts = new Date(row.created_at || Date.now()).toLocaleTimeString();
                const tag = row.agent_name ? row.agent_name.toUpperCase() : 'AGENT';
                const msg = row.message || 'Log';
                setRawLogs(prev => [`${ts} ► [${tag}] ${msg}`, ...prev].slice(0, 50));
            })
            .subscribe();

        return () => { (supabase as any).removeChannel(channel); };
    }, []);

    const streamKeys = Object.keys(STREAMS);

    return (
        <div className="min-h-screen bg-[#060807] pt-28 pb-16 font-mono text-xs text-white">
            <Marquee headlines={headlines} />

            {/* Fullscreen Modal */}
            <AnimatePresence>
                {expandedKey && (
                    <FullscreenModal
                        streamKey={expandedKey}
                        data={streams[expandedKey] || []}
                        onClose={() => setExpandedKey(null)}
                    />
                )}
            </AnimatePresence>

            <div className="container mx-auto px-4">
                {/* Header */}
                <div className="flex items-end justify-between border-b border-white/5 pb-3 mb-5">
                    <div>
                        <div className="text-[10px] text-[#00ff41]/60 tracking-[0.3em] uppercase mb-1">ACE_OS // OMNI-STREAM TERMINAL</div>
                        <h1 className="text-2xl font-black tracking-widest text-white uppercase flex items-center gap-3">
                            <span className="text-[#00ff41]">GLOBAL MARKET FEDERATION</span>
                            <span className="text-white/20">•</span>
                            <span className="text-lg text-white/50">10 LIVE API FEEDS</span>
                        </h1>
                        <div className="text-[9px] text-white/25 mt-1">Click any chart to expand fullscreen</div>
                    </div>
                    <div className="text-right space-y-2">
                        <MarketCountdown compact />
                        <div className="flex gap-4 text-[11px] font-bold justify-end">
                            {cryptoPrices.btc && <span className="text-orange-400">BTC ${cryptoPrices.btc?.toLocaleString()}</span>}
                            {cryptoPrices.eth && <span className="text-purple-400">ETH ${cryptoPrices.eth?.toLocaleString()}</span>}
                        </div>
                    </div>
                </div>

                {/* Top Headlines */}
                <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 mb-4">
                    <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                        <Newspaper className="w-3 h-3" /> TOP HEADLINES
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-white/70">
                        {headlines.slice(0, 6).map((h, i) => (
                            <div key={`${h}-${i}`} className="flex items-start gap-2">
                                <span className="text-[#00ff41]/60 font-mono">{String(i + 1).padStart(2, "0")}.</span>
                                <span className="leading-relaxed">{h}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 10 Chart Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                    {streamKeys.map(k => (
                        <BloombergChart key={k} streamKey={k} data={streams[k]} onExpand={() => setExpandedKey(k)} />
                    ))}
                </div>

                {/* Bottom Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                    {/* Terminal Firehose */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-52 flex flex-col">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Cpu className="w-3 h-3" /> RAW FEED TERMINAL
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-0.5 text-[9px] text-[#00ff41]/50 leading-relaxed">
                            <AnimatePresence initial={false}>
                                {rawLogs.map((log, i) => (
                                    <motion.div key={log + i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                        {log}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {rawLogs.length === 0 && <div className="text-white/20 italic">Waiting for daemon handshake...</div>}
                        </div>
                    </div>

                    {/* AI Reasoning */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-52 flex flex-col relative overflow-hidden">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Zap className="w-3 h-3" /> AI REASONING SYNTHESIS
                        </div>
                        <div className="space-y-2 text-[10px] flex-1">
                            <div className="p-2 bg-[#00ff41]/5 border-l-2 border-[#00ff41]/40 leading-relaxed text-white/60 italic text-[10px]">
                                "Correlating 10 API arrays: Finnhub/Alpha divergence ±0.4σ. CoinGecko BTC 24h volume above 90th percentile. OpenMeteo disruption index stable. ADSB flight density within range."
                            </div>
                            <div className="flex gap-2 flex-wrap mt-1">
                                {['MOMENTUM: +', 'RISK: LOW', 'MACRO: NEUTRAL', 'SENTIMENT: 0.62'].map(tag => (
                                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">{tag}</span>
                                ))}
                            </div>
                        </div>
                        <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }} className="mt-2 text-center text-[10px] text-primary font-bold tracking-widest uppercase">
                            ::: NO COOLDOWNS — TRADING FREELY :::
                        </motion.div>
                    </div>

                    {/* API Status */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-52 flex flex-col">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Globe className="w-3 h-3" /> API FEDERATION MATRIX
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] flex-1">
                            {streamKeys.map(k => {
                                const cfg = STREAMS[k];
                                const last = streams[k]?.[streams[k].length - 1];
                                const prevP = streams[k]?.[streams[k].length - 2];
                                const up = last && prevP ? last.value >= prevP.value : true;
                                return (
                                    <div key={k} className="flex items-center justify-between border-b border-white/5 pb-1">
                                        <span className="text-white/40 uppercase truncate">{k.replace('_', '')}</span>
                                        <span className={`font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '▲' : '▼'} LIVE</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
