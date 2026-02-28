import HeroSection from "@/components/HeroSection";
import AgentOverview from "@/components/AgentOverview";
import MetricsBar from "@/components/MetricsBar";
import LiveTradeFeed from "@/components/LiveTradeFeed";
import PerformanceChart from "@/components/PerformanceChart";
import ParallaxSection from "@/components/ParallaxSection";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden selection:bg-primary/30">
      <HeroSection />

      <MetricsBar />

      <section className="py-24 bg-secondary/10">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16 text-center"
          >
            <p className="text-sm font-mono tracking-[0.3em] uppercase text-primary mb-4">Operations</p>
            <h2 className="text-4xl md:text-5xl font-display font-black tracking-tighter">
              Real-time market execution.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <LiveTradeFeed />
            <PerformanceChart />
          </div>
        </div>
      </section>

      <AgentOverview />

      <ParallaxSection className="py-32 border-t border-border/10">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-display font-black tracking-tighter mb-8">
              The ACE Protocol
            </h2>
            <p className="text-lg text-muted-foreground font-light leading-relaxed mb-12">
              Every cycle, the system evaluates thousands of data points across multiple timeframes.
              Our multi-agent architecture ensures robust risk management and execution efficiency
              with zero human oversight.
            </p>
            <div className="flex items-center justify-center gap-12 border-y border-border/10 py-10">
              <div className="text-center">
                <p className="text-4xl font-display font-black text-primary tracking-tighter">100%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-2 font-mono">Autonomous</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-display font-black text-foreground tracking-tighter">8</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-2 font-mono">Neural Agents</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-display font-black text-foreground tracking-tighter">35+</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-2 font-mono">Instruments</p>
              </div>
            </div>
          </div>
        </div>
      </ParallaxSection>

      <footer className="py-20 border-t border-border/10 bg-black">
        <div className="container mx-auto px-6 text-center">
          <img src="/logo.png" alt="Ace" className="w-12 h-12 mx-auto mb-6 opacity-40 grayscale hover:grayscale-0 transition-all" />
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.2em]">
            ACE Multi-Agent System // Paper Trading Protocol v2.4.0
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
