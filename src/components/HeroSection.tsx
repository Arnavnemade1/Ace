import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

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

  const positionDisplay = positions > 0 ? positions : "NOMINAL";
  const signalDisplay = signalCount > 0 ? signalCount.toLocaleString() : "SCANNING";

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#020202]">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] rounded-full opacity-[0.12] bg-[#8b5cf6] blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full opacity-[0.1] bg-[#00ff41] blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] rounded-full opacity-[0.05] bg-[#ea580c] blur-[160px]" />
        <div className="absolute inset-0 opacity-[0.03] contrast-150 brightness-150 pointer-events-none"
          style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      </div>

      <motion.div style={{ opacity, y }} className="relative z-10 container mx-auto px-6 pt-32 pb-20">
        <div className="max-w-6xl mx-auto flex flex-col items-center">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-center group flex flex-col items-center relative"
          >
            <div className="flex items-center justify-center gap-8 md:gap-12 relative w-full">
              {/* Left Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5, rotate: -20, x: 50 }}
                animate={{ opacity: 1, scale: 1, rotate: -12, x: 0 }}
                transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                whileHover={{ rotate: -5, scale: 1.05, y: -10 }}
                className="hidden xl:flex absolute -left-64 top-1/4 -translate-y-1/2 items-center justify-center"
              >
                <div className="w-40 h-56 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[20px] shadow-2xl relative overflow-hidden flex flex-col items-center justify-center group-hover:border-white/20 transition-colors">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#8b5cf6]/10 via-transparent to-[#00ff41]/5 opacity-50" />
                  <div className="absolute top-4 left-4 flex flex-col items-center font-display font-black text-xl text-white/40 leading-none">A</div>
                  <div className="absolute bottom-4 right-4 flex flex-col items-center font-display font-black text-xl text-white/40 rotate-180 leading-none">A</div>
                  <div className="text-4xl font-display font-black text-white/80 tracking-tighter italic">CAPITAL</div>
                </div>
              </motion.div>

              {/* Right Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5, rotate: 20, x: -50 }}
                animate={{ opacity: 1, scale: 1, rotate: 12, x: 0 }}
                transition={{ delay: 0.7, duration: 1, ease: "easeOut" }}
                whileHover={{ rotate: 5, scale: 1.05, y: -10 }}
                className="hidden xl:flex absolute -right-64 top-1/4 -translate-y-1/2 items-center justify-center"
              >
                <div className="w-40 h-56 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[20px] shadow-2xl relative overflow-hidden flex flex-col items-center justify-center group-hover:border-white/20 transition-colors">
                  <div className="absolute inset-0 bg-gradient-to-bl from-[#00ff41]/10 via-transparent to-[#8b5cf6]/5 opacity-50" />
                  <div className="absolute top-4 left-4 flex flex-col items-center font-display font-black text-xl text-white/40 leading-none">A</div>
                  <div className="absolute bottom-4 right-4 flex flex-col items-center font-display font-black text-xl text-white/40 rotate-180 leading-none">A</div>
                  <div className="text-4xl font-display font-black text-white/80 tracking-tighter italic">NEURAL</div>
                </div>
              </motion.div>

              <h1 className="text-[160px] md:text-[320px] font-['Dancing_Script'] font-bold tracking-normal leading-[0.8] select-none py-12">
                <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#8b5cf6] via-[#ec4899] to-[#00ff41] animate-gradient-slow block filter drop-shadow-[0_0_60px_rgba(139,92,246,0.5)]">
                  Ace
                </span>
              </h1>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 1 }}
              className="mt-8 space-y-6"
            >
              <h2 className="text-2xl md:text-3xl font-display font-extralight tracking-[0.2em] uppercase text-white/90">
                Autonomous <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0ea5e9] to-[#00ff41] font-medium italic">Capital</span> Intelligence
              </h2>
              <p className="text-[10px] md:text-xs text-white/20 max-w-xl mx-auto font-mono leading-relaxed tracking-[0.3em] uppercase">
                Specialized neural architecture // absolute zero human oversight
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="w-full max-w-4xl mt-24 mb-20 border-y border-white/[0.03] py-12"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 items-center justify-center gap-y-12 gap-x-12 px-4">
              <div className="space-y-3 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] flex items-center gap-3 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]" />
                  Liquidity
                </div>
                <div className="text-3xl font-display font-black text-white tracking-tighter">{displayValue}</div>
              </div>

              <div className="space-y-3 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] flex items-center gap-3 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_#0ea5e9]" />
                  Operations
                </div>
                <div className="text-3xl font-display font-black text-white tracking-tighter">{positionDisplay}</div>
              </div>

              <div className="space-y-3 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] flex items-center gap-3 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ec4899] shadow-[0_0_8px_#ec4899]" />
                  Sensing
                </div>
                <div className="text-3xl font-display font-black text-white tracking-tighter">{signalDisplay}</div>
              </div>

              <div className="space-y-3 flex flex-col items-center text-center">
                <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] flex items-center gap-3 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] shadow-[0_0_8px_#f97316]" />
                  Efficiency
                </div>
                <div className="text-3xl font-display font-black text-white tracking-tighter">98.4%</div>
              </div>
            </div>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 w-full max-w-md mb-24">
            <Link
              to="/analytics"
              className="relative group w-full sm:flex-1 h-14"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#8b5cf6] to-[#0ea5e9] opacity-0 group-hover:opacity-10 transition-opacity blur-xl rounded-full" />
              <div className="relative h-full flex items-center justify-center gap-3 bg-[#f4efe6] text-black font-display font-black text-[10px] uppercase tracking-[0.4em] hover:scale-[1.02] transition-transform">
                Enter Terminal
              </div>
            </Link>
            <Link
              to="/arena"
              className="w-full sm:flex-1 h-14 flex items-center justify-center border border-white/5 text-white/40 font-display font-black text-[10px] uppercase tracking-[0.4em] hover:bg-white/[0.03] hover:text-white transition-all"
            >
              Live Arena
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-12 opacity-20">
        <div className="text-[9px] text-white font-mono uppercase tracking-[0.5em] [writing-mode:vertical-lr]">ace_protocol_v2.4</div>
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-white to-transparent" />
        <div className="text-[9px] text-white font-mono uppercase tracking-[0.5em] [writing-mode:vertical-lr]">stable_orbit_active</div>
      </div>
    </section>
  );
};

export default HeroSection;
