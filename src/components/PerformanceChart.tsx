import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const data = [
  { date: "Mon", value: 100000 },
  { date: "Tue", value: 100450 },
  { date: "Wed", value: 101200 },
  { date: "Thu", value: 100800 },
  { date: "Fri", value: 102100 },
  { date: "Sat", value: 102050 },
  { date: "Sun", value: 103400 },
  { date: "Mon", value: 103100 },
  { date: "Tue", value: 104200 },
  { date: "Wed", value: 103800 },
  { date: "Thu", value: 105100 },
  { date: "Fri", value: 105800 },
  { date: "Sat", value: 106200 },
  { date: "Sun", value: 107450 },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.[0]) {
    return (
      <div className="glass-card px-3 py-2">
        <p className="text-foreground font-display font-semibold text-sm">
          ${payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

const PerformanceChart = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="section-title mb-1">Portfolio Value</p>
          <p className="metric-value text-foreground">$107,450</p>
          <p className="text-sm profit-text font-medium mt-1">+$7,450 (+7.45%)</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">14 days</p>
          <p className="text-xs text-muted-foreground">Paper Trading</p>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(185, 80%, 55%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(185, 80%, 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 16%)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              domain={["dataMin - 500", "dataMax + 500"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(185, 80%, 55%)"
              strokeWidth={2}
              fill="url(#portfolioGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default PerformanceChart;
