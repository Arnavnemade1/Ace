import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
        setTrades(prev => [newTrade, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, []);

  return (
    <div className="bg-[#020202] border border-white/5 overflow-hidden">
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] shadow-[0_0_8px_#93d24a]" />
          <h3 className="font-display font-black text-[10px] uppercase tracking-[0.4em] text-white/80">Live Execution Horizon</h3>
        </div>
        <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] italic">
          v2.4.0 // Autonomous Stream
        </div>
      </div>

      <div className="divide-y divide-white/[0.03] min-h-[400px] max-h-[500px] overflow-y-auto font-mono">
        {trades.length === 0 ? (
          <div className="p-24 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-mono text-white/10 uppercase tracking-[0.6em] animate-pulse">
              Synchronizing neural handoff...
            </span>
          </div>
        ) : trades.map((trade, i) => (
          <motion.div
            key={trade.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
          >
            <div className="flex items-center gap-8">
              <span className="text-[10px] text-white/10 w-20">{trade.time}</span>
              <div className={`text-[10px] font-black w-12 tracking-widest ${trade.side === "BUY" ? "text-[#93d24a]" : "text-[#ff8362]"}`}>
                {trade.side}
              </div>
              <span className="font-display font-black text-white text-base w-24 tracking-tighter uppercase">{trade.symbol}</span>
              <span className="text-[10px] text-white/30 hidden md:inline">{trade.qty.toLocaleString()} UNIT @ ${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-10">
              <span className="text-[9px] text-white/5 uppercase tracking-[0.3em] hidden lg:block">{trade.agent.replace("Agent", "").trim()}</span>
              {trade.pnl !== null && trade.pnl !== undefined ? (
                <div className={`text-xs font-black min-w-[80px] text-right ${trade.pnl >= 0 ? "text-[#93d24a]" : "text-[#ff8362]"}`}>
                  {trade.pnl >= 0 ? "+" : ""}${Math.abs(trade.pnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              ) : (
                <div className="text-[10px] text-white/10 tracking-widest min-w-[80px] text-right">PENDING</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default LiveTradeFeed;
