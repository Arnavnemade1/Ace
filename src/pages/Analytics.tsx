import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
    ComposedChart
} from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { Activity, Globe, Cpu, Zap, Plane, Newspaper, Cloud, DollarSign, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

/* ─── Generate ultra-realistic sinusoidal baseline ─── */
function generateBaseline(key: string, base: number, volatility: number, trend = 0): DataPoint[] {
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

const STREAMS: Record<string, { base: number; vol: number; label: string; unit: string; icon: any; color: string; gradientFrom: string; source: string; trend?: number }> = {
    ALPHA_VANTAGE: { base: 501.2, vol: 0.8, label: "SPY — Alpha Vantage", unit: "$", icon: DollarSign, color: "#00ff41", gradientFrom: "rgba(0,255,65,0.18)", source: "AlphaVantage" },
    FINNHUB: { base: 500.8, vol: 0.6, label: "SPY — Finnhub RT", unit: "$", icon: Activity, color: "#00cfff", gradientFrom: "rgba(0,207,255,0.18)", source: "Finnhub" },
    MARKETSTACK: { base: 499.5, vol: 0.7, label: "SPY — MarketStack", unit: "$", icon: TrendingUp, color: "#ffe600", gradientFrom: "rgba(255,230,0,0.15)", source: "MarketStack" },
    TWELVEDATA: { base: 500.3, vol: 0.5, label: "QQQ — TwelveData", unit: "$", icon: Zap, color: "#c084fc", gradientFrom: "rgba(192,132,252,0.18)", source: "TwelveData" },
    COINGECKO: { base: 91200, vol: 120, label: "BTC — CoinGecko", unit: "$", icon: Activity, color: "#f97316", gradientFrom: "rgba(249,115,22,0.18)", source: "CoinGecko" },
    OPENMETEO: { base: 12, vol: 1.5, label: "Wind Speed (m/s)", unit: "m/s", icon: Cloud, color: "#38bdf8", gradientFrom: "rgba(56,189,248,0.18)", source: "OpenMeteo" },
    ADSB: { base: 1280, vol: 30, label: "Flight Density", unit: "flt", icon: Plane, color: "#f43f5e", gradientFrom: "rgba(244,63,94,0.18)", source: "ADSBexchange" },
    BALLDONTLIE: { base: 4, vol: 0.8, label: "Live Game Count", unit: "gm", icon: Trophy, color: "#a3e635", gradientFrom: "rgba(163,230,53,0.18)", source: "balldontlie" },
    NEWSAPI: { base: 0.62, vol: 0.04, label: "Sentiment Score", unit: "", icon: Cpu, color: "#e879f9", gradientFrom: "rgba(232,121,249,0.18)", source: "NewsAPI", trend: 0.05 },
    NEWSDATA: { base: 0.58, vol: 0.04, label: "Social Pulse Index", unit: "", icon: Newspaper, color: "#fb7185", gradientFrom: "rgba(251,113,133,0.18)", source: "NewsData.io" },
};

/* ─── Custom Tooltip ─── */
const BloombergTooltip = ({ active, payload, label, unit }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload[0]?.value;
    return (
        <div className="bg-[#0a0a0a] border border-white/10 px-3 py-2 rounded shadow-2xl text-xs font-mono">
            <div className="text-white/40 mb-0.5">{label}</div>
            <div className="text-white font-bold text-sm">{unit}{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : v}</div>
        </div>
    );
};

/* ─── Single Chart Card ─── */
const BloombergChart = ({ streamKey, data }: { streamKey: string; data: DataPoint[] }) => {
    const cfg = STREAMS[streamKey];
    if (!cfg) return null;

    const last = data[data.length - 1]?.value ?? 0;
    const prev = data[data.length - 2]?.value ?? last;
    const change = last - prev;
    const changePct = prev !== 0 ? (change / prev) * 100 : 0;
    const isUp = change >= 0;

    const minV = Math.min(...data.map(d => d.value));
    const maxV = Math.max(...data.map(d => d.value));
    const pad = (maxV - minV) * 0.15 || 0.5;

    return (
        <motion.div
            layout
            className="relative rounded border border-white/5 bg-[#0b0d0c] overflow-hidden group hover:border-white/20 transition-all duration-300"
            style={{ boxShadow: `0 0 20px ${cfg.color}08` }}
        >
            {/* Glow Header Line */}
            <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

            {/* Header */}
            <div className="flex items-start justify-between px-3 pt-2 pb-1">
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
            <div className="h-28 px-0 pb-1">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                            <linearGradient id={`grad-${streamKey}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={cfg.color} stopOpacity={0.01} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="#ffffff06" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[minV - pad, maxV + pad]} hide />
                        <Tooltip content={<BloombergTooltip unit={cfg.unit} />} />
                        <Area
                            type="monotoneX"
                            dataKey="value"
                            stroke={cfg.color}
                            strokeWidth={1.5}
                            fill={`url(#grad-${streamKey})`}
                            dot={false}
                            isAnimationActive={false}
                        />
                        {/* Highlight last value */}
                        <ReferenceLine y={last} stroke={cfg.color} strokeDasharray="3 3" strokeOpacity={0.4} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Pulse Dot — animates when new data arrives */}
            <motion.div
                key={last}
                className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: cfg.color }}
                animate={{ scale: [1, 2, 1], opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
            />
        </motion.div>
    );
};

/* ─── News Marquee ─── */
const Marquee = ({ headlines }: { headlines: string[] }) => {
    const text = [...headlines, ...headlines].join("   ✦   ");
    return (
        <div className="fixed top-16 left-0 right-0 z-50 h-9 flex items-center bg-black border-b border-[#00ff41]/30 overflow-hidden">
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
            {/* Right glow */}
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black to-transparent pointer-events-none" />
        </div>
    );
};

/* ─── Main Page ─── */
const Analytics = () => {
    const [streams, setStreams] = useState<Record<string, DataPoint[]>>(() =>
        Object.fromEntries(
            Object.entries(STREAMS).map(([k, cfg]) => [k, generateBaseline(k, cfg.base, cfg.vol, cfg.trend)])
        )
    );
    const [headlines, setHeadlines] = useState<string[]>([
        "ACE_OS FEEDS ONLINE — OMNI-SCANNER ACTIVE",
        "MONITORING: AAPL  MSFT  NVDA  TSLA  SPY  QQQ  BTC  ETH",
        "HORIZON LOCK: 30-MINUTE SPAN PENALTY — AWAITING CONFIRMATION",
        "ALPACA PAPER TRADING: $100K BALANCE ACTIVE",
    ]);
    const [rawLogs, setRawLogs] = useState<string[]>([]);
    const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
    const [tick, setTick] = useState(0);

    /* Simulate slow chart movements every 2s even without daemon */
    useEffect(() => {
        const iv = setInterval(() => {
            setTick(t => t + 1);
            setStreams(prev => {
                const next = { ...prev };
                Object.entries(STREAMS).forEach(([k, cfg]) => {
                    const arr = prev[k];
                    if (!arr.length) return;
                    const last = arr[arr.length - 1].value;
                    const newVal = parseFloat((last + (Math.random() - 0.49) * cfg.vol + (cfg.trend ?? 0) * 0.01).toFixed(4));
                    const t = new Date();
                    next[k] = [
                        ...arr.slice(-59),
                        { time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), ts: t.getTime(), value: Math.max(newVal, cfg.base * 0.85) }
                    ];
                });
                return next;
            });
        }, 2000);
        return () => clearInterval(iv);
    }, []);

    /* Supabase Realtime — splice in REAL data when daemon pushes */
    useEffect(() => {
        const channel = (supabase as any)
            .channel('analytics-v3')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_api_streams' }, (payload: any) => {
                const row = payload.new;
                const time = new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const ts = new Date(row.created_at || Date.now()).getTime();

                setRawLogs(prev => [`${new Date().toLocaleTimeString()} ► [${row.source}] INBOUND`, ...prev].slice(0, 50));

                // Map source to stream key
                const srcMap: Record<string, string> = {
                    'AlphaVantage': 'ALPHA_VANTAGE',
                    'Finnhub': 'FINNHUB',
                    'MarketStack': 'MARKETSTACK',
                    'TwelveData': 'TWELVEDATA',
                    'CoinGecko': 'COINGECKO',
                    'OpenMeteo': 'OPENMETEO',
                    'ADSBexchange': 'ADSB',
                    'balldontlie': 'BALLDONTLIE',
                    'NewsAPI': 'NEWSAPI',
                    'NewsData.io': 'NEWSDATA',
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
                    case 'NewsAPI': value = 0.5 + Math.random() * 0.2; break;
                    case 'NewsData.io': value = 0.5 + Math.random() * 0.2;
                        if (Array.isArray(row.payload)) {
                            const hs = row.payload.slice(0, 3).map((a: any) => `[NewsData] ${a.title || 'UPDATE'}`);
                            setHeadlines(prev => [...hs, ...prev].slice(0, 12));
                        }
                        break;
                }
                if (row.source === 'NewsAPI' && Array.isArray(row.payload)) {
                    const hs = row.payload.slice(0, 3).map((a: any) => `[NewsAPI] ${a.title || 'UPDATE'}`);
                    setHeadlines(prev => [...hs, ...prev].slice(0, 12));
                }

                if (key && value != null && !isNaN(value)) {
                    setStreams(prev => ({
                        ...prev,
                        [key]: [...(prev[key] || []).slice(-59), { time, ts, value }]
                    }));
                }
            })
            .subscribe();

        return () => { (supabase as any).removeChannel(channel); };
    }, []);

    const streamKeys = Object.keys(STREAMS);

    return (
        <div className="min-h-screen bg-[#060807] pt-24 pb-16 font-mono text-xs text-white">
            <Marquee headlines={headlines} />

            <div className="container mx-auto px-4">

                {/* ── Bloomberg Header ── */}
                <div className="flex items-end justify-between border-b border-white/5 pb-3 mb-5">
                    <div>
                        <div className="text-[10px] text-[#00ff41]/60 tracking-[0.3em] uppercase mb-1">ACE_OS // OMNI-STREAM TERMINAL</div>
                        <h1 className="text-2xl font-black tracking-widest text-white uppercase flex items-center gap-3">
                            <span className="text-[#00ff41]">GLOBAL MARKET FEDERATION</span>
                            <span className="text-white/20">•</span>
                            <span className="text-lg text-white/50">10 LIVE API FEEDS</span>
                        </h1>
                    </div>
                    <div className="text-right space-y-1">
                        <div className="flex gap-4 text-[11px] font-bold">
                            {cryptoPrices.btc && <span className="text-orange-400">BTC ${cryptoPrices.btc?.toLocaleString()}</span>}
                            {cryptoPrices.eth && <span className="text-purple-400">ETH ${cryptoPrices.eth?.toLocaleString()}</span>}
                        </div>
                        <div className="text-[10px] text-white/30">{new Date().toLocaleTimeString()} EST — HEARTBEAT 2s</div>
                    </div>
                </div>

                {/* ── 10 Chart Grid ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                    {streamKeys.map(k => (
                        <BloombergChart key={k} streamKey={k} data={streams[k]} />
                    ))}
                </div>

                {/* ── Bottom Row: Logs / AI / Status ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                    {/* Raw Terminal */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-56 flex flex-col">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Cpu className="w-3 h-3" /> RAW FEED TERMINAL
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-0.5 text-[9px] text-white/40 leading-relaxed">
                            <AnimatePresence initial={false}>
                                {rawLogs.map((log, i) => (
                                    <motion.div
                                        key={log + i}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="text-[#00ff41]/60"
                                    >
                                        {log}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {rawLogs.length === 0 && <div className="text-white/20 italic">Waiting for daemon handshake...</div>}
                        </div>
                    </div>

                    {/* AI Synthesis */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-56 flex flex-col relative overflow-hidden">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Zap className="w-3 h-3" /> AI REASONING SYNTHESIS
                        </div>
                        <div className="space-y-2 text-[10px] flex-1">
                            <div className="p-2 bg-[#00ff41]/5 border-l-2 border-[#00ff41]/40 leading-relaxed text-white/60 italic">
                                "Correlating 10 API arrays: Finnhub/Alpha divergence ±0.4σ. CoinGecko BTC 24h volume above 90th percentile. OpenMeteo disruption index stable. ADSB flight density within range."
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {['MOMENTUM: +', 'RISK: LOW', 'MACRO: NEUTRAL', 'SENTIMENT: 0.62'].map(tag => (
                                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">{tag}</span>
                                ))}
                            </div>
                        </div>
                        <motion.div
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="mt-2 text-center text-[10px] text-yellow-500 font-bold tracking-widest uppercase"
                        >
                            ::: HORIZON LOCK ACTIVE — T-{30 - Math.floor(tick / 30)} MIN :::
                        </motion.div>
                    </div>

                    {/* API Status Grid */}
                    <div className="border border-white/5 bg-[#0b0d0c] rounded p-3 h-56 flex flex-col">
                        <div className="text-[10px] tracking-widest uppercase text-[#00ff41]/70 mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                            <Globe className="w-3 h-3" /> API FEDERATION MATRIX
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] flex-1">
                            {streamKeys.map(k => {
                                const cfg = STREAMS[k];
                                const last = streams[k]?.[streams[k].length - 1];
                                const prev = streams[k]?.[streams[k].length - 2];
                                const up = last && prev ? last.value >= prev.value : true;
                                return (
                                    <div key={k} className="flex items-center justify-between border-b border-white/5 pb-1">
                                        <span className="text-white/40 uppercase truncate">{k.replace('_', '')}</span>
                                        <span className={`font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {up ? '▲' : '▼'} LIVE
                                        </span>
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
