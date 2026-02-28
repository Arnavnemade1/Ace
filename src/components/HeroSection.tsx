import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Activity, Zap, TrendingUp, Shield, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { MarketCountdown } from "@/components/MarketCountdown";

const HeroSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [positions, setPositions] = useState<number>(0);
  const [signalCount, setSignalCount] = useState<number>(0);

  useEffect(() => {
    const loadPortfolio = async () => {
      const { data } = await (supabase as any)
        .from("portfolio_state")
        .select("total_value, positions")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setPortfolioValue(data.total_value);
        setPositions(Array.isArray(data.positions) ? data.positions.length : 0);
      }

      const { count } = await (supabase as any)
        .from("signals")
        .select("id", { count: "exact", head: true });
      setSignalCount(count || 0);
    };
    loadPortfolio();

    const ch = (supabase as any)
      .channel("hero-portfolio")
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_state" }, (p: any) => {
        setPortfolioValue(p.new.total_value);
        setPositions(Array.isArray(p.new.positions) ? p.new.positions.length : 0);
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const displayValue = portfolioValue
    ? `$${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "$100,000";
  const returnPct = portfolioValue
    ? ((portfolioValue - 100000) / 100000 * 100)
    : 0;

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
      {/* Deep grid */}
      <div className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,65,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,65,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,255,65,0.06) 0%, transparent 70%)" }}
      />

      {/* Scanline overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-px h-px bg-[#00ff41] rounded-full"
          style={{
            left: `${10 + (i * 7.8) % 80}%`,
            top: `${15 + (i * 11.3) % 70}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0, 0.6, 0],
            scale: [0, 2, 0],
          }}
          transition={{
            duration: 3 + i * 0.4,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        />
      ))}

      <motion.div style={{ opacity }} className="relative z-10 container mx-auto px-6">
        {/* Top pill badge */}
        <motion.div
          className="flex items-center justify-center mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-2.5 border border-[#00ff41]/20 bg-[#00ff41]/5 rounded-full px-5 py-2 backdrop-blur-sm">
            <motion.div
              className="w-2 h-2 rounded-full bg-[#00ff41]"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span className="text-[11px] text-[#00ff41]/80 font-mono uppercase tracking-widest font-bold">
              System Online — Autonomous Mode — 8 Agents Active
            </span>
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="text-center font-mono font-black leading-[0.88] tracking-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
        >
          <span className="block text-4xl md:text-6xl lg:text-7xl text-white/80 mb-2 font-light tracking-widest uppercase text-[13px] md:text-sm mb-4">
            Autonomous Trading Intelligence
          </span>
          <span className="block text-5xl md:text-7xl lg:text-8xl xl:text-9xl text-white">
            ACE
          </span>
          <span className="block text-xl md:text-3xl lg:text-4xl mt-3" style={{ color: "#00ff41" }}>
            Multi-Agent Capital Engine
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          className="text-center text-sm md:text-base text-white/40 max-w-2xl mx-auto mb-12 font-mono leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Eight specialized AI agents scanning 35+ instruments across equities, ETFs, and crypto 24/7.
          Signals are evaluated every 60 seconds. Orders execute autonomously via Alpaca paper trading.
        </motion.p>

        {/* Live stat cards */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <div className="border border-[#00ff41]/20 bg-black/60 backdrop-blur rounded px-5 py-3 font-mono text-center min-w-[140px]">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Portfolio Value</div>
            <div className="text-lg font-bold text-white">{displayValue}</div>
            {returnPct !== 0 && (
              <div className={`text-[10px] mt-0.5 ${returnPct >= 0 ? "text-[#00ff41]" : "text-red-400"}`}>
                {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
              </div>
            )}
          </div>
          <div className="border border-white/10 bg-black/60 backdrop-blur rounded px-5 py-3 font-mono text-center min-w-[140px]">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Active Positions</div>
            <div className="text-lg font-bold text-white">{positions}</div>
            <div className="text-[10px] text-white/25 mt-0.5">Open holdings</div>
          </div>
          <div className="border border-white/10 bg-black/60 backdrop-blur rounded px-5 py-3 font-mono text-center min-w-[140px]">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Signals Generated</div>
            <div className="text-lg font-bold text-white">{signalCount.toLocaleString()}</div>
            <div className="text-[10px] text-white/25 mt-0.5">This session</div>
          </div>
          <div className="border border-white/10 bg-black/60 backdrop-blur rounded px-5 py-3 font-mono text-center min-w-[140px]">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Symbols Scanned</div>
            <div className="text-lg font-bold text-white">35+</div>
            <div className="text-[10px] text-white/25 mt-0.5">+ live movers</div>
          </div>
        </motion.div>

        {/* Market Countdown */}
        <motion.div
          className="max-w-sm mx-auto mb-12"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <MarketCountdown />
        </motion.div>

        {/* CTA Row */}
        <motion.div
          className="flex items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
        >
          <Link
            to="/analytics"
            className="flex items-center gap-2 px-6 py-3 bg-[#00ff41] text-black text-sm font-mono font-bold rounded hover:bg-[#00ff41]/90 transition-all tracking-widest uppercase"
          >
            Live Analytics <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/arena"
            className="flex items-center gap-2 px-6 py-3 border border-white/20 text-white text-sm font-mono font-medium rounded hover:border-white/40 hover:bg-white/5 transition-all tracking-widest uppercase"
          >
            Agent Arena
          </Link>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        <div className="w-px h-12 bg-gradient-to-b from-[#00ff41]/40 to-transparent" />
      </motion.div>
    </section>
  );
};

export default HeroSection;
