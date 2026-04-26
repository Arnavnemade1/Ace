import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
    RadialBarChart,
    RadialBar,
    ResponsiveContainer,
    PolarAngleAxis
} from "recharts";

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
    task?: string;
    specialization?: string;
}

const REGIME_COLORS: Record<string, string> = {
    'high-vol-reversion': '#ff8362',
    'low-vol-trend': '#93d24a',
    'quiet-accumulation': '#d8c3a5',
    'crisis-transition': '#f4efe6',
    'commodity-supercycle': '#ea580c'
};

function hashText(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function parseMission(task?: string) {
    const mission = String(task || '').trim();
    const deliverable = mission.match(/Deliverable:\s*([^.]*)/i)?.[1]?.trim();
    const success = mission.match(/Success:\s*([^.]*)/i)?.[1]?.trim();
    const handoff = mission.match(/Handoff:\s*([^.]*)/i)?.[1]?.trim();
    const summary = mission.replace(/\s*Deliverable:.*$/i, '').trim() || 'Adaptive mission assigned by Orchestrator.';
    return { summary, deliverable, success, handoff };
}

function isGenericPersonaName(name?: string) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return true;
    return /(momentum|intraday|trader|scalper|chaser|sniper|harvester|hunter|agent\s*\d*)/.test(n);
}

function personaLabel(agent: Pick<AgentLifecycle, 'persona' | 'id' | 'regime_affinity' | 'specialization'>) {
    const original = String(agent.persona || '').trim();
    if (!isGenericPersonaName(original)) return original;

    const leftTokens = ['Vector', 'Atlas', 'Signal', 'Pulse', 'Flux', 'Grid', 'Kernel', 'Vertex'];
    const rightTokens = ['Protocol', 'Relay', 'Sentinel', 'Circuit', 'Map', 'Forge', 'Ledger', 'Pilot'];
    const seed = hashText(`${agent.id}|${agent.regime_affinity}|${agent.specialization || ''}`);
    const left = leftTokens[seed % leftTokens.length];
    const right = rightTokens[(seed >> 3) % rightTokens.length];
    return `${left} ${right} ${agent.id.slice(0, 4).toUpperCase()}`;
}

