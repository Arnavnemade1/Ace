import HeroSection from "@/components/HeroSection";
import AgentOverview from "@/components/AgentOverview";
import LiveTradeFeed from "@/components/LiveTradeFeed";
import PerformanceChart from "@/components/PerformanceChart";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#020202] text-white selection:bg-primary/30 selection:text-white overflow-x-hidden">
      {/* Hero Section - The Core Interface */}
      <HeroSection />

      {/* 
          DRASTIC CLUTTER REDUCTION: 
          Moving from multiple redundant bars to a unified "Live Intelligence" view.
      */}

      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mb-24 flex flex-col items-center text-center"
          >
            <h2 className="text-4xl md:text-6xl font-display font-black tracking-tighter leading-tight mb-6 max-w-3xl">
              High-fidelity <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ec4899] to-[#8b5cf6]">execution</span>.
            </h2>
            <p className="text-white/30 font-light max-w-xl text-lg leading-relaxed">
              Autonomous synchronization across 8 neural layers and 14 disparate data frontiers.
            </p>
          </motion.div>

          {/* Unified Central Hub */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start max-w-7xl mx-auto">
            <div className="lg:col-span-7">
              <LiveTradeFeed />
            </div>
            <div className="lg:col-span-5 space-y-12">
              <PerformanceChart />

              {/* Protocol Metrics Row */}
              <div className="pt-10 border-t border-white/5 flex justify-between">
                {[
                  { label: "Latency", value: "14ms" },
                  { label: "Nodes", value: "Active" },
                  { label: "Sync", value: "100%" }
                ].map((stat, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-[10px] text-white/20 uppercase tracking-widest font-mono">{stat.label}</div>
                    <div className="text-lg font-display font-bold text-white">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Expanded Intelligence Grid */}
      <section className="py-40 border-t border-white/5 bg-white/[0.01]">
        <AgentOverview />
      </section>

      {/* Deep Brand Statement */}
      <section className="py-40 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#8b5cf6]/[0.02] to-transparent pointer-events-none" />
        <div className="container mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          >
            <h2 className="text-5xl md:text-8xl font-display font-black tracking-tighter mb-10 leading-[0.8]">
              The <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00ff41] via-[#0ea5e9] to-[#8b5cf6]">Ace</span> Protocol.
            </h2>
            <p className="text-xl md:text-2xl text-white/40 font-light max-w-2xl mx-auto leading-relaxed mb-20">
              proprietary multi-agent architecture ensuring robust risk management
              and execution efficiency with zero human oversight.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Minimalism Footer */}
      <footer className="py-24 border-t border-white/5 bg-black">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex flex-col items-center md:items-start space-y-2">
            <span className="text-4xl font-display font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] to-[#ec4899]">ACE</span>
            <span className="text-[10px] font-mono tracking-[0.3em] text-white/10 uppercase font-black">Autonomous Capital Engine v2.4</span>
          </div>
          <div className="text-center md:text-right text-white/20 text-[9px] uppercase tracking-widest leading-loose max-w-sm">
            Paper Trading Active — Proprietary Infrastructure — Non-Custodial Intelligence — Alpha Build
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
