import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Wifi, WifiOff, Loader2 } from "lucide-react";

export const HandshakeOverlay = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<number>(0);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        // Initial check for recent activity (last 30 seconds)
        const checkConnection = async () => {
            const { data } = await supabase
                .from('agent_logs')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) {
                const lastSeen = new Date(data.created_at).getTime();
                const now = Date.now();
                if (now - lastSeen < 30000) {
                    setIsConnected(true);
                    setLastHeartbeat(lastSeen);
                }
            }
            setIsChecking(false);
        };

        checkConnection();

        // Listen for new heartbeats or logs
        const channel = supabase.channel('handshake-monitor')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, (payload) => {
                setIsConnected(true);
                setLastHeartbeat(Date.now());
            })
            .subscribe();

        // Fail-safe: if no heartbeat for 60 seconds, show offline
        const interval = setInterval(() => {
            if (lastHeartbeat > 0 && Date.now() - lastHeartbeat > 60000) {
                setIsConnected(false);
            }
        }, 10000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [lastHeartbeat]);

    return (
        <AnimatePresence>
            {(!isConnected || isChecking) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center"
                >
                    <div className="relative mb-12">
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="absolute inset-0 bg-primary blur-[100px] rounded-full"
                        />
                        <div className="relative bg-black/40 border border-white/10 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
                            <Cpu className="w-16 h-16 text-primary mb-6 mx-auto animate-pulse" />
                            <h2 className="text-3xl font-display font-black tracking-tighter text-white mb-2 uppercase">
                                Daemon Handshake
                            </h2>
                            <p className="text-white/40 font-mono text-[10px] uppercase tracking-[0.3em] mb-8">
                                Establishing Neural Link to Swarm Orchestrator
                            </p>

                            <div className="flex flex-col items-center gap-4">
                                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                    <span className="text-[10px] font-mono text-white/60 tracking-widest uppercase">
                                        {isChecking ? "Synchronizing..." : "Awaiting Heartbeat..."}
                                    </span>
                                </div>

                                <p className="max-w-xs text-[10px] text-white/20 leading-relaxed italic">
                                    Start the trading daemon in your terminal to continue:<br />
                                    <code className="text-primary/60 not-italic">npm run daemon</code>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="fixed bottom-12 flex items-center gap-4 text-white/20 font-mono text-[9px] uppercase tracking-widest">
                        <WifiOff className="w-3 h-3" />
                        Status: Offline
                        <div className="w-px h-3 bg-white/10" />
                        Auth: Encrypted
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