export default function RegimeDashboard() {
    const [currentRegime, setCurrentRegime] = useState<Regime | null>(null);
    const [agents, setAgents] = useState<AgentLifecycle[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<AgentLifecycle | null>(null);
    const [selectedAgentLogs, setSelectedAgentLogs] = useState<any[]>([]);
    const [fetchingLogs, setFetchingLogs] = useState(false);

    useEffect(() => {
        const fetchState = async () => {
            const { data: regimeData } = await (supabase as any).from('market_regimes').select('*').order('created_at', { ascending: false }).limit(1).single();
            if (regimeData) setCurrentRegime(regimeData as Regime);
            const { data: agentData } = await (supabase as any).from('agent_lifecycles').select('*').order('created_at', { ascending: false }).limit(10);
            if (agentData) setAgents(agentData as AgentLifecycle[]);
            setLoading(false);
        };
        fetchState();

        const regimeSub = supabase.channel('regime_updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_regimes' }, (payload) => { setCurrentRegime(payload.new as Regime); }).subscribe();
        const agentSub = supabase.channel('agent_updates').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_lifecycles' }, (payload) => {
            setAgents(prev => {
                if (payload.eventType === 'INSERT') return [payload.new as AgentLifecycle, ...prev].slice(0, 10);
                if (payload.eventType === 'UPDATE') return prev.map(a => a.id === payload.new.id ? payload.new as AgentLifecycle : a);
                return prev;
            });
        }).subscribe();

        return () => {
            supabase.removeChannel(regimeSub);
            supabase.removeChannel(agentSub);
        };
    }, []);

    useEffect(() => {
        const fetchAgentLogs = async () => {
            if (!selectedAgent) return;
            setFetchingLogs(true);
            const { data } = await supabase.from('agent_logs').select('*').or(`agent_name.eq.${selectedAgent.persona},message.ilike.%${selectedAgent.persona}%,log_type.eq.decision`).order('created_at', { ascending: false }).limit(5);
            setSelectedAgentLogs(data || []);
            setFetchingLogs(false);
        };
        fetchAgentLogs();
    }, [selectedAgent]);

    if (loading) return <div className="h-64 flex items-center justify-center text-white/10 font-mono tracking-widest uppercase">Synchronizing Oracle...</div>;

    const regimeName = currentRegime?.regime_type?.replace(/-/g, ' ').toUpperCase() || 'UNKNOWN STATE';
    const regimeColor = currentRegime ? REGIME_COLORS[currentRegime.regime_type] || '#f4efe6' : '#333';
    const confidence = currentRegime ? Math.round(currentRegime.confidence * 100) : 0;
    const chartData = [{ name: "Confidence", value: confidence, fill: regimeColor }];

    const activeAgents = agents.filter(a => a.status !== 'retired');
    const retiredAgents = agents.filter(a => a.status === 'retired').slice(0, 4);

    return (
        <section className="py-20 relative bg-[#020202]">
            <div className="container mx-auto px-6 max-w-7xl">
                <div className="mb-16 space-y-4">
                    <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">// Market Regime Lifecycle</div>
                    <h2 className="text-4xl md:text-6xl font-display font-black tracking-tighter uppercase leading-[0.85]">
                        Neural Roster <br /> <span className="text-white/20">Evolution.</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="col-span-1 border border-white/5 bg-white/[0.01] p-10 flex flex-col items-center justify-center min-h-[400px]">
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart cx="50%" cy="50%" innerRadius="85%" outerRadius="100%" barSize={10} data={chartData} startAngle={180} endAngle={0}>
                                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                                    <RadialBar background={{ fill: 'rgba(255,255,255,0.02)' }} dataKey="value" cornerRadius={0} />
                                </RadialBarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-center -mt-12 space-y-2">
                            <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] font-mono italic">Regime Probability</div>
                            <h3 className="text-2xl font-black font-display tracking-tight" style={{ color: regimeColor }}>{regimeName}</h3>
                            <div className="text-4xl font-display font-black text-white tracking-tighter">{confidence}%</div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-white/20 border-b border-white/5 pb-4 flex justify-between">
                                <span>ACTIVE_TEAM</span>
                                <span className="text-[#93d24a]">{activeAgents.length} NODES</span>
                            </div>
                            <div className="space-y-3">
                                {activeAgents.map(agent => (
                                    <div key={agent.id} onClick={() => setSelectedAgent(agent)} className="p-5 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all cursor-pointer group">
                                        <div className="flex justify-between items-start mb-4">
                                          <div className="text-lg font-display font-black tracking-tighter text-white uppercase">{personaLabel(agent)}</div>
                                          <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] shadow-[0_0_8px_#93d24a]" />
                                        </div>
                                        <div className="text-[10px] text-white/40 font-mono tracking-wide uppercase truncate">Directive: {parseMission(agent.task).summary}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-white/20 border-b border-white/5 pb-4 flex justify-between">
                                <span>RETIRED_NODES</span>
                                <span className="text-white/10">{retiredAgents.length} ROTATED</span>
                            </div>
                            <div className="space-y-3">
                                {retiredAgents.map(agent => (
                                    <div key={agent.id} onClick={() => setSelectedAgent(agent)} className="p-5 border border-white/5 bg-white/[0.01] opacity-40 hover:opacity-100 transition-all cursor-pointer group grayscale hover:grayscale-0">
                                        <div className="text-lg font-display font-black tracking-tighter text-white/50 line-through uppercase">{personaLabel(agent)}</div>
                                        <div className="text-[9px] text-white/20 font-mono mt-2 italic break-words">"{agent.death_reason || 'CYCLE_COMPLETE'}"</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {selectedAgent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={() => setSelectedAgent(null)} />
                        <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} className="relative w-full max-w-2xl bg-[#020202] border border-white/10 p-12 space-y-12 overflow-y-auto max-h-[85vh]">
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.4em] italic">// NODE_DATA_EXTRACT_{selectedAgent.id.slice(0, 8)}</div>
                                <h3 className="text-5xl font-display font-black text-white tracking-tighter uppercase">{personaLabel(selectedAgent)}</h3>
                            </div>

                            <div className="space-y-6">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-2">MISSION_BRIEF</div>
                                <p className="text-lg font-display font-bold text-white/90 italic leading-snug">"{parseMission(selectedAgent.task).summary}"</p>
                                <div className="grid grid-cols-2 gap-8 text-[11px] text-white/40 font-mono tracking-wider">
                                    <div className="space-y-1 uppercase">
                                      <div className="text-white/20">Specialty</div>
                                      <div className="text-white/80">{selectedAgent.specialization || 'ADAPTIVE'}</div>
                                    </div>
                                    <div className="space-y-1 uppercase text-right">
                                      <div className="text-white/20">Deliverable</div>
                                      <div className="text-white/80">{parseMission(selectedAgent.task).deliverable || 'NA'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-2">NEURAL_STREAM</div>
                                <div className="space-y-3 font-mono text-[10px] text-white/40">
                                    {fetchingLogs ? <div className="animate-pulse italic">SYNCING_STREAM...</div> : selectedAgentLogs.length === 0 ? <div className="italic">NO_LOGS_IN_BUFFER</div> : selectedAgentLogs.map((log, i) => (
                                        <div key={i} className="flex gap-4 opacity-60">
                                            <span className="text-[#d8c3a5]">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                                            <span>{log.message}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button onClick={() => setSelectedAgent(null)} className="w-full py-4 border border-white/10 text-[10px] font-mono tracking-[0.4em] uppercase hover:bg-white/5 transition-all mt-8">CLOSE_INTERFACE</button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </section>
    );
}
