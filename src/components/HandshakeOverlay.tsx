import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Wifi, WifiOff, Loader2, Zap } from "lucide-react";

export const HandshakeOverlay = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<number>(0);
    const [isChecking, setIsChecking] = useState(true);
    const [isTriggering, setIsTriggering] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const triggerOrchestrator = useCallback(async () => {
        setIsTriggering(true);
        setErrorMsg(null);
        try {
            const { data, error } = await supabase.functions.invoke('orchestrator', {
                body: { mode: 'full_cycle' }
            });
            if (error) throw error;
            setIsConnected(true);
            setLastHeartbeat(Date.now());
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to trigger orchestrator');
        } finally {
            setIsTriggering(false);
        }
    }, []);

    useEffect(() => {
        const checkConnection = async () => {
            const { data, error } = await supabase
                .from('agent_logs')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                setErrorMsg(error.message);
            } else if (data) {
                const lastSeen = new Date(data.created_at).getTime();
                const now = Date.now();
                if (now - lastSeen < 120000) {
                    setIsConnected(true);
                    setLastHeartbeat(lastSeen);
                    setErrorMsg(null);
                }
            }
            setIsChecking(false);
        };

        checkConnection();

        const channel = supabase.channel('handshake-monitor')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_logs' }, () => {
                setIsConnected(true);
                setLastHeartbeat(Date.now());
                setErrorMsg(null);
            })
            .subscribe();

        const interval = setInterval(() => {
            if (lastHeartbeat > 0 && Date.now() - lastHeartbeat > 120000) {
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
            {!isConnected && !isChecking && (
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="fixed top-24 left-1/2 -translate-x-1/2 z-[100]"
                >
                    <div className="bg-black/80 backdrop-blur-xl border border-red-500/20 px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl">
                        <div className="relative">
                            <WifiOff className="w-3 h-3 text-red-500" />
                            <div className="absolute inset-0 bg-red-500 blur-sm rounded-full animate-pulse opacity-50" />
                        </div>
                        <span className="text-[9px] font-mono text-white/60 uppercase tracking-widest">
                            Daemon Offline
                        </span>
                        <div className="h-2 w-px bg-white/10" />
                        <button
                            onClick={triggerOrchestrator}
                            disabled={isTriggering}
                            className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-primary hover:text-white transition-colors disabled:opacity-50 pointer-events-auto"
                        >
                            {isTriggering ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Handshaking...</>
                            ) : (
                                <><Zap className="w-3 h-3" /> Trigger Handshake</>
                            )}
                        </button>
                        {errorMsg && (
                            <>
                                <div className="h-2 w-px bg-white/10" />
                                <span className="text-[8px] font-mono text-red-400/70 max-w-32 truncate">{errorMsg}</span>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
            {isConnected && (
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
                >
                    <motion.div
                        initial={{ scale: 1 }}
                        animate={{ opacity: [1, 0] }}
                        transition={{ delay: 3, duration: 1 }}
                        className="bg-black/80 backdrop-blur-xl border border-primary/30 px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl"
                    >
                        <Wifi className="w-3 h-3 text-primary" />
                        <span className="text-[9px] font-mono text-primary uppercase tracking-widest">
                            Daemon Connected
                        </span>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
