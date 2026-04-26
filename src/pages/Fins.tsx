import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";

/**
 * FINS: Financial Intelligence Network Surface
 * A premium, minimalist dashboard for autonomous capital intelligence.
 * Design language: Onyx backgrounds, warm neutrals, tight typography, zero icons.
 */

// --- Premium Indicators (SVG) ---
const ArrowUpRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M7 17L17 7M17 7H7M17 7V17" />
  </svg>
);

const PulseDot = ({ color = "bg-emerald-500" }: { color?: string }) => (
  <div className="relative flex h-2 w-2">
    <div className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}></div>
    <div className={`relative inline-flex rounded-full h-2 w-2 ${color}`}></div>
  </div>
);

// --- Types ---
type WatchlistCompany = {
  ticker: string;
  name: string;
  sector: string;
  conviction: number;
  sentiment: "positive" | "neutral" | "negative";
  risk: "increase" | "stable" | "decrease";
  nextCatalyst: string;
};

type FilingEvent = {
  ticker: string;
  company: string;
  filingType: string;
  timestamp: string;
  status: string;
  summary: string;
  action: string;
};

// --- Fallback Data ---
const fallbackWatchlist: WatchlistCompany[] = [
  { ticker: "NVDA", name: "NVIDIA", sector: "SEMIS", conviction: 82, sentiment: "positive", risk: "stable", nextCatalyst: "EARNINGS IN 12D" },
  { ticker: "MSFT", name: "MICROSOFT", sector: "PLATFORM", conviction: 71, sentiment: "neutral", risk: "decrease", nextCatalyst: "10-Q MONITORED" },
  { ticker: "TSLA", name: "TESLA", sector: "MOBILITY", conviction: 38, sentiment: "negative", risk: "increase", nextCatalyst: "8-K WATCH ACTIVE" },
  { ticker: "XOM", name: "EXXON MOBIL", sector: "ENERGY", conviction: 64, sentiment: "positive", risk: "stable", nextCatalyst: "TRANSCRIPT PENDING" },
];

const fallbackFilingEvents: FilingEvent[] = [
  { ticker: "TSLA", company: "TESLA", filingType: "8-K", timestamp: "6M AGO", status: "MATERIAL CHANGE", summary: "Management language turned more defensive around margin durability and near-term delivery pacing.", action: "REDUCE 25BPS" },
  { ticker: "MSFT", company: "MICROSOFT", filingType: "10-Q", timestamp: "51M AGO", status: "FUSED", summary: "Risk disclosures remained controlled while cloud demand commentary stayed constructive.", action: "HOLD / +4" },
];

