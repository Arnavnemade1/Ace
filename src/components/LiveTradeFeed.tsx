import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Trade {
  id: string;
  time: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  pnl?: number;
  agent: string;
}

const LiveTradeFeed = () => {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    // Fetch initial trades
    const fetchTrades = async () => {
      const { data } = await supabase
        .from('trades')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(10);

      if (data) {
        setTrades(data.map((t: any) => ({
          id: t.id,
          time: new Date(t.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          symbol: t.symbol,
          side: t.side,
          qty: t.qty,
          price: t.price,
          pnl: t.pnl,
          agent: t.agent
        })));
      }
    };

    fetchTrades();

    // Subscribe to new trades
    const channel = supabase
      .channel('public:trades')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload: any) => {
        const t = payload.new;
        const newTrade: Trade = {
          id: t.id,
          time: new Date(t.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          symbol: t.symbol,
          side: t.side,
          qty: t.qty,
          price: t.price,
          pnl: t.pnl,
          agent: t.agent
        };
        setTrades(prev => [newTrade, ...prev].slice(0, 10)); // Keep only latest 10
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="glow-dot" />
          <h3 className="font-display font-semibold text-foreground">Live Trade Feed</h3>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs">Real-time</span>
        </div>
      </div>

      <div className="divide-y divide-border/20 max-h-[400px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Waiting for live trades...</div>
        ) : trades.map((trade, i) => (
          <motion.div
            key={trade.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="px-6 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground font-mono w-16">{trade.time}</span>
              <div className={`flex items-center gap-1 text-xs font-medium w-12 ${trade.side === "BUY" ? "profit-text" : "loss-text"}`}>
                {trade.side === "BUY" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {trade.side}
              </div>
              <span className="font-display font-semibold text-foreground text-sm w-16">{trade.symbol}</span>
              <span className="text-xs text-muted-foreground">{trade.qty} @ ${trade.price.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground hidden sm:block">{trade.agent}</span>
              {trade.pnl !== null && trade.pnl !== undefined && (
                <span className={`text-xs font-medium ${trade.pnl >= 0 ? "profit-text" : "loss-text"}`}>
                  {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default LiveTradeFeed;
