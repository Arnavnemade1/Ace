import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketCountdown } from "@/components/MarketCountdown";

const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-20 pb-10 bg-background overflow-hidden">
      <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <div className="relative group">
            <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />
            <img
              src="/logo.png"
              alt="Ace Logo"
              className="w-32 h-32 md:w-40 md:h-40 object-contain relative z-10 drop-shadow-[0_0_15px_rgba(0,255,65,0.3)]"
            />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter mb-4 text-foreground">
            ACE
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-mono tracking-widest uppercase mb-10 opacity-70">
            Autonomous Capital Engine
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center gap-6 mb-16"
        >
          <Link
            to="/analytics"
            className="group relative px-8 py-4 bg-primary text-primary-foreground font-bold tracking-widest uppercase rounded overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <span className="relative flex items-center gap-2">
              Live Terminal <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
          <Link
            to="/arena"
            className="px-8 py-4 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/5 transition-all font-mono tracking-widest uppercase rounded text-muted-foreground"
          >
            Agent Arena
          </Link>
        </motion.div>

        {/* Market Status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="w-full max-w-md mx-auto"
        >
          <MarketCountdown />
        </motion.div>
      </div>

      {/* Decorative background element */}
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </section>
  );
};

export default HeroSection;
