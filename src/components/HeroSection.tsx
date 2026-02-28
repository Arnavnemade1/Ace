import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { ArrowRight, Activity, Zap, Cpu, TrendingUp } from "lucide-react";
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

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#020202]">
      {/* Aurora Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full opacity-[0.15] mix-blend-screen"
          style={{ background: "radial-gradient(circle, #00ff41 0%, transparent 70%)" }}
          animate={{ x: [0, 100, 0], y: [0, 50, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full opacity-[0.1] mix-blend-screen"
          style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)" }}
          animate={{ x: [0, -80, 0], y: [0, -100, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute top-[20%] right-[10%] w-[50vw] h-[50vw] rounded-full opacity-[0.08] mix-blend-screen"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }}
          animate={{ x: [0, -50, 0], y: [0, 80, 0], rotate: [0, 360] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Grid overlay with perspective */}
      <div
        className="absolute inset-0 z-[1] opacity-[0.05]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
          maskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, black, transparent 90%)',
        }}
      />

      <motion.div style={{ opacity, y }} className="relative z-10 container mx-auto px-6 pt-20">
        <div className="max-w-5xl mx-auto flex flex-col items-center">

          {/* Top dynamic label */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/5 bg-white/[0.03] backdrop-blur-md mb-10"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_#00ff41]" />
            <span className="text-[10px] font-mono tracking-widest uppercase text-white/50">
              ACE Multi-Agent Protocol // v2.4.0 Live
            </span>
          </motion.div>

          {/* Hero text */}
          <div className="flex flex-col items-center text-center space-y-6 mb-16">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="text-7xl md:text-9xl font-display font-black tracking-tighter leading-[0.8] text-white"
            >
              ACE
            </motion.h1>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 1 }}
              className="space-y-4"
            >
              <h2 className="text-xl md:text-3xl font-display font-medium tracking-tight text-white/90">
                The Autonomous <span className="text-primary italic font-serif tracking-normal">Capital</span> Engine
              </h2>
              <p className="text-sm md:text-base text-white/40 max-w-xl mx-auto font-light leading-relaxed">
                A decentralized collective of 8 neural agents coordinating across US equities,
                ETFs, and macro proxies 24/7 with zero human oversight.
              </p>
            </motion.div>
          </div>

          {/* Desktop Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mb-16 px-4"
          >
            {[
              { label: "Portfolio Value", value: displayValue, icon: <Zap className="w-3.5 h-3.5" />, color: "text-primary" },
              { label: "Active Positions", value: positions, icon: <Activity className="w-3.5 h-3.5" />, color: "text-blue-400" },
              { label: "Signal Velocity", value: signalCount, icon: <Cpu className="w-3.5 h-3.5" />, color: "text-purple-400" },
              { label: "AI Confidence", value: "98.4%", icon: <TrendingUp className="w-3.5 h-3.5" />, color: "text-emerald-400" },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-6 border border-white/5 bg-white/[0.02] flex flex-col items-center text-center space-y-2 group hover:bg-white/[0.05] transition-colors">
                <div className={`${stat.color} opacity-40 group-hover:opacity-100 transition-opacity`}>
                  {stat.icon}
                </div>
                <div className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-mono">{stat.label}</div>
                <div className="text-xl font-display font-black text-white">{stat.value}</div>
              </div>
            ))}
          </motion.div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mb-12">
            <Link
              to="/analytics"
              className="w-full sm:flex-1 h-14 flex items-center justify-center gap-2 bg-white text-black font-display font-bold text-sm uppercase tracking-widest hover:bg-white/90 transition-all"
            >
              Enterprise Terminal <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/arena"
              className="w-full sm:flex-1 h-14 flex items-center justify-center border border-white/10 text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              Agent Arena
            </Link>
          </div>

          {/* Countdown Integrated */}
          <div className="w-full max-w-md">
            <MarketCountdown />
          </div>
        </div>
      </motion.div>

      {/* Scroll decorative */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-30">
        <div className="text-[9px] text-white font-mono uppercase tracking-[0.4em] [writing-mode:vertical-lr]">Scroll</div>
        <div className="w-px h-16 bg-gradient-to-b from-white to-transparent" />
      </div>
    </section>
  );
};

export default HeroSection;
