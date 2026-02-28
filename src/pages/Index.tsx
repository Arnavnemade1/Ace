import HeroSection from "@/components/HeroSection";
import AgentOverview from "@/components/AgentOverview";
import MetricsBar from "@/components/MetricsBar";
import LiveTradeFeed from "@/components/LiveTradeFeed";
import PerformanceChart from "@/components/PerformanceChart";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#020202] text-white selection:bg-primary/30 selection:text-white overflow-x-hidden">
      {/* Hero Section */}
      <HeroSection />

      {/* Live Financial Metrics Bar */}
      <div className="relative z-10 -mt-10">
        <MetricsBar />
      </div>

      {/* Main Operations Section */}
      <section className="py-32 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="mb-20"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <h3 className="text-sm font-mono tracking-[0.4em] uppercase text-primary mb-4">Precision Execution</h3>
                <h2 className="text-4xl md:text-6xl font-display font-black tracking-tighter leading-tight">
                  High-fidelity market <br />
                  <span className="opacity-40">intelligence.</span>
                </h2>
              </div>
              <div className="pb-2">
                <p className="text-white/40 font-light max-w-xs text-sm leading-relaxed">
                  Real-time synchronization across 8 neural layers and 14 disparate data frontiers.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Grid for Feed and Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            <div className="lg:col-span-3">
              <LiveTradeFeed />
            </div>
            <div className="lg:col-span-2 space-y-8">
              <PerformanceChart />
              <div className="glass-card p-8 border border-white/5 bg-white/[0.02]">
                <h4 className="text-xs font-mono uppercase tracking-widest text-primary mb-6">Execution Status</h4>
                <div className="space-y-4">
                  {[
                    { label: "Neural Latency", value: "14ms", status: "optimal" },
                    { label: "API Sync Hub", value: "Online", status: "optimal" },
                    { label: "Risk VaR", value: "Nominal", status: "optimal" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                      <span className="text-xs text-white/40">{item.label}</span>
                      <span className="text-xs font-mono text-white/80">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Collective - Minimalist Grid */}
      <section className="py-20 bg-white/[0.01] border-y border-white/5">
        <AgentOverview />
      </section>

      {/* Deep Protocol Insight */}
      <section className="py-40 relative">
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[150px] pointer-events-none" />

        <div className="container mx-auto px-6">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter mb-12 leading-[0.9]">
                The <span className="text-primary italic font-serif tracking-normal">Ace</span> Protocol.
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-white/50 leading-relaxed font-light">
                <p>
                  Every cycle, the ACE orchestrator evaluates thousands of discrete data points across multiple
                  timeframes. Our proprietary multi-agent architecture ensures that every decision is
                  vetted by specialized risk, strategy, and execution agents before hitting the exchange.
                </p>
                <p>
                  By synthesizing macro sentiment with low-level price action, ACE maintains a probabilistic
                  edge in high-volatility environments. The system operates with absolute autonomy,
                  self-correcting and optimizing its internal weights through nightly causal replays.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mt-20 flex flex-wrap gap-x-20 gap-y-10"
            >
              {[
                { label: "Autonomous", value: "100%" },
                { label: "Neural Agents", value: "8" },
                { label: "Global APIs", value: "14" },
              ].map((metric, i) => (
                <div key={i}>
                  <div className="text-4xl md:text-6xl font-display font-black tracking-tighter text-white">{metric.value}</div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary mt-2 font-mono">{metric.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Modern Minimalist Footer */}
      <footer className="py-24 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-col items-center md:items-start space-y-2">
              <span className="text-3xl font-display font-black tracking-tighter">ACE</span>
              <span className="text-[10px] font-mono tracking-[0.2em] text-white/20 uppercase italic">Multi-Agent Protocol // v2.4.0</span>
            </div>
            <div className="text-center md:text-right">
              <p className="text-[10px] text-white/25 font-mono uppercase tracking-[0.1em] max-w-xs leading-relaxed">
                Autonomous Capital Engine — Paper Trading Only — Proprietary Infrastructure v2.4.0
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
