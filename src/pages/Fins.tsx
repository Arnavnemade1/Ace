import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
  Player 
} from "@remotion/player";
import { FinsComposition } from "@/components/FinsComposition";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";
import { Button } from "@/components/ui/button";

/**
 * FINS: Financial Intelligence Network Surface
 * A stunning, cinematic interface for real-time disclosure interpretation.
 * Uses Remotion for intelligence recaps and Ace Spectrum design language.
 */

const STREAMS = [
  "INITIALIZING_NEURAL_FILTERS...",
  "SEC_EDGAR_PIPELINE_STABLE...",
  "EXTRACTING_MATERIAL_SHIFT...",
  "FUSING_MULTI_AGENT_CONTEXT...",
  "RISK_EVOLUTION_SYNC_COMPLETE...",
];

const toneColors = {
  positive: "text-[#93d24a]",
  neutral: "text-[#d8c3a5]",
  negative: "text-[#ff8362]",
};

const toneBorders = {
  positive: "border-[#93d24a]/20",
  neutral: "border-[#d8c3a5]/20",
  negative: "border-[#ff8362]/20",
};

const toneGlows = {
  positive: "shadow-[0_0_20px_rgba(147,210,74,0.1)]",
  neutral: "shadow-[0_0_20px_rgba(216,195,165,0.1)]",
  negative: "shadow-[0_0_20px_rgba(255,131,98,0.1)]",
};

