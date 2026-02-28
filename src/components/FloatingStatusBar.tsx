import { MarketCountdown } from "./MarketCountdown";
import { motion } from "framer-motion";

export const FloatingStatusBar = () => {
    return (
        <div className="fixed bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-6">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="pointer-events-auto h-10 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-full px-6 flex items-center gap-4 shadow-2xl"
            >
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse shadow-[0_0_8px_#00ff41]" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">System Normal</span>
                </div>
                <div className="h-3 w-px bg-white/10" />
                <MarketCountdown compact />
            </motion.div>
        </div>
    );
};
