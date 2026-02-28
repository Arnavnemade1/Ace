import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Terminal, Database, Activity, Wifi, Cpu, Eye, BarChart3, Clock } from "lucide-react";

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
            })
            .subscribe();

        const portChannel = supabase.channel('public:portfolio_state')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portfolio_state' }, (payload: any) => {
                setPortfolio(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); supabase.removeChannel(portChannel); };
    }, []);

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
                        <h2 className="text-4xl font-display font-bold profit-text glow-text">${portfolio ? portfolio.total_value.toLocaleString() : '---'}</h2>
                        <div className="mt-3 flex gap-4 text-sm opacity-80">
                            <div><span className="text-muted-foreground">Cash:</span> ${portfolio ? portfolio.cash.toLocaleString() : '---'}</div>
                        </div>
                    </div>

                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center col-span-1 border-primary/10">
                        <Terminal className="w-6 h-6 text-primary/60 mb-2" />
                        <p className="text-[10px] text-muted-foreground uppercase tracking-tighter font-semibold mb-1">Neural Load</p>
                        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <motion.div
                                animate={{ width: ["20%", "45%", "32%", "88%", "15%"] }}
                                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                className="h-full bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                            />
                        </div>
                        <p className="mt-2 text-xs font-mono text-primary/80 tracking-widest">SYNTHESIZING...</p>
                    </div>

                    <div className="glass-card p-6 col-span-1 lg:col-span-2 flex flex-col relative overflow-hidden bg-white/[0.02]">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Wifi className="w-32 h-32" /></div>
                        <div className="flex items-center gap-3 mb-4 z-10">
                            <Activity className="text-primary w-5 h-5" />
                            <h3 className="font-display font-semibold text-lg">
                                Neural Trade Stream ({portfolio?.positions?.length || 0})
                                {portfolio?.orders?.length > 0 && <span className="ml-3 text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{portfolio.orders.length} PENDING</span>}
                            </h3>
                        </div>
                        <div className="overflow-x-auto z-10">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase border-b border-border/50">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Symbol</th>
                                        <th className="px-4 py-2 font-medium">Qty</th>
                                        <th className="px-4 py-2 font-medium">Status / Price</th>
                                        <th className="px-4 py-2 font-medium">Market Value</th>
                                        <th className="px-4 py-2 font-medium text-right">Unrealized P&L</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {/* Active Positions */}
                                    {portfolio?.positions?.map((pos: any, idx: number) => (
                                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }} key={pos.symbol} className="hover:bg-secondary/30 transition-colors">
                                            <td className="px-4 py-3 font-semibold font-display text-foreground">{pos.symbol}</td>
                                            <td className="px-4 py-3">{pos.qty}</td>
                                            <td className="px-4 py-3">${pos.current_price?.toFixed(2)}</td>
                                            <td className="px-4 py-3 font-medium">${pos.market_value?.toLocaleString()}</td>
                                            <td className={`px-4 py-3 text-right font-medium ${pos.unrealized_pl >= 0 ? 'profit-text' : 'loss-text'}`}>
                                                {pos.unrealized_pl >= 0 ? '+' : ''}${pos.unrealized_pl?.toFixed(2)}
                                                <span className="text-xs ml-1 opacity-70">({(pos.unrealized_plpc * 100).toFixed(2)}%)</span>
                                            </td>
                                        </motion.tr>
                                    ))}

                                    {/* Pending Orders */}
                                    {portfolio?.orders?.map((ord: any, idx: number) => (
                                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (portfolio?.positions?.length || 0) * 0.05 + idx * 0.05 }} key={`${ord.symbol}-${ord.status}-${idx}`} className="bg-amber-500/5 hover:bg-amber-500/10 transition-colors opacity-80 italic">
                                            <td className="px-4 py-3 font-semibold font-display text-amber-500/80">{ord.symbol}</td>
                                            <td className="px-4 py-3">{ord.qty}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-amber-500/20 rounded mr-2 border border-amber-500/30">{ord.status}</span>
                                                {ord.side?.toUpperCase()} @ ${ord.limit_price?.toFixed(2) || 'MKT'}
                                            </td>
                                            <td className="px-4 py-3 font-medium opacity-60">${((ord.limit_price || 0) * ord.qty).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-medium text-muted-foreground/50">— PENDING —</td>
                                        </motion.tr>
                                    ))}

                                    {(!portfolio?.positions?.length && !portfolio?.orders?.length) && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                                No active positions or pending orders detected.
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
