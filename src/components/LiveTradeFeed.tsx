import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Clock, Activity } from "lucide-react";
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
      const { data } = await (supabase as any)
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
    const channel = (supabase as any)
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
      (supabase as any).removeChannel(channel);
    };
  }, []);

  return (
    <div className="bg-white/[0.02] border border-white/5 overflow-hidden">
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-[#ec4899]" />
          <h3 className="font-display font-black text-xs uppercase tracking-[0.3em] text-white">Live Execution Stream</h3>
        </div>
        <div className="flex items-center gap-2 px-2 py-0.5 rounded border border-white/5 bg-white/[0.03]">
          <div className="w-1 h-1 rounded-full bg-[#00ff41] animate-pulse" />
          <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Awaiting Signal</span>
        </div>
      </div>

      <div className="divide-y divide-white/[0.03] min-h-[360px] max-h-[460px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-center space-y-4">
            <span className="text-[10px] font-mono text-white/10 uppercase tracking-[0.5em] animate-pulse">
              Scanning execution horizon...
            </span>
          </div>
        ) : trades.map((trade, i) => (
          <motion.div
            key={trade.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="px-8 py-4 flex items-center justify-between hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-6">
              <span className="text-[10px] text-white/20 font-mono w-14">{trade.time}</span>
              <div className={`flex items-center gap-2 text-[10px] font-black w-14 ${trade.side === "BUY" ? "text-[#00ff41]" : "text-red-400"}`}>
                {trade.side === "BUY" ? <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /> : <ArrowDownRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform" />}
                {trade.side}
              </div>
              <span className="font-display font-black text-white text-sm w-20 tracking-tighter uppercase">{trade.symbol}</span>
              <span className="text-[10px] text-white/20 font-mono hidden md:inline">{trade.qty} @ ${trade.price.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-[9px] text-white/10 font-mono uppercase tracking-widest hidden lg:block">{trade.agent}</span>
              {trade.pnl !== null && trade.pnl !== undefined && (
                <span className={`text-xs font-black font-mono ${trade.pnl >= 0 ? "text-[#00ff41]" : "text-red-400"}`}>
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
