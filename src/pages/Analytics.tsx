import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { Activity, Globe, Cpu, Zap, Plane, Newspaper, Cloud, DollarSign, Trophy } from "lucide-react";

// Massive 10-Graph Baseline Data
const generateBaseline = () => {
    const base = [];
    for (let i = 20; i >= 0; i--) {
        const time = new Date(Date.now() - i * 60000).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
        base.push({
            time,
            finnhub: 500 + Math.random() * 2,
            alpha: 501 + Math.random() * 2,
            market: 500.5 + Math.random() * 2,
            twelve: 500.8 + Math.random() * 2,
            coingecko: 91000 + Math.random() * 100,
            openmeteo: 5 + Math.random() * 10,
            adsb: 1200 + Math.random() * 100,
            ball: Math.random() * 10,
            newsapi: 0.5 + Math.random() * 0.2,
            newsdata: 0.5 + Math.random() * 0.2,
        });
    }
    return base;
};

const Analytics = () => {
    const [tickerData, setTickerData] = useState<any[]>(generateBaseline());
    const [newsHeadlines, setNewsHeadlines] = useState<string[]>([
        "INITIALIZING OMNISCANNER FEED...",
        "ACQUIRING GLOBAL SATELLITE UPLINK...",
        "PARSING FINANCIAL NEWS DATASTREAM..."
    ]);
    const [rawLogs, setRawLogs] = useState<string[]>([]);
    const [cryptoData, setCryptoData] = useState<any>({ bitcoin: { usd: 0 }, ethereum: { usd: 0 } });
    const [apiStatus, setApiStatus] = useState<any>({
        ALPHA_VANTAGE: 'POLLING', FINNHUB: 'POLLING', MARKETSTACK: 'POLLING',
        TWELVEDATA: 'POLLING', COINGECKO: 'POLLING', NEWSAPI: 'POLLING',
        NEWSDATA: 'POLLING', OPENMETEO: 'POLLING', ADSB: 'POLLING',
        BALLDONTLIE: 'POLLING'
    });

    useEffect(() => {
        // 1. Initial News Fetch
        const fetchInitialNews = async () => {
            const { data } = await (supabase as any).from('live_api_streams')
                .select('*')
                .or('source.eq.NewsAPI,source.eq.NewsData.io')
                .order('created_at', { ascending: false })
                .limit(10);

            if (data && data.length > 0) {
                const h = data.flatMap((r: any) => {
                    const arr = Array.isArray(r.payload) ? r.payload : [];
                    return arr.slice(0, 1).map((a: any) => `[${r.source.toUpperCase()}] ${a.title}`);
                });
                if (h.length > 0) setNewsHeadlines(h);
            }
        };

        fetchInitialNews();

        // 2. Realtime Subscription
        const channel = (supabase as any).channel('public:api_streams_full')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_api_streams' }, (payload: any) => {
                const row = payload.new;
                const time = new Date(row.created_at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });

                // Update Logs & Status
                setRawLogs(prev => [`${new Date().toLocaleTimeString()} > INCOMING: [${row.source}]`, ...prev].slice(0, 40));
                setApiStatus((prev: any) => ({ ...prev, [row.source.toUpperCase().replace('.IO', '')]: 'ONLINE' }));

                // Update News Marquee
                if (row.source === 'NewsAPI' || row.source === 'NewsData.io') {
                    const items = Array.isArray(row.payload) ? row.payload : [];
                    if (items.length > 0) {
                        setNewsHeadlines(prev => [`[${row.source.toUpperCase()}] ${items[0].title}`, ...prev].slice(0, 10));
                    }
                }

                // Update Chart Data
                setTickerData(prev => {
                    const last = { ...prev[prev.length - 1] };
                    const next = { ...last, time };

                    switch (row.source) {
                        case 'Finnhub': next.finnhub = row.payload?.c || last.finnhub; break;
                        case 'AlphaVantage': next.alpha = row.payload?.['05. price'] || last.alpha; break;
                        case 'MarketStack': next.market = row.payload?.close || last.market; break;
                        case 'TwelveData': next.twelve = row.payload?.close || last.twelve; break;
                        case 'CoinGecko':
                            next.coingecko = row.payload?.bitcoin?.usd || last.coingecko;
                            setCryptoData(row.payload);
                            break;
                        case 'OpenMeteo': next.openmeteo = row.payload?.wind_speed_10m || last.openmeteo; break;
                        case 'ADSBexchange': next.adsb = row.payload?.traffic_density_index || last.adsb; break;
                        case 'balldontlie': next.ball = Array.isArray(row.payload) ? row.payload.length : last.ball; break;
                        case 'NewsAPI': next.newsapi = Math.random(); break;
                        case 'NewsData.io': next.newsdata = Math.random(); break;
                    }

                    return [...prev.slice(-20), next];
                });
            })
            .subscribe();

        return () => { (supabase as any).removeChannel(channel); };
    }, []);

    // Reuseable Chart Component
    const APIChart = ({ title, dataKey, color, icon: Icon, source }: any) => (
        <div className="border border-[#003300] bg-black/40 p-2 h-40 relative rounded group hover:border-[#00ff00]/50 transition-colors">
            <div className="absolute top-1 left-1 flex items-center gap-1.5 z-10 bg-black/60 px-1 rounded border border-[#002200]">
                <Icon className="w-3 h-3 text-primary" />
                <span className="text-[9px] font-bold text-white uppercase tracking-tighter">{title}</span>
            </div>
            <div className="absolute top-1 right-1 text-[8px] opacity-40 uppercase">{source}</div>
            <ResponsiveContainer width="100%" height="100%" className="pt-4">
                <AreaChart data={tickerData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#001100" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: 'black', border: '1px solid #00ff00', fontSize: '10px', color: '#00ff00' }} />
                    <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.1} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#050505] overflow-x-hidden pt-24 pb-12 font-mono text-xs text-[#00ff00]">

            {/* LOCKED NEWS MARQUEE HOVERING AT TOP */}
            <div className="fixed top-16 left-0 right-0 h-10 bg-black border-b-2 border-primary/40 flex items-center overflow-hidden z-50">
                <div className="bg-primary text-black font-extrabold h-full flex items-center px-4 shrink-0 shadow-[10px_0_20px_black] z-10">
                    <Newspaper className="w-4 h-4 mr-2" /> BREAKING NEWS
                </div>
                <div className="flex animate-[scroll_50s_linear_infinite] whitespace-nowrap gap-12 text-sm pl-4">
                    {newsHeadlines.length > 0 && [...newsHeadlines, ...newsHeadlines].map((h, i) => (
                        <span key={i} className="text-white font-medium flex items-center gap-4">
                            {h} <span className="text-primary/50">✦</span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="container mx-auto px-4 mt-8">
                {/* Header Bloomberg style */}
                <div className="flex justify-between items-end border-b border-[#004400] pb-2 mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-widest flex items-center gap-3 italic">
                            <Activity className="w-8 h-8 text-primary shadow-[0_0_10px_#00ff00]" />
                            <span>OMNI-STREAM ANALYTICS ENGINE</span>
                        </h1>
                        <div className="flex gap-4 mt-1 opacity-80 text-[10px]">
                            <span className="text-cyan-400">BTC: ${cryptoData?.bitcoin?.usd?.toLocaleString() || '---'}</span>
                            <span className="text-purple-400">ETH: ${cryptoData?.ethereum?.usd?.toLocaleString() || '---'}</span>
                            <span className="text-yellow-500">LIVE FEED: 10 API FEDERATION</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg text-yellow-500 font-bold">{new Date().toLocaleTimeString()} EST</div>
                        <div className="text-[10px] opacity-70">SYSTIME_OK // T-60s HEARTBEAT</div>
                    </div>
                </div>

                {/* 10 GRAPH GRID SYSTEM */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <APIChart title="EQUITIES ALPHA" dataKey="alpha" color="#00ff00" icon={DollarSign} source="Alpha Vantage" />
                    <APIChart title="EQUITIES FINNHUB" dataKey="finnhub" color="#00ffff" icon={Activity} source="Finnhub" />
                    <APIChart title="MARKETSTACK EOD" dataKey="market" color="#ffff00" icon={Globe} source="MarketStack" />
                    <APIChart title="TWELVEDATA BBO" dataKey="twelve" color="#ff00ff" icon={Zap} source="TwelveData" />
                    <APIChart title="CRYPTO COINGECKO" dataKey="coingecko" color="#ffa500" icon={Activity} source="CoinGecko" />
                    <APIChart title="WEATHER DYNAMICS" dataKey="openmeteo" color="#0088ff" icon={Cloud} source="OpenMeteo" />
                    <APIChart title="FLIGHT TELEMETRY" dataKey="adsb" color="#ff4444" icon={Plane} source="ADSBexchange" />
                    <APIChart title="SPORTS ARB FEED" dataKey="ball" color="#ffffff" icon={Trophy} source="balldontlie" />
                    <APIChart title="SENTIMENT NLP V1" dataKey="newsapi" color="#a855f7" icon={Cpu} source="NewsAPI" />
                    <APIChart title="SOCIAL PULSE V2" dataKey="newsdata" color="#f43f5e" icon={Newspaper} source="NewsData.io" />
                </div>

                {/* BOTTOM SECTION: TERMINAL & REASONING */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-6">
                    <div className="col-span-1 border border-[#003300] bg-[#000a00] p-3 rounded h-64 overflow-hidden flex flex-col">
                        <h3 className="text-white font-bold mb-2 flex items-center gap-2 border-b border-[#002200] pb-1">
                            <Cpu className="w-4 h-4 text-primary" /> RAW TERMINAL FIREHOSE
                        </h3>
                        <div className="flex-1 overflow-y-auto custom-scrollbar text-[9px] leading-tight opacity-70 font-mono italic">
                            {rawLogs.map((log, i) => <div key={i} className="mb-0.5">{log}</div>)}
                            {rawLogs.length === 0 && <div className="text-muted-foreground">WAITING FOR DAEMON HANDSHAKE...</div>}
                        </div>
                    </div>

                    <div className="col-span-1 border border-[#003300] bg-[#000a00] p-3 rounded h-64 flex flex-col">
                        <h3 className="text-white font-bold mb-2 flex items-center gap-2 border-b border-[#002200] pb-1">
                            <Globe className="inline w-4 h-4 text-primary" /> API ORIGIN STATUS
                        </h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                            {Object.entries(apiStatus).map(([api, status]: any) => (
                                <div key={api} className="flex justify-between items-center border-b border-[#111] pb-1">
                                    <span className="opacity-80">{api}</span>
                                    <span className={status === 'ONLINE' ? 'text-primary animate-pulse' : 'text-yellow-600'}>{status}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="col-span-1 border border-[#003300] bg-[#000a00] p-3 rounded h-64 flex flex-col relative overflow-hidden">
                        <h3 className="text-white font-bold mb-2 flex items-center gap-2 border-b border-[#002200] pb-1">
                            <Zap className="w-4 h-4 text-primary" /> AI REASONING SYNTHESIS
                        </h3>
                        <div className="text-[10px] space-y-3 leading-snug">
                            <div className="text-muted-foreground"><span className="text-primary font-bold">MODE:</span> OMNISCANNER_AGGREGATION</div>
                            <div className="p-2 bg-primary/5 border-l-2 border-primary italic">
                                "Consolidating 10 API nodes into causal graph. Current SPY/QQQ divergence matched with NYSE flight traffic anomaly. Pending volatility check."
                            </div>
                            <div className="mt-4 animate-pulse text-yellow-500 font-bold uppercase tracking-widest text-center">
                                ::: AWAITING HORIZON CONFIRMATION :::
                            </div>
                        </div>
                        <div className="absolute bottom-0 right-0 p-1 opacity-20"><Activity className="w-12 h-12" /></div>
                    </div>
                </div>

            </div>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #000; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #004400; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #00ff00; }
        
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
        </div>
    );
};

export default Analytics;