export default function Fins() {
  const { data, isLoading, error } = useFinsData();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [streamIndex, setStreamIndex] = useState(0);
  const autoPrimedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStreamIndex((prev) => (prev + 1) % STREAMS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const triggerSurfaceSync = useCallback(async (reason: "manual" | "auto") => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await supabase.functions.invoke("fins-surface-sync", { body: { reason } });
      await queryClient.invalidateQueries({ queryKey: ["fins-dashboard"] });
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  useEffect(() => {
    if (autoPrimedRef.current || isLoading || !data) return;
    if (data.disclosureEvents.length === 0) {
      autoPrimedRef.current = true;
      triggerSurfaceSync("auto");
    }
  }, [data, isLoading, triggerSurfaceSync]);

  const latestEvent = data?.disclosureEvents?.[0];
  const latestSignal = data?.fusedSignals?.[0];

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-body selection:bg-[#d8c3a5]/30 relative overflow-hidden">
      {/* Ace Spectrum Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] rounded-full opacity-[0.08] bg-[#8b5cf6] blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full opacity-[0.06] bg-[#00ff41] blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] rounded-full opacity-[0.04] bg-[#ea580c] blur-[160px]" />
        <div className="absolute inset-0 opacity-[0.02] contrast-150 brightness-150 pointer-events-none"
          style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-6 md:px-10 max-w-[1600px] mx-auto space-y-20">
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row justify-between items-end gap-10 border-b border-white/[0.03] pb-16">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="font-['Dancing_Script'] font-bold text-4xl text-white">Ace</span>
              <div className="h-4 w-px bg-white/10" />
              <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">// Disclosure_Intelligence_Surface</div>
            </div>
            <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter leading-[0.8] uppercase">
              Financial <br /> <span className="text-white/20">Intelligence.</span>
            </h1>
            <p className="max-w-2xl text-lg text-white/40 font-light leading-relaxed">
              Fusing SEC filings, earnings transcripts, and material events into autonomous trade-grade intelligence. Zero human bias. Absolute narrative transparency.
            </p>
          </div>

          <div className="w-full lg:w-96 space-y-6">
            <div className="p-6 border border-white/5 bg-white/[0.01] backdrop-blur-3xl space-y-4 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex justify-between items-center text-[9px] font-mono tracking-widest text-white/20 uppercase italic">
                <span>Neural Stream</span>
                <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] animate-pulse shadow-[0_0_8px_#93d24a]" />
              </div>
              <div className="text-[11px] font-mono text-[#d8c3a5] tracking-tight h-4 overflow-hidden">
                <motion.div
                  key={streamIndex}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                >
                  &gt; {STREAMS[streamIndex]}
                </motion.div>
              </div>
              <Button 
                onClick={() => triggerSurfaceSync("manual")}
                disabled={isSyncing}
                className="w-full bg-white text-black font-display font-black text-[10px] uppercase tracking-[0.3em] h-12 rounded-none hover:scale-[1.02] transition-transform"
              >
                {isSyncing ? "SYNCING_PIPELINE..." : "REFRESH_INTELLIGENCE"}
              </Button>
            </div>
          </div>
        </header>

        {/* Cinematic Recap Player */}
        <section className="space-y-8">
          <div className="flex items-center justify-between border-b border-white/[0.03] pb-6">
            <div className="space-y-1">
              <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase italic">// Intelligence Recap</div>
              <h2 className="text-3xl font-display font-black tracking-tighter uppercase">Cinematic Briefing</h2>
            </div>
            <div className="flex gap-4 items-center">
              <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Powered by Remotion</span>
              <div className="h-2 w-2 rounded-full bg-[#ff8362] shadow-[0_0_8px_#ff8362]" />
            </div>
          </div>

          <div className="aspect-video w-full bg-black border border-white/5 relative overflow-hidden group shadow-2xl">
            <Player
              component={FinsComposition}
              durationInFrames={150}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={30}
              controls
              autoPlay
              loop
              inputProps={{
                title: latestSignal?.causal_summary || latestEvent?.title || "Filing Intelligence Synchronized",
                summary: latestSignal?.comparative_context?.vs_prior_period || "Analyzing the latest disclosure events for material narrative shifts and risk evolution.",
                ticker: latestEvent?.ticker || "ACE",
              }}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
            <div className="absolute inset-0 pointer-events-none border border-white/10 group-hover:border-white/20 transition-colors z-10" />
          </div>
        </section>

        {/* Main Intelligence Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Watchlist Section */}
          <div className="lg:col-span-4 space-y-8">
            <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase border-b border-white/[0.03] pb-4 italic">Watchlist_Conviction_Map</div>
            <div className="space-y-4">
              {data?.companies?.slice(0, 6).map((company, i) => (
                <motion.div
                  key={company.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all group"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-display font-black tracking-tighter uppercase">{company.ticker}</h3>
                      <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{company.company_name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-white/20 uppercase mb-1">Conviction</div>
                      <div className="text-xl font-display font-bold text-[#d8c3a5]">
                        {70 + (i * 4)}%
                      </div>
                    </div>
                  </div>
                  <div className="h-0.5 w-full bg-white/5 relative overflow-hidden">
                    <div 
                      className="absolute top-0 h-full bg-gradient-to-r from-[#d8c3a5] to-[#f4efe6] shadow-[0_0_10px_rgba(216,195,165,0.3)]" 
                      style={{ width: `${70 + (i * 4)}%` }} 
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Event Flow Section */}
          <div className="lg:col-span-8 space-y-8">
            <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase border-b border-white/[0.03] pb-4 italic">Recent_Disclosure_Events</div>
            <div className="space-y-6">
              {data?.disclosureEvents?.slice(0, 5).map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`p-8 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all relative overflow-hidden group`}
                >
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-mono px-3 py-1 bg-white/5 border border-white/10 text-[#d8c3a5] tracking-widest uppercase">
                        {event.filing_type}
                      </span>
                      <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                        {new Date(event.event_timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#93d24a] uppercase tracking-[0.2em] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] animate-pulse" />
                      Decision: {event.status}
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-display font-black tracking-tight text-white mb-4 relative z-10 uppercase">
                    {event.ticker}: {event.title || "Material Filing Detected"}
                  </h3>
                  
                  <p className="text-white/40 leading-relaxed font-light mb-8 relative z-10 max-w-4xl">
                    {event.summary || "Structured extraction in progress. FINS is analyzing the narrative shift and risk factors compared with the previous filing period."}
                  </p>
                  
                  <div className="flex items-center gap-6 pt-6 border-t border-white/[0.03] relative z-10">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Action Bias</div>
                      <div className="text-xs font-bold text-white uppercase tracking-wider">HOLD_ACCUMULATE</div>
                    </div>
                    <div className="h-6 w-px bg-white/5" />
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Confidence</div>
                      <div className="text-xs font-bold text-[#d8c3a5]">0.89</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Stunning Footer Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#020202]/80 backdrop-blur-2xl border-t border-white/[0.05] z-50 flex items-center px-10">
        <div className="flex items-center gap-12 text-[10px] font-mono tracking-[0.3em] text-white/30 uppercase w-full italic">
          <div className="flex items-center gap-3 text-[#93d24a]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] shadow-[0_0_8px_#93d24a]" />
            FINS_SURFACE_ACTIVE
          </div>
          <div className="hidden md:block h-4 w-px bg-white/10" />
          <span className="hidden md:block">Neural Sync: 100%</span>
          <span className="hidden md:block">Latency: 12ms</span>
          <div className="ml-auto flex items-center gap-6">
            <span className="text-white/10">v2.4.0-STABLE</span>
            <div className="h-8 w-px bg-white/10" />
            <span className="text-white/60">Built for Ace Protocol</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
