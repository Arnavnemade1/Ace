import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Brain, Shield, Zap, Globe, Cpu, Microscope, Search, TrendingUp, AlertTriangle } from "lucide-react";
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
    "GEO_SENTIMENT_NEUTRAL_BEARISH",
    "ENTROPY_DECAY_AGENT_COMM",
    "REGIME_MATRIX_CONVERGENCE"
];

export default function Oracle() {
    const [logStream, setLogStream] = useState<string[]>([]);
    const [currentRegime, setCurrentRegime] = useState<any>(null);
    const [confidence, setConfidence] = useState(73);

    useEffect(() => {
        window.scrollTo(0, 0);

        let currentIndex = 0;
        const interval = setInterval(() => {
            setLogStream(prev => {
                const updated = [STREAMS[currentIndex], ...prev].slice(0, 6);
                currentIndex = (currentIndex + 1) % STREAMS.length;
                return updated;
            });
        }, 2000);

        // Fetch current regime
        const fetchRegime = async () => {
            const { data } = await (supabase as any)
                .from('regime_classifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (data) {
                setCurrentRegime(data);
                setConfidence(Math.round(((data as any).confidence || 0.73) * 100));
            }
        };

        fetchRegime();
        const regimeSub = supabase
            .channel('regime_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'regime_classifications' }, (payload: any) => {
                setCurrentRegime(payload.new);
                setConfidence(Math.round(((payload.new as any).confidence || 0.73) * 100));
            })
            .subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(regimeSub);
        };
    }, []);

    const regimeTitle = currentRegime?.regime_name || "HIGH VOL REVERSION";

    return (
        <div className="min-h-screen bg-[#020202] text-white overflow-x-hidden relative font-sans">
            {/* Ambient Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[20%] right-[20%] w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <Navigation />

            <main className="pt-32 pb-20 relative z-10">
                <div className="container mx-auto px-6 max-w-7xl">
                    {/* Header Section - Authentic Minimalist Style */}
                    <div className="flex flex-col items-center text-center mb-24">
                        {/* Upper Badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 mb-8"
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                            <span className="text-[10px] font-bold tracking-[0.2em] text-white/70 uppercase">Neural Inference Engine</span>
                        </motion.div>

                        {/* Title - Gradient Authentic */}
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-7xl md:text-8xl font-black tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-cyan-400"
                            style={{ letterSpacing: '-0.05em' }}
                        >
                            ORACLE
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-white/40 text-xs font-mono tracking-[0.4em] uppercase mb-12"
                        >
                            Omniscient Market Intelligence
                        </motion.p>

                        {/* Regime Status Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center px-10 py-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md shadow-2xl relative group"
                        >
                            <div className="absolute -inset-px bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.8)]" />
                                <span className="text-sm font-bold tracking-[0.15em] text-indigo-100 uppercase">{regimeTitle}</span>
                            </div>
                            <span className="text-[10px] text-white/40 font-mono tracking-widest">{confidence}% confidence</span>
                        </motion.div>
                    </div>

                    {/* Integrated Dashboard Components */}
                    <div className="grid grid-cols-1 gap-12">
                        {/* The core regime dashboard with nursery/cemetery */}
                        <RegimeDashboard />

                        {/* Tactical Signal Strip */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <TacticalCard
                                icon={<Activity className="text-purple-400" />}
                                title="Vol Dynamics"
                                value="CLUSTERING"
                                status="STABLE"
                            />
                            <TacticalCard
                                icon={<TrendingUp className="text-cyan-400" />}
                                title="Regime Persistence"
                                value="42 CYCLES"
                                status="HIGH"
                            />
                            <TacticalCard
                                icon={<Zap className="text-amber-400" />}
                                title="Neural Velocity"
                                value="1.2 GB/S"
                                status="OPTIMAL"
                            />
                        </div>
                    </div>
                </div>
            </main>

            {/* Micro-monologue Stream - Bottom Fixed */}
            <div className="fixed bottom-0 left-0 right-0 h-12 border-t border-white/5 bg-black/80 backdrop-blur-xl z-50 flex items-center px-6 overflow-hidden">
                <div className="flex items-center gap-3 text-[10px] font-mono whitespace-nowrap">
                    <span className="text-purple-400 font-bold border-r border-white/10 pr-3 mr-1">SYSTEM_STREAM</span>
                    <AnimatePresence mode="popLayout">
                        <motion.div
                            key={logStream[0]}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="text-white/60 tracking-widest"
                        >
                            {logStream[0]}
                        </motion.div>
                    </AnimatePresence>
                </div>
                <div className="ml-auto flex items-center gap-6 text-[10px] text-white/30 font-mono">
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-green-500" />
                        NODE_01: ACTIVE
                    </span>
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-green-500" />
                        DATALINK: SECURE
                    </span>
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-amber-500" />
                        HEURISTIC: 0.982
                    </span>
                </div>
            </div>
        </div>
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
