import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { ArrowRight, Activity, Zap, Cpu, TrendingUp, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { MarketCountdown } from "@/components/MarketCountdown";

const HeroSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
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

  // Eliminating 0 displays with smart labels
  const positionDisplay = positions > 0 ? positions : "NOMINAL";
  const signalDisplay = signalCount > 0 ? signalCount.toLocaleString() : "SCANNING";

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#020202]">
      {/* High-End Background: Deep Dark with Ace Spectrum Glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Spectrum Light Leaks (Logo Colors) */}
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] rounded-full opacity-[0.12] bg-[#8b5cf6] blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full opacity-[0.1] bg-[#00ff41] blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] rounded-full opacity-[0.05] bg-[#ea580c] blur-[160px]" />

        {/* Modern grain/noise for texture */}
        <div className="absolute inset-0 opacity-[0.03] contrast-150 brightness-150 pointer-events-none"
          style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      </div>

      <motion.div style={{ opacity, y }} className="relative z-10 container mx-auto px-6 pt-32 pb-20">
        <div className="max-w-6xl mx-auto flex flex-col items-center">

          {/* Logo-Colored Gradient Title */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-center group"
          >
            <h1 className="text-[140px] md:text-[240px] font-display font-black tracking-[-0.1em] leading-[0.7] select-none">
              <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#00ff41] animate-gradient-slow pb-8 block filter drop-shadow-[0_0_30px_rgba(139,92,246,0.2)]">
                ACE
              </span>
            </h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 1 }}
              className="mt-16 space-y-6"
            >
              <h2 className="text-2xl md:text-3xl font-display font-extralight tracking-[0.2em] uppercase text-white/90">
                Autonomous <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0ea5e9] to-[#00ff41] font-medium italic">Capital</span> Intelligence
              </h2>
              <p className="text-[10px] md:text-xs text-white/20 max-w-xl mx-auto font-mono leading-relaxed tracking-[0.3em] uppercase">
                Specialized neural architecture // absolute zero human oversight
              </p>
            </motion.div>
          </motion.div>

          {/* Unified System Signature (Replaces Cluttered Grid) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="w-full max-w-4xl mt-24 mb-20 border-y border-white/[0.03] py-8"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 items-center justify-center gap-y-8 gap-x-12 px-4">
              <div className="space-y-1.5 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.2em] flex items-center gap-2 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]" />
                  Liquidity
                </div>
                <div className="text-2xl font-display font-bold text-white tracking-tight">{displayValue}</div>
              </div>

              <div className="space-y-1.5 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.2em] flex items-center gap-2 font-mono">
                  <ShieldCheck className="w-3 h-3 text-[#0ea5e9]" />
                  Operations
                </div>
                <div className="text-2xl font-display font-bold text-white tracking-tight">{positionDisplay}</div>
              </div>

              <div className="space-y-1.5 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.2em] flex items-center gap-2 font-mono">
                  <Activity className="w-3 h-3 text-[#ec4899]" />
                  Sensing
                </div>
                <div className="text-2xl font-display font-bold text-white tracking-tight">{signalDisplay}</div>
              </div>

              <div className="space-y-1.5 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.2em] flex items-center gap-2 font-mono">
                  <TrendingUp className="w-3 h-3 text-[#f97316]" />
                  Efficiency
                </div>
                <div className="text-2xl font-display font-bold text-white tracking-tight">98.4%</div>
              </div>
            </div>
          </motion.div>

          {/* Action Interface */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 w-full max-w-md mb-24">
            <Link
              to="/analytics"
              className="relative group w-full sm:flex-1 h-14"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#8b5cf6] to-[#0ea5e9] opacity-0 group-hover:opacity-10 transition-opacity blur-xl rounded-full" />
              <div className="relative h-full flex items-center justify-center gap-3 bg-white text-black font-display font-black text-[10px] uppercase tracking-[0.3em] hover:scale-[1.02] transition-transform">
                Enter Terminal
              </div>
            </Link>
            <Link
              to="/arena"
              className="w-full sm:flex-1 h-14 flex items-center justify-center border border-white/5 text-white/40 font-display font-black text-[10px] uppercase tracking-[0.3em] hover:bg-white/[0.03] hover:text-white transition-all"
            >
              Live Arena
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Decorative vertical indicators */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-12 opacity-20">
        <div className="text-[9px] text-white font-mono uppercase tracking-[0.5em] [writing-mode:vertical-lr]">ace_protocol_v2.4</div>
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-white to-transparent" />
        <div className="text-[9px] text-white font-mono uppercase tracking-[0.5em] [writing-mode:vertical-lr]">stable_orbit_active</div>
      </div>
    </section>
  );
};

export default HeroSection;
