import HeroSection from "@/components/HeroSection";
import AgentOverview from "@/components/AgentOverview";
import MetricsBar from "@/components/MetricsBar";
import LiveTradeFeed from "@/components/LiveTradeFeed";
import PerformanceChart from "@/components/PerformanceChart";
import ParallaxSection from "@/components/ParallaxSection";
import { motion } from "framer-motion";
import { Cpu, Zap, ShieldAlert, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <HeroSection />

      {/* Massive Stats Insert */}
      <section className="py-12 bg-black border-y border-border/20">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold glow-text text-primary flex items-center gap-3"><Zap /> Global Swarm Analytics</h2>
              <p className="text-muted-foreground mt-2">Real-time aggregate data from 8 neural agents and 14 API streams.</p>
            </div>
            <Link to="/arena" className="mt-4 md:mt-0 glass-card px-6 py-3 flex items-center gap-2 hover:bg-primary/20 transition-all text-primary font-semibold rounded-full border border-primary/50">
              Enter Live Agent Arena <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 border-l-4 border-l-primary/50">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">API Throughput</p>
              <p className="text-2xl font-mono text-foreground glow-text">14,285 <span className="text-xs text-muted-foreground">req/hr</span></p>
            </div>
            <div className="glass-card p-4 border-l-4 border-l-accent/50">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Alpha Vantage Delay</p>
              <p className="text-2xl font-mono text-foreground glow-text">12 <span className="text-xs text-muted-foreground">ms</span></p>
            </div>
            <div className="glass-card p-4 border-l-4 border-l-profit/50">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Sentiment Velocity</p>
              <p className="text-2xl font-mono text-profit glow-text">+0.84 <span className="text-xs text-muted-foreground">bullish</span></p>
            </div>
            <div className="glass-card p-4 border-l-4 border-l-warning/50">
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1"><ShieldAlert className="inline w-3 h-3 mr-1" /> Risk VaR Limit</p>
              <p className="text-2xl font-mono text-foreground glow-text">$3,420 <span className="text-xs text-muted-foreground">/ $5k max</span></p>
            </div>
          </div>
        </div>
      </section>

      <MetricsBar />

      <ParallaxSection>
        <AgentOverview />
      </ParallaxSection>

      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <p className="section-title mb-3">Live Operations</p>
            <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
              Full <span className="text-primary">transparency.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ParallaxSection>
              <LiveTradeFeed />
            </ParallaxSection>
            <ParallaxSection>
              <PerformanceChart />
            </ParallaxSection>
          </div>
        </div>
      </section>

      {/* Causal Replay Section */}
      <ParallaxSection className="py-24">
        <div className="container mx-auto px-6">
          <div className="glass-card p-10 md:p-16 text-center max-w-4xl mx-auto relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
            <div className="relative z-10">
              <Cpu className="w-10 h-10 text-primary mx-auto mb-6 opacity-60" />
              <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-4 text-foreground">
                Causal Replay Arena
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto mb-8">
                Every night, the system replays the day's decisions through counterfactual analysis.
                It asks: "What if I had waited? Sized differently? Used a different signal?"
                Then it prunes losing patterns and reinforces winners.
              </p>
              <div className="flex items-center justify-center gap-8">
                <div>
                  <p className="metric-value profit-text">+8.2%</p>
                  <p className="text-xs text-muted-foreground mt-1">Improvement Rate</p>
                </div>
                <div className="w-px h-12 bg-border/40" />
                <div>
                  <p className="metric-value text-foreground">1,247</p>
                  <p className="text-xs text-muted-foreground mt-1">Replays Processed</p>
                </div>
                <div className="w-px h-12 bg-border/40" />
                <div>
                  <p className="metric-value text-primary">14</p>
                  <p className="text-xs text-muted-foreground mt-1">Patterns Pruned</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ParallaxSection>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xs text-muted-foreground">
            Autonomous Multi-Agent Trading System — Paper Trading Only — No Real Capital at Risk
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