// --- Utilities ---
const timeAgo = (value: string | null | undefined) => {
  if (!value) return "PENDING";
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60000));
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}H AGO`;
  return `${Math.round(hours / 24)}D AGO`;
};

const Fins = () => {
  const { data, isLoading, error } = useFinsData();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const autoPrimedRef = useRef(false);

  const triggerSurfaceSync = useCallback(async (reason: "manual" | "auto") => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await supabase.functions.invoke("fins-surface-sync", { body: { reason } });
      await queryClient.invalidateQueries({ queryKey: ["fins-dashboard"] });
    } catch (err) {
      console.error("FINS Sync Failed", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  useEffect(() => {
    if (!autoPrimedRef.current && !isLoading && data && (data.disclosureEvents.length === 0 || data.fusedSignals.length === 0)) {
      autoPrimedRef.current = true;
      void triggerSurfaceSync("auto");
    }
  }, [data, isLoading, triggerSurfaceSync]);

  const derived = useMemo(() => {
    const watchlist = data?.companies?.slice(0, 6).map((c, i) => {
      const signal = data.fusedSignals?.find(s => s.ticker === c.ticker);
      return {
        ticker: c.ticker,
        name: (c.company_name ?? c.ticker).toUpperCase(),
        sector: (c.sector ?? "COVERAGE").toUpperCase(),
        conviction: Math.max(18, Math.min(96, Math.round(signal?.conviction_impact !== null ? 50 + (signal?.conviction_impact ?? 0) * 100 : 72 - c.priority_tier * 8))),
        sentiment: signal?.directional_sentiment ?? "neutral",
        risk: signal?.risk_adjustment ?? "stable",
        nextCatalyst: signal ? `LAST FUSED ${timeAgo(signal.created_at)}` : "AWAITING FILING",
      } as WatchlistCompany;
    }) ?? fallbackWatchlist;

    const filingEvents = data?.disclosureEvents?.slice(0, 5).map(e => ({
      ticker: e.ticker,
      company: e.ticker,
      filingType: e.filing_type,
      timestamp: timeAgo(e.event_timestamp),
      status: e.status.toUpperCase().replace("_", " "),
      summary: e.title ?? `NEW ${e.filing_type} DETECTED`,
      action: "ANALYZING",
    })) ?? fallbackFilingEvents;

    return { watchlist, filingEvents };
  }, [data]);

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-body selection:bg-[#d8c3a5]/30">
      {/* Editorial Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-20 border-b border-white/[0.03] bg-[#020202]/80 backdrop-blur-xl flex items-center px-10">
        <div className="flex items-center gap-10 w-full">
          <div className="flex flex-col">
            <span className="text-xl font-display font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#d8c3a5] to-[#f4efe6]">ACE // FINS</span>
            <span className="text-[9px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold">Autonomous Financial Intelligence</span>
          </div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <nav className="hidden md:flex gap-8 text-[10px] font-mono tracking-[0.2em] text-white/40 uppercase">
            <span className="text-white">SURFACE</span>
            <span className="hover:text-white transition-colors cursor-pointer">LITIGATION</span>
            <span className="hover:text-white transition-colors cursor-pointer">SENTIMENT</span>
            <span className="hover:text-white transition-colors cursor-pointer">ARCHIVE</span>
          </nav>
          <div className="ml-auto flex items-center gap-6">
            <div className="flex items-center gap-2">
              <PulseDot color={isSyncing ? "bg-amber-400" : "bg-[#93d24a]"} />
              <span className="text-[9px] font-mono tracking-widest text-white/30 uppercase">{isSyncing ? "SYNCING" : "LIVE"}</span>
            </div>
            <button 
              onClick={() => triggerSurfaceSync("manual")}
              disabled={isSyncing}
              className="px-4 py-2 border border-white/10 text-[9px] font-mono tracking-[0.2em] uppercase hover:bg-white/5 transition-all disabled:opacity-30"
            >
              {isSyncing ? "PROCESSING..." : "FORCE REFRESH"}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-10 max-w-[1400px] mx-auto">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Main Intelligence Column */}
          <div className="lg:col-span-8 space-y-20">
            
            {/* Mission Statement */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-6">Overview</div>
              <h1 className="text-6xl md:text-8xl font-display font-black tracking-[-0.05em] leading-[0.85] mb-8">
                Filing <span className="text-white/20">intelligence</span> <br /> 
                at the speed of <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#93d24a] to-[#d8c3a5]">thought</span>.
              </h1>
              <p className="max-w-xl text-lg text-white/40 font-light leading-relaxed">
                FINS autonomously segments disclosures into risk factors, management commentary, 
                and forward-looking statements—synchronizing neural layers across disparate data frontiers.
              </p>
            </motion.div>

            {/* Live Event Feed */}
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-white/[0.03] pb-4">
                <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase">Recent Disclosures</span>
                <span className="text-[9px] font-mono text-white/10 uppercase italic">Updating in real-time</span>
              </div>
              
              <div className="space-y-4">
                {derived.filingEvents.map((event, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="group border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.02] transition-colors p-6 flex flex-col md:flex-row gap-6 items-start"
                  >
                    <div className="w-24 shrink-0">
                      <div className="text-xl font-display font-bold text-white tracking-tighter">{event.ticker}</div>
                      <div className="text-[9px] font-mono text-[#d8c3a5] tracking-widest mt-1">{event.filingType}</div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{event.status}</div>
                      <div className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{event.summary}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest mb-2">{event.timestamp}</div>
                      <div className="flex items-center gap-2 justify-end text-[10px] font-mono text-white/60">
                        <span>{event.action}</span>
                        <ArrowUpRight />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Side Performance Column */}
          <div className="lg:col-span-4 space-y-12">
            
            {/* System Metrics */}
            <div className="space-y-6 pt-2">
              <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase">Intelligence Pulse</div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Confidence", value: "0.94" },
                  { label: "Latency", value: "14ms" },
                  { label: "Agents", value: "Active" },
                  { label: "Sync", value: "100%" }
                ].map((stat, i) => (
                  <div key={i} className="border border-white/[0.05] p-5 space-y-1">
                    <div className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-mono">{stat.label}</div>
                    <div className="text-xl font-display font-bold text-white">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Watchlist conviction */}
            <div className="space-y-8">
              <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase">Conviction Map</div>
              <div className="space-y-6">
                {derived.watchlist.map((company, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + (i * 0.1) }}
                    className="space-y-3"
                  >
                    <div className="flex items-end justify-between">
                      <div className="space-y-1">
                        <div className="text-lg font-display font-bold tracking-tighter text-white">{company.ticker}</div>
                        <div className="text-[9px] text-white/20 tracking-widest font-mono uppercase">{company.sector}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-mono font-bold text-[#93d24a]">{company.conviction}%</div>
                        <div className="text-[9px] text-white/10 tracking-widest font-mono uppercase">CONVICTION</div>
                      </div>
                    </div>
                    <div className="h-[2px] w-full bg-white/5 relative overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${company.conviction}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="absolute h-full bg-[#93d24a]"
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono tracking-widest text-white/30 uppercase">
                      <span>{company.sentiment} sentiment</span>
                      <span>{company.nextCatalyst}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* Background Texture */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-[0.03]"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
    </div>
  );
};

export default Fins;
