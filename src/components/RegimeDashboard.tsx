import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
    RadialBarChart,
    RadialBar,
    Legend,
    ResponsiveContainer,
    PolarAngleAxis
} from "recharts";
import { Brain, Activity, Target, Zap, Clock, Skull, Info, X, Shield, Globe, Cpu } from "lucide-react";

interface Regime {
    regime_type: string;
    confidence: number;
    macro_factors: any;
    created_at: string;
}

interface AgentLifecycle {
    id: string;
    persona: string;
    status: 'born' | 'active' | 'retired';
    regime_affinity: string;
    spawn_time: string;
    death_time: string | null;
    death_reason: string | null;
}

const REGIME_COLORS: Record<string, string> = {
    'high-vol-reversion': '#ef4444',     // Red
    'low-vol-trend': '#10b981',        // Green
    'quiet-accumulation': '#6366f1',   // Indigo
    'crisis-transition': '#eab308',    // Yellow
    'commodity-supercycle': '#f97316'  // Orange
};

const PERSONA_ICONS: Record<string, any> = {
    'MomentumChaser': Zap,
    'ContrarianValue': Brain,
    'TransitionScout': Target,
    'CommoditySniper': Activity,
    'VolatilityHarvester': Cpu,
    'IntradayScalper': Shield
};

const PERSONA_DETAILS: Record<string, { role: string, strategy: string }> = {
    'MomentumChaser': {
        role: "High-velocity trend capture.",
        strategy: "Uses exponential moving averages (EMA) and volume-weighted price action to identify sustained directional moves. Thrives in low-volatility trending markets."
    },
    'ContrarianValue': {
        role: "Mean reversion specialist.",
        strategy: "Identifies overextended RSI levels and institutional order block support/resistance. Seeks stability in volatile or consolidating regimes."
    },
    'TransitionScout': {
        role: "Regime shift detector.",
        strategy: "Monitors kurtosis of returns and volatility clustering to predict regime transitions before they manifest in price. High neural sensitivity."
    },
    'CommoditySniper': {
        role: "Cross-asset arbitrage.",
        strategy: "Correlates equities with spot commodity prices (Oil, Gold, NatGas) to extract value from lagging sector moves. Geo-political bias enabled."
    },
    'VolatilityHarvester': {
        role: "VIX decay extraction.",
        strategy: "Profits from volatility crush events and term structure premiums. Deploys relative-value spreads during sentiment extremes."
    },
    'IntradayScalper': {
        role: "Micro-movement extraction.",
        strategy: "Targets sub-percentage shifts with hyper-fast entry/exit logic. Uses tight stop-losses to maintain positive expectancy in high-noise environments."
    }
};

