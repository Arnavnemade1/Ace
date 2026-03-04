import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Brain, Shield, Zap, Globe, Cpu, Microscope, Search, TrendingUp, AlertTriangle, Layers, Database, Wifi } from "lucide-react";
import Navigation from "@/components/Navigation";
import RegimeDashboard from "@/components/RegimeDashboard";

const STREAMS = [
    "INIT_NEURAL_PATHWAYS...",
    "CALIBRATING_VIX_THRESHOLD...",
    "SWARM_RESONANCE_STABLE_85%",
    "TRANSITION_SCOUT_ANOMALY_ENERGY",
    "DEPLOYING_SCALPERS_MOMENTUM",
    "RISK_CTRL_CASH_FLOOR_150K",
    "BYPASSING_HOLDING_PERIODS",
];

export default function Oracle() {
    const [logStream, setLogStream] = useState<string[]>([]);
    const [subagents, setSubagents] = useState<any[]>([]);

    useEffect(() => {
        window.scrollTo(0, 0);

        let currentIndex = 0;
        const interval = setInterval(() => {
            setLogStream(prev => {
                const updated = [STREAMS[currentIndex], ...prev].slice(0, 4);
                currentIndex = (currentIndex + 1) % STREAMS.length;
                return updated;
            });
        }, 3000);

        // Fetch subagent states
        const fetchSubagents = async () => {
            const { data } = await supabase
                .from('agent_state')
                .select('*')
                .order('updated_at', { ascending: false });
            if (data) setSubagents(data);
        };

        fetchSubagents();
        const subSub = supabase
            .channel('subagent_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_state' }, () => {
                fetchSubagents();
            })
            .subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(subSub);
        };
    }, []);

    return (
        <div className="min-h-screen bg-[#020202] text-white overflow-x-hidden relative font-sans">
            <Navigation />

            <main className="pt-24 pb-20 relative z-10">
                <div className="container mx-auto px-6 max-w-7xl">

                    {/* Top Row: Mission Status & Neural Stream */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                        <div className="md:col-span-3">
                            <h1 className="text-4xl font-black tracking-tighter mb-2 flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                                    <Layers className="w-8 h-8" />
                                </div>
                                COMMAND CENTER
                            </h1>
                            <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase">
                                Real-time Swarm Intelligence Matrix
                            </p>
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col justify-center">
                            <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Wifi className="w-3 h-3 text-green-400" /> Neural Stream
                            </div>
                            <div className="space-y-1">
                                {logStream.map((log, i) => (
                                    <motion.div
                                        key={`${log}-${i}`}
                                        initial={{ opacity: 0, x: 5 }}
                                        animate={{ opacity: 1 - (i * 0.25), x: 0 }}
                                        className="text-[9px] font-mono text-cyan-400/80"
                                    >
                                        &gt; {log}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Integrated Dashboard Components */}
                    <div className="grid grid-cols-1 gap-12">
                        {/* Subagent Status Matrix */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <Database className="w-5 h-5 text-indigo-400" />
                                <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-white/50">Subagent Core Array</h2>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {subagents.map((agent) => (
                                    <SubagentCard key={agent.id} agent={agent} />
                                ))}
                            </div>
                        </section>

                        {/* The core regime dashboard with nursery/cemetery */}
                        <RegimeDashboard />
                    </div>
                </div>
            </main>

            {/* Micro-monologue Stream - Bottom Fixed */}
            <div className="fixed bottom-0 left-0 right-0 h-10 border-t border-white/5 bg-black/80 backdrop-blur-xl z-50 flex items-center px-6 overflow-hidden">
                <div className="flex items-center gap-6 text-[9px] text-white/30 font-mono w-full">
                    <span className="flex items-center gap-2 text-purple-400/80">
                        <div className="w-1 h-1 rounded-full bg-purple-500 animate-pulse" />
                        NODE_ACE_01: ONLINE
                    </span>
                    <span className="hidden md:flex items-center gap-2">
                        <div className="w-1.5 h-px bg-white/20" />
                        DATALINK: PERSISTENT
                    </span>
                    <span className="ml-auto text-white/20 tracking-[0.3em]">SECURE SECTOR 7-G</span>
                </div>
            </div>
        </div>
    );
}

function SubagentCard({ agent }: { agent: any }) {
    const isError = agent.status === 'error';
    const isActive = agent.status === 'active';

    return (
        <motion.div
            whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.04)' }}
            className="p-4 rounded-xl border border-white/5 bg-white/[0.02] transition-all relative group overflow-hidden"
        >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Brain className="w-12 h-12" />
            </div>

            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-white/40 tracking-wider">0x{agent.id.slice(0, 4)}</span>
                <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${isError ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        isActive ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}>
                    {agent.status}
                </div>
            </div>

            <h3 className="text-sm font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">{agent.agent_name}</h3>
            <p className="text-[10px] text-white/30 italic mb-4 truncate">"{agent.last_action || 'Synchronizing neural pathways...'}"</p>

            <div className="grid grid-cols-2 gap-2 mt-auto">
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                    <div className="text-[8px] text-white/20 uppercase font-mono">Metric</div>
                    <div className="text-xs font-bold text-indigo-300">{agent.metric_value || '0.00'}</div>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-right">
                    <div className="text-[8px] text-white/20 uppercase font-mono">Target</div>
                    <div className="text-[9px] font-mono text-white/60 truncate">{agent.metric_label || 'Wait'}</div>
                </div>
            </div>
        </motion.div>
    );
}

function TacticalCard({ icon, title, value, status }: { icon: any, title: string, value: string, status: string }) {
    return (
        <div className="glass-card p-6 flex items-center justify-between border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-white/5 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
                <div>
                    <h4 className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold mb-1">{title}</h4>
                    <p className="text-sm font-bold tracking-widest text-white/90">{value}</p>
                </div>
            </div>
            <div className="text-[10px] font-mono text-white/40 border border-white/10 px-2 py-1 rounded">
                {status}
            </div>
        </div>
    );
}
