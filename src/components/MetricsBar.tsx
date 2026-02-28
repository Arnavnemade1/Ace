import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface PortfolioState {
  total_value: number;
  cash: number;
  positions: any[];
  updated_at: string;
}

const MetricsBar = () => {
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [trades24h, setTrades24h] = useState(0);

  useEffect(() => {
    const load = async () => {
      // Portfolio state (pushed by daemon every cycle)
      const { data: ps } = await (supabase as any)
        .from("portfolio_state")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ps) setPortfolio(ps);

      // Trade count last 24h
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await (supabase as any)
        .from("trades")
        .select("id", { count: "exact", head: true })
        .gte("executed_at", since);
      setTrades24h(count || 0);
    };
    load();

    // Realtime
    const ch = (supabase as any)
      .channel("metrics-bar")
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_state" }, (p: any) => {
        setPortfolio(p.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, () => {
        setTrades24h(prev => prev + 1);
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const positions = portfolio?.positions || [];
  const totalValue = portfolio?.total_value ?? 100000;
  const cash = portfolio?.cash ?? 100000;
  const invested = totalValue - cash;
  const returnPct = ((totalValue - 100000) / 100000) * 100;
  const positionCount = positions.length;

  // Unrealized P&L across all positions
  const unrealizedPL = positions.reduce((sum: number, p: any) => sum + (p.unrealized_pl || 0), 0);
  const winRate = positions.filter((p: any) => (p.unrealized_pl || 0) > 0).length;

  const metrics = [
    {
      label: "Portfolio Value",
      value: `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      positive: returnPct > 0,
      sub: returnPct !== 0 ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}% return` : "Paper capital"
    },
    {
      label: "Cash Available",
      value: `$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      positive: undefined,
      sub: `$${invested.toLocaleString(undefined, { maximumFractionDigits: 0 })} invested`
    },
    {
      label: "Active Positions",
      value: String(positionCount),
      positive: positionCount > 0 ? true : undefined,
      sub: positionCount > 0 ? `${winRate}/${positionCount} profitable` : "Scanning for entries"
    },
    {
      label: "Unrealized P&L",
      value: unrealizedPL === 0 ? "—" : `${unrealizedPL >= 0 ? "+" : ""}$${Math.abs(unrealizedPL).toFixed(2)}`,
      positive: unrealizedPL > 0 ? true : unrealizedPL < 0 ? false : undefined,
      sub: "Open positions"
    },
    {
      label: "Trades (24h)",
      value: String(trades24h),
      positive: undefined,
      sub: "Orders executed"
    },
    {
      label: "Strategy",
      value: "LIVE",
      positive: true,
      sub: "Momentum Scalp + GTC"
    },
  ];

  return (
    <section className="py-20">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="glass-card p-5 text-center"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{m.label}</p>
              <p className={`text-2xl font-display font-bold ${m.positive === true ? "profit-text" : m.positive === false ? "loss-text" : "text-foreground"
                }`}>
                {m.value}
              </p>
              {m.sub && <p className="text-[10px] text-muted-foreground mt-1">{m.sub}</p>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MetricsBar;
