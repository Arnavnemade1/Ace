import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Wifi, WifiOff, Loader2 } from "lucide-react";

export const HandshakeOverlay = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<number>(0);
    const [isChecking, setIsChecking] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        // Initial check for recent activity (last 30 seconds)
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
                if (now - lastSeen < 30000) {
                    setIsConnected(true);
                    setLastHeartbeat(lastSeen);
                    setErrorMsg(null);
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
                setErrorMsg(null);
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
            {!isConnected && !isChecking && (
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
                >
                    <div className="bg-black/80 backdrop-blur-xl border border-red-500/20 px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl">
                        <div className="relative">
                            <WifiOff className="w-3 h-3 text-red-500" />
                            <div className="absolute inset-0 bg-red-500 blur-sm rounded-full animate-pulse opacity-50" />
                        </div>
                        <span className="text-[9px] font-mono text-white/60 uppercase tracking-widest">
                            Daemon Disconnected
                        </span>
                        <div className="h-2 w-px bg-white/10" />
                        <span className="text-[8px] font-mono text-white/30 uppercase tracking-tighter">
                            {errorMsg ? `Supabase: ${errorMsg}` : 'Check npm run daemon'}
                        </span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
