import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Layers, Database, Wifi } from "lucide-react";
import RegimeDashboard from "@/components/RegimeDashboard";
import SwarmMindsetControls from "@/components/SwarmMindsetControls";

const STREAMS = [
    "CAPTAIN_BOOTSTRAP_COMPLETE...",
    "TEAM_ROSTER_SYNCED...",
    "MISSION_PIPELINE_HEALTHY...",
    "RISK_LEAD_CASH_FLOOR_LOCKED...",
    "EXECUTION_HANDOFF_SIGNAL_READY...",
    "REGIME_SHIFT_WATCH_ACTIVE...",
    "SWARM_TEAM_RESONANCE_STABLE...",
];

export default function Oracle() {
    const [logStream, setLogStream] = useState<string[]>([]);
    const [subagents, setSubagents] = useState<any[]>([]);
    const activeCount = subagents.filter((agent) => agent.status === "active").length;
    const idleCount = subagents.filter((agent) => agent.status === "idle").length;
    const errorCount = subagents.filter((agent) => agent.status === "error").length;

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
        <div className="min-h-screen bg-[#101312] text-[#f4efe6] overflow-x-hidden relative">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(206,172,114,0.1),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(107,138,177,0.14),transparent_24%),linear-gradient(180deg,#101312_0%,#0b0d0d_100%)]" />
            <main className="pt-32 pb-20 relative z-10 px-6">
                <div className="mx-auto max-w-[92rem]">

                    {/* Top Row: Mission Status & Neural Stream */}
                    <div className="border-t border-white/10 pt-6 mb-14">
                        <div className="grid grid-cols-1 xl:grid-cols-[0.7fr_0.3fr] gap-6">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.32em] text-white/34 mb-4">Oracle</div>
                                <h1 className="text-5xl md:text-7xl font-display tracking-[-0.05em] leading-[0.92] mb-4 flex items-center gap-4">
                                    <div className="p-3 border border-white/10 bg-black/10 text-[#d8c3a5]">
                                        <Layers className="w-8 h-8" />
                                    </div>
                                    Team Command Deck
                                </h1>
                                <p className="max-w-3xl text-lg leading-8 text-white/58">
                                    Live command surface for the regime engine, adaptive roster, and captain-level coordination logic.
                                </p>
                            </div>
                            <div className="border border-white/8 bg-black/10 p-5 flex flex-col justify-center">
                                <div className="text-[10px] text-white/30 uppercase tracking-[0.24em] mb-3 flex items-center gap-2">
                                    <Wifi className="w-3 h-3 text-[#93d24a]" /> Neural Stream
                                </div>
                                <div className="space-y-2">
                                    {logStream.map((log, i) => (
                                        <motion.div
                                            key={`${log}-${i}`}
                                            initial={{ opacity: 0, x: 5 }}
                                            animate={{ opacity: 1 - (i * 0.25), x: 0 }}
                                            className="text-[11px] tracking-[0.12em] text-[#9bb8d3]"
                                        >
                                            &gt; {log}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Integrated Dashboard Components */}
                    <div className="grid grid-cols-1 gap-12">
                        <SwarmMindsetControls />

                        {/* Subagent Status Matrix */}
                        <section>
                            <div className="flex items-center gap-3 mb-6 flex-wrap">
                                <Database className="w-5 h-5 text-[#d8c3a5]" />
                                <h2 className="text-sm tracking-[0.24em] uppercase text-white/50">Core Team Pods</h2>
                                <div className="h-px flex-1 bg-white/8" />
                                <span className="text-[10px] px-2 py-1 border border-[#93d24a]/30 text-[#93d24a] bg-[#93d24a]/8">Active {activeCount}</span>
                                <span className="text-[10px] px-2 py-1 border border-white/10 text-white/50">Idle {idleCount}</span>
                                <span className="text-[10px] px-2 py-1 border border-[#ff8362]/30 text-[#ff8362] bg-[#ff8362]/10">Error {errorCount}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {subagents.map((agent) => (
                                    <SubagentCard key={agent.id} agent={agent} />
                                ))}
                            </div>
                        </section>

                        {/* Dynamic team lifecycle dashboard */}
                        <RegimeDashboard />
                    </div>
                </div>
            </main>

            {/* Micro-monologue Stream - Bottom Fixed */}
            <div className="fixed bottom-0 left-0 right-0 h-10 border-t border-white/8 bg-[#0c0f0f]/80 backdrop-blur-xl z-40 flex items-center px-6 overflow-hidden">
                <div className="flex items-center gap-6 text-[9px] text-white/30 w-full uppercase tracking-[0.24em]">
                    <span className="flex items-center gap-2 text-[#d8c3a5]">
                        <div className="w-1 h-1 rounded-full bg-[#93d24a] animate-pulse" />
                        NODE_ACE_01: ONLINE
                    </span>
                    <span className="hidden md:flex items-center gap-2">
                        <div className="w-1.5 h-px bg-white/20" />
                        TEAMLINK: PERSISTENT
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
            whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.03)' }}
            className="p-5 border border-white/8 bg-black/10 transition-all relative group overflow-hidden"
        >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Brain className="w-12 h-12" />
            </div>

            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-white/40 tracking-wider">0x{agent.id.slice(0, 4)}</span>
                <div className={`px-2 py-0.5 text-[8px] uppercase border ${isError ? 'bg-[#ff8362]/10 text-[#ff8362] border-[#ff8362]/30' :
                        isActive ? 'bg-[#93d24a]/10 text-[#93d24a] border-[#93d24a]/30' :
                            'bg-[#9bb8d3]/10 text-[#9bb8d3] border-[#9bb8d3]/30'
                    }`}>
                    {agent.status}
                </div>
            </div>

            <h3 className="text-lg font-display text-white mb-1 group-hover:text-[#d8c3a5] transition-colors">{agent.agent_name}</h3>
            <p className="text-[10px] text-white/30 italic mb-4 truncate">"{agent.last_action || 'Synchronizing neural pathways...'}"</p>

            <div className="grid grid-cols-2 gap-2 mt-auto">
                <div className="p-2 bg-black/30 border border-white/8">
                    <div className="text-[8px] text-white/20 uppercase font-mono">Metric</div>
                    <div className="text-xs font-bold text-[#d8c3a5]">{agent.metric_value || '0.00'}</div>
                </div>
                <div className="p-2 bg-black/30 border border-white/8 text-right">
                    <div className="text-[8px] text-white/20 uppercase font-mono">Mission</div>
                    <div className="text-[9px] font-mono text-white/60 truncate">{agent.metric_label || 'Wait'}</div>
                </div>
            </div>
        </motion.div>
    );
}
