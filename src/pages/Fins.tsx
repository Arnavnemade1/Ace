import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { FinsComposition } from "@/components/FinsComposition";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";

/**
 * FINS: Financial Intelligence Network Surface
 * A hyper-premium, cinematic interface for real-time disclosure interpretation.
 */

const STREAMS = [
  "NEURAL_PIPELINE_STABLE",
  "FUSING_MULTI_AGENT_CONTEXT",
  "EXTRACTING_MATERIAL_SIGNALS",
  "RISK_EVOLUTION_SYNCED",
  "ACE_PROTOCOL_ACTIVE",
];

const WATCHLIST_MOCK = [
  { ticker: "MSFT", name: "Microsoft", conviction: "80%" },
  { ticker: "NVDA", name: "NVIDIA", conviction: "79%" },
  { ticker: "TSLA", name: "Tesla", conviction: "78%" },
  { ticker: "AAPL", name: "Apple", conviction: "77%" },
  { ticker: "AMZN", name: "Amazon", conviction: "76%" },
  { ticker: "XOM", name: "Exxon Mobil", conviction: "75%" },
  { ticker: "META", name: "Meta", conviction: "74%" },
];

export default function Fins() {
  const { data, isLoading } = useFinsData();
  const queryClient = useQueryClient();
  const [streamIndex, setStreamIndex] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const autoPrimedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStreamIndex((prev) => (prev + 1) % STREAMS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const triggerSurfaceSync = useCallback(async (reason: "manual" | "auto") => {
    try {
      await supabase.functions.invoke("fins-surface-sync", { body: { reason } });
      await queryClient.invalidateQueries({ queryKey: ["fins-dashboard"] });
    } catch (e) {
      console.error("Sync failed", e);
    }
  }, [queryClient]);

  useEffect(() => {
    if (autoPrimedRef.current || isLoading || !data) return;
    autoPrimedRef.current = true;
    triggerSurfaceSync("auto");
    if (data.disclosureEvents.length > 0 && !selectedEventId) {
      setSelectedEventId(data.disclosureEvents[0].id);
    }
  }, [data, isLoading, triggerSurfaceSync, selectedEventId]);

  const selectedEvent = useMemo(() => {
    return data?.disclosureEvents?.find(e => e.id === selectedEventId) || data?.disclosureEvents?.[0];
  }, [data, selectedEventId]);

  const selectedSignal = useMemo(() => {
    return data?.fusedSignals?.find(s => s.disclosure_event_id === selectedEvent?.id);
  }, [data, selectedEvent]);

  const selectedDecision = useMemo(() => {
    return data?.decisions?.find(d => d.disclosure_event_id === selectedEvent?.id);
  }, [data, selectedEvent]);

  const agentInsights = useMemo(() => {
    if (!selectedSignal) return undefined;
    return [
      selectedSignal.causal_summary || "Analyzing narrative shift...",
      selectedSignal.comparative_context?.primary_finding as string || "Cross-referencing benchmarks.",
      selectedSignal.comparative_context?.impact_reasoning as string || "Fusing multi-agent context."
    ].slice(0, 3);
  }, [selectedSignal]);

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-sans selection:bg-[#4ade80]/30 relative overflow-hidden">
      {/* Aurora Atmospheric Layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#8b5cf6]/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1920px] mx-auto space-y-32">
        {/* Header: Aurora Brand Experience */}
        <header className="flex flex-col lg:flex-row justify-between items-start gap-12">
          <div className="space-y-10">
            <div className="flex items-center gap-6">
              <span className="font-['Dancing_Script'] font-bold text-5xl text-white">Ace</span>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-[10px] font-mono tracking-[0.8em] text-white/30 uppercase font-bold italic">Financial_Intelligence_Network</div>
            </div>
            <h1 className="text-8xl md:text-[11rem] font-black tracking-tighter leading-[0.8] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow pb-4">
              Intelligence <br /> Feed.
            </h1>
          </div>
          <div className="hidden lg:block w-96 text-right space-y-4 pt-12">
            <div className="text-[10px] font-mono tracking-[0.5em] text-white/20 uppercase font-bold italic border-b border-white/5 pb-2">Pipeline Status</div>
            <div className="text-sm font-mono text-white/60 tracking-tighter uppercase overflow-hidden h-6">
                <AnimatePresence mode="wait">
                  <motion.div key={streamIndex} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
                    &gt; {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Cinematic Briefing: Center Stage */}
        <section className="space-y-16">
            <div className="aspect-video w-full bg-black border border-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative overflow-hidden group rounded-sm">
                <Player
                    component={FinsComposition}
                    durationInFrames={180}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={30}
                    controls={false}
                    autoPlay
                    loop
                    inputProps={{
                        title: selectedEvent?.title || "Neutral Market Context",
                        ticker: selectedEvent?.ticker || "ACE",
                        sentiment: selectedSignal?.directional_sentiment || "neutral",
                        agentInsights: agentInsights,
                        policyOutcome: selectedDecision?.action?.replace(/_/g, ' '),
                        confidence: selectedSignal?.confidence
                    }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </section>

        {/* Intelligence Grid: Watchlist + Wire Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-24">
          
          {/* Enhanced Watchlist: Premium Cards */}
          <div className="xl:col-span-4 space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-8">
                <div className="text-[12px] font-mono tracking-[0.4em] text-white/20 uppercase italic font-bold">Watchlist_Strategic</div>
                <div className="text-[10px] font-mono text-[#10b981] uppercase tracking-widest font-bold">Active_Tracking</div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {WATCHLIST_MOCK.map((company, i) => {
                const isActive = selectedEvent?.ticker === company.ticker;
                return (
                    <motion.div 
                        key={company.ticker} 
                        onClick={() => setSelectedEventId(data?.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                        whileHover={{ scale: 1.02 }}
                        className={`group relative p-8 border transition-all cursor-pointer overflow-hidden backdrop-blur-3xl ${
                            isActive ? "bg-white/[0.03] border-white/20 shadow-[0_0_40px_rgba(139,92,246,0.1)]" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        {/* Status Marker */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${isActive ? "bg-[#8b5cf6]" : "bg-white/5 group-hover:bg-white/10"}`} />
                        
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <h3 className={`text-4xl font-black uppercase tracking-tighter transition-colors ${isActive ? "text-white" : "text-white/40 group-hover:text-white"}`}>
                                    {company.ticker}
                                </h3>
                                <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] font-bold">{company.name}</p>
                            </div>
                            <div className="text-right space-y-1">
                                <div className="text-2xl font-black text-white/80 tracking-tighter">{company.conviction}</div>
                                <div className="text-[9px] font-mono text-[#10b981] uppercase tracking-widest font-bold">Priority</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>

          {/* Premium Intelligence Wire Feed */}
          <div className="xl:col-span-8 space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-8">
                <div className="text-[12px] font-mono tracking-[0.4em] text-white/20 uppercase italic font-bold">Neural_Wire_Feed</div>
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest font-bold">Sync: v2.4.0</div>
            </div>
            <div className="space-y-6">
              {data?.disclosureEvents?.map((event) => {
                const signal = data.fusedSignals.find(s => s.disclosure_event_id === event.id);
                const isSelected = selectedEventId === event.id;
                const sentimentColor = signal?.directional_sentiment === "positive" ? "#4ade80" : signal?.directional_sentiment === "negative" ? "#f87171" : "rgba(255,255,255,0.2)";
                
                return (
                    <motion.div 
                        key={event.id} 
                        onClick={() => setSelectedEventId(event.id)}
                        whileHover={{ x: 10 }}
                        className={`group relative p-10 border transition-all cursor-pointer backdrop-blur-3xl overflow-hidden ${
                            isSelected ? "bg-white/[0.05] border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.4)]" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className="flex flex-col gap-8 relative z-10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-8">
                                    <span className="text-[10px] font-mono px-4 py-1.5 border border-white/10 text-white/40 tracking-[0.4em] uppercase font-bold">
                                        {event.filing_type}
                                    </span>
                                    <span className="text-[10px] font-mono text-white/10 uppercase tracking-widest font-bold italic">
                                        {new Date(event.event_timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.4em] font-bold">{event.ticker}</span>
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sentimentColor, boxShadow: `0 0 15px ${sentimentColor}` }} />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className={`text-4xl md:text-5xl font-black uppercase tracking-tighter leading-tight transition-colors ${isSelected ? "text-white" : "text-white/60 group-hover:text-white"}`}>
                                    {event.title || "Intelligence Summary"}
                                </h3>
                                <p className="text-xl text-white/30 leading-relaxed font-light italic max-w-5xl pl-8 border-l border-white/5">
                                    "{signal?.causal_summary || "Analyzing strategic narrative shift and policy deviation benchmarks..."}"
                                </p>
                            </div>

                            <div className="flex items-center justify-between pt-8 border-t border-white/[0.02]">
                                <div className="flex gap-12">
                                    <div className="space-y-1">
                                        <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.4em] font-bold">Conviction</div>
                                        <div className="text-lg font-bold text-white/60">{(signal?.confidence || 0.85).toFixed(2)}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.4em] font-bold">Sentiment</div>
                                        <div className="text-lg font-bold uppercase tracking-widest" style={{ color: sentimentColor }}>{signal?.directional_sentiment || "Neutral"}</div>
                                    </div>
                                </div>
                                <div className="text-[10px] font-mono text-white/10 uppercase tracking-[0.5em] font-bold italic italic">ACE_SYNC_STABLE</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[#020202]/95 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12">
        <div className="flex items-center gap-12 text-[11px] font-mono tracking-[0.5em] text-white/20 uppercase w-full font-bold">
          <div className="flex items-center gap-4 text-[#10b981]">
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_15px_#10b981]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>REALTIME_SYNC_ACTIVE // CYCLE_24H</span>
          <div className="ml-auto flex items-center gap-8 text-white/10">
            <span>ACE_PROT_V2.4</span>
            <div className="h-4 w-px bg-white/5" />
            <span>ENCRYPTED_LINK_STABLE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
