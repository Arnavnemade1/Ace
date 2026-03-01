import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Terminal, Database, Activity, Wifi, Cpu, BarChart3, Clock } from "lucide-react";

interface AgentLog {
    id: string;
    time: string;
    agent: string;
    type: string;
    message: string;
}

const AgentArena = () => {
    const [logs, setLogs] = useState<AgentLog[]>([]);
    const [portfolio, setPortfolio] = useState<any>(null);
    const [alpacaAccount, setAlpacaAccount] = useState<any>(null);
    const [alpacaPositions, setAlpacaPositions] = useState<any[]>([]);
    const [alpacaOrders, setAlpacaOrders] = useState<any[]>([]);
    const [marketClock, setMarketClock] = useState<any>(null);
    const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error'; lastSynced?: Date; error?: string }>({ status: 'idle' });
    const [neuralLoad, setNeuralLoad] = useState(20);
    const [currentAction, setCurrentAction] = useState("SYNTHESIZING...");
    const [assetClassFilter, setAssetClassFilter] = useState("All");
    const [sideFilter, setSideFilter] = useState("All");
    const [showAllPositions, setShowAllPositions] = useState(false);
    const [showAllOrders, setShowAllOrders] = useState(false);

    const toNum = (v: any) => {
        const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
        return Number.isFinite(n) ? n : 0;
    };

    const formatMoney = (v: any, digits = 2) => {
        const n = toNum(v);
        return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    };

    const formatAssetClass = (ac?: string) => {
        if (!ac) return "Unknown";
        return ac.replace(/_/g, " ").toUpperCase();
    };

    useEffect(() => {
        // Fetch recent thoughts
        const fetchLogs = async () => {
            const { data } = await supabase.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(20);
            if (data) {
                setLogs(data.map((l: any) => ({
                    id: l.id,
                    time: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    agent: l.agent_name,
                    type: l.log_type,
                    message: l.message
                })));

                // Set initial load based on latest activity
                if (data[0]) {
                    setCurrentAction(data[0].message.length > 30 ? data[0].message.slice(0, 30) + "..." : data[0].message);
                    setNeuralLoad(data[0].agent_name === 'Orchestrator' ? 85 : 45);
                }
            }
        };

        // Fetch live portfolio
        const fetchPort = async () => {
            const { data } = await supabase.from('portfolio_state').select('*').limit(1).single();
            if (data) setPortfolio(data);
        };

        fetchLogs();
        fetchPort();

        const channel = supabase.channel('public:agent_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, (payload: any) => {
                const l = payload.new;
                setLogs(prev => [{
                    id: l.id,
                    time: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    agent: l.agent_name,
                    type: l.log_type,
                    message: l.message
                }, ...prev].slice(0, 30));

                // Drive Neural Load Bar from actual activity
                const loadMap: Record<string, number> = {
                    'Orchestrator': 90,
                    'Strategy Engine': 75,
                    'Risk Controller': 60,
                    'Market Scanner': 40,
                    'Portfolio Optimizer': 50
                };
                setNeuralLoad(loadMap[l.agent_name] || 30);
                setCurrentAction(l.message.length > 20 ? l.message.slice(0, 20).toUpperCase() + "..." : l.message.toUpperCase());
            })
            .subscribe();

        const portChannel = supabase.channel('public:portfolio_state')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portfolio_state' }, (payload: any) => {
                setPortfolio(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); supabase.removeChannel(portChannel); };
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchAlpaca = async () => {
            setSyncStatus(prev => ({ ...prev, status: 'syncing' }));
            try {
                const { data, error } = await supabase.functions.invoke('market-data', {
                    body: { symbols: ["SPY", "QQQ", "AAPL", "NVDA", "MSFT", "AMZN", "META", "TSLA", "XLE", "USO"] }
                });

                if (error || data?.error) {
                    if (!mounted) return;
                    setSyncStatus(prev => ({
                        ...prev,
                        status: 'error',
                        error: error?.message || data?.error || 'Failed to sync Alpaca'
                    }));
                    return;
                }

                if (!mounted) return;
                setAlpacaAccount(data?.account || null);
                setAlpacaPositions(Array.isArray(data?.positions) ? data.positions : []);
                setAlpacaOrders(Array.isArray(data?.orders) ? data.orders : []);
                setMarketClock(data?.clock || null);
                setSyncStatus({ status: 'idle', lastSynced: new Date() });
            } catch (e: any) {
                if (!mounted) return;
                setSyncStatus(prev => ({ ...prev, status: 'error', error: e?.message || 'Failed to sync Alpaca' }));
            }
        };

        fetchAlpaca();
        const iv = setInterval(fetchAlpaca, 30000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);

    const alpacaReady = Boolean(syncStatus.lastSynced) || alpacaAccount !== null || marketClock !== null;
    const account = alpacaReady ? alpacaAccount : portfolio;
    const positions = alpacaReady ? alpacaPositions : (portfolio?.positions || []);
    const orders = alpacaReady ? alpacaOrders : (portfolio?.orders || []);

    const assetClassOptions = ["All", ...Array.from(new Set((positions || []).map((p: any) => p.asset_class || "us_equity")))];
    const sideOptions = ["All", ...Array.from(new Set((positions || []).map((p: any) => p.side || "long")))];

    const filteredPositions = (positions || []).filter((p: any) => {
        const ac = p.asset_class || "us_equity";
        const sd = p.side || "long";
        return (assetClassFilter === "All" || ac === assetClassFilter) && (sideFilter === "All" || sd === sideFilter);
    });

    const sortedPositions = [...filteredPositions].sort((a, b) => toNum(b.market_value) - toNum(a.market_value));
    const displayPositions = showAllPositions ? sortedPositions : sortedPositions.slice(0, 6);

    const sortedOrders = [...(orders || [])].sort((a, b) => {
        const ta = new Date(a.submitted_at || 0).getTime();
        const tb = new Date(b.submitted_at || 0).getTime();
        return tb - ta;
    });
    const displayOrders = showAllOrders ? sortedOrders : sortedOrders.slice(0, 10);

    return (
        <div className="min-h-screen bg-background overflow-x-hidden pt-24 pb-12">
            <div className="container mx-auto px-6">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 cursor-default">
                    <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-4 flex items-center gap-4">
                        <Cpu className="text-primary w-12 h-12" /> Agent Arena
                    </h1>
                    <p className="text-muted-foreground text-lg">Live multi-agent neural monitoring & API feed processing.</p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center col-span-1 border-primary/20 bg-primary/5">
                        <Database className="w-8 h-8 text-primary mb-3 opacity-80" />
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Live Portfolio Value</p>
                        <h2 className="text-4xl font-display font-bold profit-text glow-text">
                            ${account ? formatMoney(account.equity ?? account.total_value ?? account.portfolio_value ?? account.cash ?? 0, 2) : '---'}
                        </h2>
                        <div className="mt-3 flex gap-4 text-sm opacity-80">
                            <div><span className="text-muted-foreground mr-1">Cash:</span> ${account ? formatMoney(account.cash ?? 0, 2) : '---'}</div>
                            <div><span className="text-muted-foreground mr-1">BP:</span> ${account ? formatMoney(account.buying_power ?? 0, 2) : '---'}</div>
                            <div><span className="text-muted-foreground mr-1">Equity:</span> ${account ? formatMoney(account.equity ?? 0, 2) : '---'}</div>
                        </div>
                        <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                            {marketClock ? (
                                <span className="inline-flex items-center gap-2">
                                    <Clock className="w-3 h-3" />
                                    {marketClock.is_open ? "Market Open" : "Market Closed"} · Next {marketClock.is_open ? "Close" : "Open"}:{" "}
                                    {new Date(marketClock.is_open ? marketClock.next_close : marketClock.next_open).toLocaleString()}
                                </span>
                            ) : "Market clock unavailable"}
                        </div>
                    </div>

                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center col-span-1 border-primary/10">
                        <Terminal className="w-6 h-6 text-primary/60 mb-2" />
                        <p className="text-[10px] text-muted-foreground uppercase tracking-tighter font-semibold mb-1">Neural Load</p>
                        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <motion.div
                                animate={{ width: `${neuralLoad}%` }}
                                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                                className="h-full bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                            />
                        </div>
                        <p className="mt-2 text-xs font-mono text-primary/80 tracking-widest animate-pulse truncate w-full px-2">
                            {currentAction}
                        </p>
                    </div>

                    <div className="glass-card p-6 col-span-1 lg:col-span-2 flex flex-col relative overflow-hidden bg-white/[0.02]">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Wifi className="w-32 h-32" /></div>
                        <div className="flex items-center gap-3 mb-4 z-10">
                            <Activity className="text-primary w-5 h-5" />
                            <h3 className="font-display font-semibold text-lg">Alpaca Sync Status</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 z-10">
                            <div className="rounded-lg border border-border/50 bg-black/30 p-4">
                                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Sync State</p>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-mono px-2 py-1 rounded border ${syncStatus.status === 'error' ? 'border-red-500/40 text-red-300 bg-red-500/10' : syncStatus.status === 'syncing' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'}`}>
                                        {syncStatus.status === 'error' ? 'ERROR' : syncStatus.status === 'syncing' ? 'SYNCING' : 'LIVE'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {syncStatus.lastSynced ? `Last synced ${syncStatus.lastSynced.toLocaleTimeString()}` : 'Awaiting first sync'}
                                    </span>
                                </div>
                                {syncStatus.error && <p className="mt-2 text-xs text-red-300">{syncStatus.error}</p>}
                            </div>
                            <div className="rounded-lg border border-border/50 bg-black/30 p-4">
                                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Portfolio Overview</p>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Positions</span>
                                    <span className="font-mono text-primary">{positions.length}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-2">
                                    <span className="text-muted-foreground">Orders</span>
                                    <span className="font-mono text-amber-400">{orders.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 mb-10">
                    <div className="glass-card p-6 overflow-hidden border border-primary/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                                <BarChart3 className="text-primary w-5 h-5" />
                                <h3 className="font-display font-semibold text-foreground tracking-wide">Top Positions</h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                                <label className="flex items-center gap-2 text-muted-foreground">
                                    Asset Class
                                    <select className="bg-black/30 border border-border/60 rounded px-2 py-1" value={assetClassFilter} onChange={(e) => setAssetClassFilter(e.target.value)}>
                                        {assetClassOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt === "All" ? "All" : formatAssetClass(opt)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex items-center gap-2 text-muted-foreground">
                                    Side
                                    <select className="bg-black/30 border border-border/60 rounded px-2 py-1" value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}>
                                        {sideOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt === "All" ? "All" : opt.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </label>
                                <button className="text-primary/80 hover:text-primary transition-colors text-xs font-mono" onClick={() => setShowAllPositions(v => !v)}>
                                    {showAllPositions ? "Collapse" : "View All"}
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase border-b border-border/50">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Asset</th>
                                        <th className="px-4 py-2 font-medium">Price</th>
                                        <th className="px-4 py-2 font-medium">Qty</th>
                                        <th className="px-4 py-2 font-medium">Market Value</th>
                                        <th className="px-4 py-2 font-medium text-right">Total P/L ($)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {displayPositions.map((pos: any, idx: number) => {
                                        const currentPrice = toNum(pos.current_price || pos.lastday_price || pos.avg_entry_price);
                                        const qty = toNum(pos.qty);
                                        const marketValue = toNum(pos.market_value) || currentPrice * qty;
                                        const pnl = toNum(pos.unrealized_pl ?? pos.unrealized_intraday_pl ?? 0) + toNum(pos.realized_pl ?? 0);
                                        return (
                                            <motion.tr key={`${pos.symbol}-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="hover:bg-secondary/30 transition-colors">
                                                <td className="px-4 py-3 font-semibold font-display text-foreground">{pos.symbol}</td>
                                                <td className="px-4 py-3">${formatMoney(currentPrice, 2)}</td>
                                                <td className="px-4 py-3">{qty}</td>
                                                <td className="px-4 py-3 font-medium">${formatMoney(marketValue, 2)}</td>
                                                <td className={`px-4 py-3 text-right font-medium ${pnl >= 0 ? 'profit-text' : 'loss-text'}`}>
                                                    {pnl >= 0 ? '+' : ''}${formatMoney(pnl, 2)}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                    {displayPositions.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                                No open positions. Place some trades to see this table populate.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="glass-card p-6 overflow-hidden border border-primary/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                                <Terminal className="text-primary w-5 h-5" />
                                <h3 className="font-display font-semibold text-foreground tracking-wide">Recent Orders</h3>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="px-2 py-1 rounded border border-border/60 bg-black/30">Cancel 0 selected</span>
                                <span>0 rows selected</span>
                                <span className="text-primary/80 hover:text-primary transition-colors cursor-pointer">Clear Selection</span>
                                <button className="text-primary/80 hover:text-primary transition-colors text-xs font-mono" onClick={() => setShowAllOrders(v => !v)}>
                                    {showAllOrders ? "Collapse" : "View All"}
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase border-b border-border/50">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Asset</th>
                                        <th className="px-4 py-2 font-medium">Order Type</th>
                                        <th className="px-4 py-2 font-medium">Side</th>
                                        <th className="px-4 py-2 font-medium">Qty</th>
                                        <th className="px-4 py-2 font-medium">Filled Qty</th>
                                        <th className="px-4 py-2 font-medium">Avg. Fill Price</th>
                                        <th className="px-4 py-2 font-medium">Status</th>
                                        <th className="px-4 py-2 font-medium">Source</th>
                                        <th className="px-4 py-2 font-medium">Submitted At</th>
                                        <th className="px-4 py-2 font-medium">Filled At</th>
                                        <th className="px-4 py-2 font-medium">Expires At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {displayOrders.map((ord: any, idx: number) => (
                                        <motion.tr key={`${ord.id || ord.symbol}-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="hover:bg-secondary/30 transition-colors">
                                            <td className="px-4 py-3 font-semibold font-display text-foreground">{ord.symbol}</td>
                                            <td className="px-4 py-3">{(ord.order_type || ord.type || '—').toUpperCase()}</td>
                                            <td className="px-4 py-3">{(ord.side || '—').toUpperCase()}</td>
                                            <td className="px-4 py-3">{ord.qty ?? '—'}</td>
                                            <td className="px-4 py-3">{ord.filled_qty ?? '—'}</td>
                                            <td className="px-4 py-3">{ord.filled_avg_price ? `$${formatMoney(ord.filled_avg_price, 2)}` : '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-amber-500/20 rounded border border-amber-500/30">
                                                    {ord.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{ord.source || 'api'}</td>
                                            <td className="px-4 py-3">{ord.submitted_at ? new Date(ord.submitted_at).toLocaleString() : '—'}</td>
                                            <td className="px-4 py-3">{ord.filled_at ? new Date(ord.filled_at).toLocaleString() : '—'}</td>
                                            <td className="px-4 py-3">{ord.expires_at ? new Date(ord.expires_at).toLocaleString() : '—'}</td>
                                        </motion.tr>
                                    ))}
                                    {displayOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                                                No orders. Place a trade via the dashboard or the API to see this table populate.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Live Internal Monologue Matrix */}
                <div className="glass-card p-0 overflow-hidden border border-primary/10">
                    <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between bg-black/40">
                        <div className="flex items-center gap-3">
                            <Terminal className="text-primary w-5 h-5" />
                            <h3 className="font-display font-semibold text-foreground tracking-wide">Swarm Internal Monologue Stream</h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-primary font-mono animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                            STREAM_ACTIVE
                        </div>
                    </div>

                    <div className="h-[500px] overflow-y-auto p-4 space-y-2 bg-[#0a0a0c] font-mono text-sm leading-relaxed" id="agent-logs-container">
                        {logs.map((log) => (
                            <div key={log.id} className="flex gap-4 p-2 rounded hover:bg-white/[0.02] border-l-2 border-transparent hover:border-primary/50 transition-all group">
                                <span className="text-muted-foreground/60 shrink-0 w-20">[{log.time}]</span>
                                <span className="shrink-0 w-36 font-semibold opacity-80" style={{
                                    color: log.agent === 'Market Scanner' ? '#38bdf8' :
                                        log.agent === 'Strategy Engine' ? '#c084fc' :
                                            log.agent === 'Risk Controller' ? '#fbbf24' :
                                                log.agent === 'Portfolio Optimizer' ? '#34d399' :
                                                    log.agent === 'Causal Replay' ? '#f43f5e' : '#a1a1aa'
                                }}>
                                    {log.agent}
                                </span>
                                <span className="text-foreground/90 break-words group-hover:text-white transition-colors">
                                    {log.type === 'error' && <span className="text-destructive mr-2">[ERR]</span>}
                                    {log.type === 'decision' && <span className="text-primary mr-2">[DEC]</span>}
                                    {log.type === 'learning' && <span className="text-accent mr-2">[LRN]</span>}
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default AgentArena;