export default function RegimeDashboard() {
    const [currentRegime, setCurrentRegime] = useState<Regime | null>(null);
    const [agents, setAgents] = useState<AgentLifecycle[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<AgentLifecycle | null>(null);
    const [selectedAgentLogs, setSelectedAgentLogs] = useState<any[]>([]);
    const [fetchingLogs, setFetchingLogs] = useState(false);

    useEffect(() => {
        const fetchState = async () => {
            // Fetch latest regime
            const { data: regimeData } = await (supabase as any)
                .from('market_regimes')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (regimeData) setCurrentRegime(regimeData as Regime);

            // Fetch recent agents (active + recently retired)
            const { data: agentData } = await (supabase as any)
                .from('agent_lifecycles')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            if (agentData) setAgents(agentData as AgentLifecycle[]);

            setLoading(false);
        };

        fetchState();

        // Subscribe to real-time changes
        const regimeSub = supabase
            .channel('regime_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_regimes' }, (payload) => {
                setCurrentRegime(payload.new as Regime);
            })
            .subscribe();

        const agentSub = supabase
            .channel('agent_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_lifecycles' }, (payload) => {
                setAgents(prev => {
                    if (payload.eventType === 'INSERT') {
                        return [payload.new as AgentLifecycle, ...prev].slice(0, 10);
                    }
                    if (payload.eventType === 'UPDATE') {
                        return prev.map(a => a.id === payload.new.id ? payload.new as AgentLifecycle : a);
                    }
                    return prev;
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(regimeSub);
            supabase.removeChannel(agentSub);
        };
    }, []);

    useEffect(() => {
        const fetchAgentLogs = async () => {
            if (!selectedAgent) return;
            setFetchingLogs(true);

            // Fetch logs attributed to this specific persona or general activity logs
            const { data } = await supabase
                .from('agent_logs')
                .select('*')
                .or(`agent_name.eq.${selectedAgent.persona},message.ilike.%${selectedAgent.persona}%,log_type.eq.decision`)
                .order('created_at', { ascending: false })
                .limit(5);

            setSelectedAgentLogs(data || []);
            setFetchingLogs(false);
        };

        fetchAgentLogs();
    }, [selectedAgent]);

    if (loading) {
        return <div className="h-64 flex items-center justify-center text-white/50">Synchronizing Oracle...</div>;
    }

    const regimeName = currentRegime?.regime_type?.replace(/-/g, ' ').toUpperCase() || 'UNKNOWN STATE';
    const regimeColor = currentRegime ? REGIME_COLORS[currentRegime.regime_type] || '#ec4899' : '#333';
    const confidence = currentRegime ? Math.round(currentRegime.confidence * 100) : 0;

    const chartData = [
        { name: "Confidence", value: confidence, fill: regimeColor }
    ];

    const activeAgents = agents.filter(a => a.status !== 'retired');
    const retiredAgents = agents.filter(a => a.status === 'retired').slice(0, 4);

    return (
        <section className="py-20 relative bg-[#050505] border-t border-white/5">
            <div className="container mx-auto px-6 max-w-7xl">

                <div className="mb-12">
                    <h2 className="text-3xl font-display font-black tracking-tighter flex items-center gap-3">
                        <Activity className="w-8 h-8 text-[#ec4899]" />
                        Market Regime Oracle
                    </h2>
                    <p className="text-white/40 font-mono text-sm mt-2 max-w-2xl">
                        Biological adaptation layer. The swarm dynamically shifts composition and lifespan based on classified macroeconomic conditions.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT COLUMN: Regime Gauge */}
                    <div className="col-span-1 bg-white/[0.02] border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[350px]">
                        <div className="absolute top-4 left-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Live Feed</span>
                        </div>

                        <div className="h-48 w-full mt-6">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    cx="50%" cy="50%"
                                    innerRadius="70%" outerRadius="100%"
                                    barSize={15}
                                    data={chartData}
                                    startAngle={180} endAngle={0}
                                >
                                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                                    <RadialBar
                                        background={{ fill: 'rgba(255,255,255,0.05)' }}
                                        dataKey="value"
                                        cornerRadius={10}
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="text-center -mt-16 z-10">
                            <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">Current State</div>
                            <h3 className="text-2xl font-black font-display tracking-tight" style={{ color: regimeColor }}>
                                {regimeName}
                            </h3>
                            <div className="text-3xl font-mono mt-1 font-black text-white">
                                {confidence}% <span className="text-sm font-light text-white/30 tracking-normal">CONFIDENCE</span>
                            </div>
                        </div>

                        {currentRegime && (
                            <div className="w-full mt-8 p-4 bg-black/40 rounded-xl border border-white/5 backdrop-blur-md">
                                <div className="flex justify-between text-xs font-mono text-white/50 mb-2">
                                    <span>Volatility (SPY)</span>
                                    <span className="text-white">{(currentRegime.macro_factors?.spy_volatililty * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono text-white/50">
                                    <span>Sentiment Shift</span>
                                    <span className="text-white">{currentRegime.macro_factors?.sentiment_velocity?.toFixed(2)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Nursery and Cemetery */}
                    <div className="col-span-1 lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* THE NURSERY (Active Agents) */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 flex flex-col h-[350px]">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-white/50 mb-6 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-green-400" />
                                Active Personas
                                <span className="ml-auto bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-[10px]">{activeAgents.length}</span>
                            </h3>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                <AnimatePresence>
                                    {activeAgents.length === 0 && (
                                        <div className="text-center text-white/20 text-xs py-10 font-mono italic">
                                            Awaiting swarm spawn...
                                        </div>
                                    )}
                                    {activeAgents.map(agent => {
                                        const Icon = PERSONA_ICONS[agent.persona] || Brain;
                                        return (
                                            <motion.div
                                                key={agent.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                onClick={() => setSelectedAgent(agent)}
                                                className="p-3 bg-white/[0.03] border border-white/5 rounded-lg flex items-center gap-3 relative overflow-hidden group cursor-pointer hover:border-green-500/30 transition-all"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="p-2 bg-black/50 rounded-md">
                                                    <Icon className="w-4 h-4 text-green-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-white truncate">{agent.persona}</div>
                                                    <div className="text-[10px] text-white/40 font-mono truncate">ID: {agent.id.slice(0, 8)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] uppercase text-white/30 tracking-wider">Status</div>
                                                    <div className="text-xs text-green-400 font-mono flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                        Alive
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* THE CEMETERY (Retired Agents) */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 flex flex-col h-[350px]">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-white/50 mb-6 flex items-center gap-2">
                                <Skull className="w-4 h-4 text-red-400" />
                                Cemetery
                                <span className="ml-auto text-white/20 text-[10px]">Recent Casualties</span>
                            </h3>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                <AnimatePresence>
                                    {retiredAgents.length === 0 && (
                                        <div className="text-center text-white/20 text-xs py-10 font-mono italic">
                                            No recent retirements.
                                        </div>
                                    )}
                                    {retiredAgents.map(agent => {
                                        const Icon = PERSONA_ICONS[agent.persona] || Brain;
                                        return (
                                            <motion.div
                                                key={agent.id}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                onClick={() => setSelectedAgent(agent)}
                                                className="p-3 bg-white/[0.01] border border-white/5 rounded-lg flex items-start gap-3 opacity-60 hover:opacity-100 hover:border-red-500/30 transition-all cursor-pointer"
                                            >
                                                <div className="p-2 bg-black/30 rounded-md grayscale">
                                                    <Icon className="w-4 h-4 text-white/30" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-white/50 line-through truncate">{agent.persona}</div>
                                                    <div className="text-[10px] text-white/30 font-mono mt-1 italic break-words leading-tight">
                                                        "{agent.death_reason || 'Natural expiration'}"
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Agent Detail Modal */}
            <AnimatePresence>
                {selectedAgent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setSelectedAgent(null)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg bg-black/50 border border-white/5 ${selectedAgent.status === 'retired' ? 'text-red-400' : 'text-green-400'}`}>
                                        {(() => {
                                            const AgentIcon = PERSONA_ICONS[selectedAgent.persona] || Brain;
                                            return <AgentIcon className="w-5 h-5" />;
                                        })()}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{selectedAgent.persona}</h3>
                                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">Agent Directive — {selectedAgent.id.slice(0, 8)}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedAgent(null)}
                                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/30 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                                {/* Role Section */}
                                <div>
                                    <h4 className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] mb-3 flex items-center gap-2">
                                        <Shield className="w-3 h-3" /> Technical Directive
                                    </h4>
                                    <p className="text-sm font-medium text-white/90 leading-relaxed italic">
                                        "{PERSONA_DETAILS[selectedAgent.persona]?.role || 'Specialized neural trading agent.'}"
                                    </p>
                                    <p className="text-xs text-white/50 mt-2 leading-relaxed">
                                        {PERSONA_DETAILS[selectedAgent.persona]?.strategy || 'Autonomous strategy execution based on localized regime optimizations.'}
                                    </p>
                                </div>

                                {/* Status Dashboard */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] text-white/20 uppercase font-mono mb-1">Affinity</div>
                                        <div className="text-sm font-bold text-indigo-300">{selectedAgent.regime_affinity.toUpperCase()}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] text-white/20 uppercase font-mono mb-1">Lifespan Status</div>
                                        {selectedAgent.status === 'retired' ? (
                                            <div className="text-sm font-bold text-red-400 flex items-center gap-2">
                                                <Skull className="w-3 h-3" /> DECOMMISSIONED
                                            </div>
                                        ) : (
                                            <div className="text-sm font-bold text-green-400 flex items-center gap-2 animate-pulse">
                                                <Activity className="w-3 h-3" /> MISSION ACTIVE
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Why Terminated/Extended */}
                                <div>
                                    <h4 className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                                        <Clock className="w-3 h-3" /> Lifecycle Log
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="flex gap-4 p-3 rounded-lg bg-black/40 border border-white/5">
                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-1" />
                                            <div>
                                                <div className="text-[10px] font-mono text-white/30">{new Date(selectedAgent.spawn_time).toLocaleString()}</div>
                                                <div className="text-xs text-white/80 mt-1">Initialization: Successful. Synced with {selectedAgent.regime_affinity} dominance.</div>
                                            </div>
                                        </div>
                                        {selectedAgent.status === 'retired' ? (
                                            <div className="flex gap-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                                <div className="w-2 h-2 rounded-full bg-red-500 mt-1" />
                                                <div>
                                                    <div className="text-[10px] font-mono text-red-300/50">{new Date(selectedAgent.death_time!).toLocaleString()}</div>
                                                    <div className="text-xs text-red-200 mt-1">Termination: {selectedAgent.death_reason || 'End of deployment cycle.'}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                                <div className="w-2 h-2 rounded-full bg-green-500 mt-1 animate-pulse" />
                                                <div>
                                                    <div className="text-[10px] font-mono text-green-300/50">STABLE EXTENSION</div>
                                                    <div className="text-xs text-green-200 mt-1">Status: Verified. Mission extended due to continued regime resonance (Confidence &gt; 0.70).</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Mission Work (Logs) */}
                                <div>
                                    <h4 className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                                        <Globe className="w-3 h-3" /> Real-time Mission Stream
                                    </h4>
                                    <div className="space-y-2 bg-black/60 rounded-xl p-4 border border-white/5 font-mono text-[10px] leading-relaxed">
                                        {fetchingLogs ? (
                                            <div className="text-white/20 italic animate-pulse">Syncing neural stream...</div>
                                        ) : selectedAgentLogs.length === 0 ? (
                                            <div className="text-white/20 italic">No specific mission logs recorded in this cycle.</div>
                                        ) : (
                                            selectedAgentLogs.map((log, i) => (
                                                <div key={i} className="flex gap-3 mb-2 opacity-80 hover:opacity-100 transition-opacity">
                                                    <span className="text-purple-400">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                                                    <span className="text-white/70">{log.message}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-white/[0.02] border-t border-white/5 text-[9px] font-mono text-white/20 text-center uppercase tracking-widest">
                                Secure Communication Linked — Orbital Node Ace-01
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </section>
    );
}
