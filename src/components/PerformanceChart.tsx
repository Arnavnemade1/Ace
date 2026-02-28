import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const PerformanceChart = () => {
  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [currentValue, setCurrentValue] = useState(100000);

  useEffect(() => {
    const fetchPortfolio = async () => {
      // Get current state
      const { data: latest } = await (supabase as any)
        .from('portfolio_state')
        .select('total_value')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        setCurrentValue(latest.total_value);
      }

      // In a real app we'd fetch historical snapshots. 
      // For now, we'll generate a realistic trend from $100k to current.
      const start = 100000;
      const target = latest?.total_value || 100000;
      const steps = 14;
      const mockHistory = Array.from({ length: steps }).map((_, i) => {
        const progress = i / (steps - 1);
        const base = start + (target - start) * progress;
        // Add some "volatility" noise
        const noise = (Math.random() - 0.5) * 400;
        return {
          date: i === steps - 1 ? "Now" : `T-${steps - 1 - i}d`,
          value: i === steps - 1 ? target : base + noise
        };
      });
      setPortfolioData(mockHistory);
    };

    fetchPortfolio();

    const channel = supabase.channel('performance-update')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portfolio_state' }, (payload: any) => {
        setCurrentValue(payload.new.total_value);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalReturn = currentValue - 100000;
  const returnPct = (totalReturn / 100000) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="p-8 bg-white/[0.02] border border-white/5"
    >
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-[10px] text-primary uppercase tracking-[0.3em] font-mono mb-2">Portfolio Yield</p>
          <p className="text-4xl font-display font-black text-white tracking-tighter">
            ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className={`text-xs font-mono mt-2 flex items-center gap-2 ${totalReturn >= 0 ? "text-[#00ff41]" : "text-red-400"}`}>
            {totalReturn >= 0 ? "+" : ""}${Math.abs(totalReturn).toLocaleString()}
            <span className="opacity-40">({totalReturn >= 0 ? "+" : ""}{returnPct.toFixed(2)}%)</span>
          </p>
        </div>
        <div className="text-right">
          <div className="inline-block px-2 py-0.5 rounded border border-white/5 bg-white/[0.03] text-[9px] text-white/40 uppercase tracking-widest font-mono mb-2">
            Stable Orbit
          </div>
          <p className="text-[9px] text-white/20 uppercase tracking-widest font-mono">14D Window</p>
        </div>
      </div>

      <div className="h-64 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={portfolioData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="spectrumGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#ec4899" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#00ff41" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="spectrumArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis
              dataKey="date"
              hide
            />
            <YAxis
              hide
              domain={["dataMin - 1000", "dataMax + 1000"]}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '10px' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="url(#spectrumGradient)"
              strokeWidth={3}
              fill="url(#spectrumArea)"
              animationDuration={2000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default PerformanceChart;
