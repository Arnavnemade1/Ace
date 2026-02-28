import { motion } from "framer-motion";

interface Metric {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}

const metrics: Metric[] = [
  { label: "Total Return", value: "+7.45%", positive: true },
  { label: "Sharpe Ratio", value: "1.34", positive: true },
  { label: "Max Drawdown", value: "-2.1%", positive: false },
  { label: "Win Rate", value: "68.4%", positive: true },
  { label: "Trades (24h)", value: "34" },
  { label: "Positions Open", value: "12" },
];

const MetricsBar = () => {
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
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="glass-card p-5 text-center"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{m.label}</p>
              <p className={`text-2xl font-display font-bold ${
                m.positive === true ? "profit-text" : m.positive === false ? "loss-text" : "text-foreground"
              }`}>
                {m.value}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MetricsBar;
