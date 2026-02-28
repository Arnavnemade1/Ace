import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

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

const mockTrades: Trade[] = [
  { id: "1", time: "14:32:08", symbol: "AAPL", side: "BUY", qty: 45, price: 189.42, agent: "Strategy Engine" },
  { id: "2", time: "14:28:55", symbol: "XLE", side: "SELL", qty: 200, price: 92.18, pnl: 342.00, agent: "Portfolio Optimizer" },
  { id: "3", time: "14:22:11", symbol: "CL=F", side: "BUY", qty: 10, price: 78.56, agent: "Market Scanner" },
  { id: "4", time: "14:15:03", symbol: "SPY", side: "SELL", qty: 100, price: 512.84, pnl: -127.00, agent: "Risk Controller" },
  { id: "5", time: "14:08:47", symbol: "NVDA", side: "BUY", qty: 30, price: 875.20, agent: "Strategy Engine" },
  { id: "6", time: "13:55:22", symbol: "NG=F", side: "BUY", qty: 50, price: 2.847, agent: "Market Scanner" },
  { id: "7", time: "13:42:18", symbol: "USO", side: "SELL", qty: 150, price: 76.33, pnl: 189.50, agent: "Portfolio Optimizer" },
  { id: "8", time: "13:31:09", symbol: "TSLA", side: "BUY", qty: 20, price: 248.91, agent: "Strategy Engine" },
];

const LiveTradeFeed = () => {
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

      <div className="divide-y divide-border/20">
        {mockTrades.map((trade, i) => (
          <motion.div
            key={trade.id}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
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
              {trade.pnl !== undefined && (
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
