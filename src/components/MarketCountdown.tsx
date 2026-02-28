import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, TrendingUp, Circle } from "lucide-react";

function getMarketStatus() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = nyTime.getDay(); // 0=Sun, 6=Sat
    const mins = nyTime.getHours() * 60 + nyTime.getMinutes();
    const preMarket = mins >= 4 * 60 && mins < 9 * 60 + 30;
    const regularHours = mins >= 9 * 60 + 30 && mins < 16 * 60;
    const afterHours = mins >= 16 * 60 && mins < 20 * 60;
    const isWeekday = day >= 1 && day <= 5;

    if (!isWeekday) {
        // Find next Monday 9:30am ET
        const daysUntilMon = (8 - day) % 7 || 7;
        const nextOpen = new Date(nyTime);
        nextOpen.setDate(nyTime.getDate() + daysUntilMon);
        nextOpen.setHours(9, 30, 0, 0);
        return { status: "closed", label: "WEEKEND", nextOpen, isOpen: false };
    }

    if (regularHours) {
        // Market closes at 4pm
        const close = new Date(nyTime);
        close.setHours(16, 0, 0, 0);
        return { status: "open", label: "OPEN", nextClose: close, isOpen: true };
    }

    if (preMarket) {
        const open = new Date(nyTime);
        open.setHours(9, 30, 0, 0);
        return { status: "premarket", label: "PRE-MARKET", nextOpen: open, isOpen: false };
    }

    if (afterHours) {
        // Open tomorrow at 9:30am
        const nextOpen = new Date(nyTime);
        nextOpen.setDate(nyTime.getDate() + (day === 5 ? 3 : 1));
        nextOpen.setHours(9, 30, 0, 0);
        return { status: "afterhours", label: "AFTER HOURS", nextOpen, isOpen: false };
    }

    // Overnight closed
    const nextOpen = new Date(nyTime);
    nextOpen.setDate(nyTime.getDate() + (day === 5 ? 3 : 1));
    nextOpen.setHours(9, 30, 0, 0);
    return { status: "closed", label: "CLOSED", nextOpen, isOpen: false };
}

function formatCountdown(target: Date) {
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return "00:00:00";
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const MarketCountdown = ({ compact = false }: { compact?: boolean }) => {
    const [mkt, setMkt] = useState(getMarketStatus());
    const [countdown, setCountdown] = useState("");
    const [userTz] = useState(() =>
        Intl.DateTimeFormat().resolvedOptions().timeZone
    );

    useEffect(() => {
        const tick = () => {
            const m = getMarketStatus();
            setMkt(m);
            const target = m.isOpen ? (m as any).nextClose : (m as any).nextOpen;
            if (target) setCountdown(formatCountdown(target));
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, []);

    const color =
        mkt.status === "open" ? "#00ff41" :
            mkt.status === "premarket" ? "#ffe600" :
                mkt.status === "afterhours" ? "#f97316" : "#ffffff50";

    const localTime = new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZoneName: "short"
    });

    if (compact) {
        return (
            <div className="flex items-center gap-3 text-xs font-mono">
                <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="font-bold uppercase tracking-widest" style={{ color }}>
                    NYSE {mkt.label}
                </span>
                {countdown && (
                    <span className="text-white/40">
                        {mkt.isOpen ? "closes in" : "opens in"} {countdown}
                    </span>
                )}
                <span className="text-white/25 hidden md:inline">{localTime}</span>
            </div>
        );
    }

    return (
        <motion.div
            className="rounded border font-mono overflow-hidden"
            style={{ borderColor: `${color}30`, backgroundColor: `${color}05` }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="h-[1px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <motion.div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: color }}
                            animate={{ opacity: [1, 0.2, 1] }}
                            transition={{ duration: 1.2, repeat: Infinity }}
                        />
                        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
                            NYSE / NASDAQ — {mkt.label}
                        </span>
                    </div>
                    <Clock className="w-3.5 h-3.5 text-white/30" />
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={countdown}
                        className="text-3xl font-black tracking-widest"
                        style={{ color }}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                    >
                        {countdown || "--:--:--"}
                    </motion.div>
                </AnimatePresence>

                <div className="mt-2 text-[10px] text-white/30 flex gap-3">
                    <span>{mkt.isOpen ? "Market closes in" : "Market opens in"}</span>
                    <span>Your time: {localTime}</span>
                </div>

                {!mkt.isOpen && (
                    <div className="mt-3 text-[10px] text-white/40 border-t border-white/5 pt-2">
                        ACE is actively scanning {compact ? "" : "35+ symbols"} and queueing GTC orders — all positions execute automatically at market open.
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default MarketCountdown;
