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

  const deduplicatedEvents = useMemo(() => {
    if (!data?.disclosureEvents) return [];
    const seenSnapshots = new Set<string>();
    return data.disclosureEvents.filter((event) => {
      if (event.filing_type === "MARKET SNAPSHOT") {
        if (seenSnapshots.has(event.ticker)) return false;
        seenSnapshots.add(event.ticker);
        return true;
      }
      return true;
    });
  }, [data?.disclosureEvents]);

  const selectedEvent = useMemo(() => {
    return data?.disclosureEvents?.find(e => e.id === selectedEventId) || deduplicatedEvents?.[0];
  }, [data, selectedEventId, deduplicatedEvents]);

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
      {/* Hyper-Flare Atmospheric Layers */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-[#8b5cf6]/5 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-[#10b981]/5 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[1px] h-[40%] bg-gradient-to-b from-transparent via-white/5 to-transparent" />
        <div className="absolute bottom-[20%] left-[10%] w-[1px] h-[40%] bg-gradient-to-b from-transparent via-white/5 to-transparent" />
      </div>

      <main className="relative z-10 pt-20 pb-20 px-8 md:px-16 max-w-[1920px] mx-auto space-y-28">
        {/* Header: FINS with Flare */}
        <header className="flex flex-col lg:flex-row justify-between items-start gap-12 border-b border-white/[0.03] pb-20 relative">
          {/* Decorative Flare Element */}
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#8b5cf6]/10 blur-[60px] rounded-full opacity-50" />
          
          <div className="space-y-12 w-full lg:w-2/3 relative z-10">
            <div className="flex items-center gap-10">
              <span className="font-['Dancing_Script'] font-bold text-6xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">Ace</span>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-[10px] font-mono tracking-[1em] text-white/20 uppercase font-bold italic">Neural_Intelligence_Network</div>
            </div>
            
            <div className="relative group inline-block">
                {/* Text Flare Effect */}
                <div className="absolute -inset-x-20 -inset-y-10 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                
                <h1 className="text-[12rem] md:text-[16rem] font-black tracking-[-0.05em] leading-[0.7] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow pb-4 relative drop-shadow-[0_0_30px_rgba(139,92,246,0.15)]">
                    FINS<span className="text-white/10">.</span>
                </h1>
                
                {/* Floating HUD Flare */}
                <div className="absolute top-0 -right-20 flex flex-col gap-1 opacity-20">
                    <div className="w-10 h-px bg-white" />
                    <div className="w-6 h-px bg-white" />
                    <div className="w-14 h-px bg-white" />
                </div>
            </div>
          </div>

          <div className="hidden lg:block w-96 text-right space-y-4 pt-20">
            <div className="text-[10px] font-mono tracking-[0.6em] text-white/20 uppercase font-bold italic border-b border-white/5 pb-2">Operational_Status</div>
            <div className="text-sm font-mono text-[#10b981] tracking-tighter uppercase overflow-hidden h-6">
                <AnimatePresence mode="wait">
                  <motion.div key={streamIndex} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="flex items-center justify-end gap-3">
                    <span className="w-1 h-1 rounded-full bg-[#10b981] animate-pulse" />
                    {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Cinematic Briefing: Center Stage */}
        <section className="space-y-16 relative">
            {/* Ambient Background Flare for Video */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#8b5cf6]/5 to-transparent blur-[100px] -z-10" />
            
            <div className="aspect-video w-full bg-black border border-white/10 shadow-[0_60px_120px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-[2px] group">
                <div className="absolute inset-0 border border-white/5 group-hover:border-white/20 transition-colors pointer-events-none z-20" />
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

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-20">
          {/* Strategic Universe */}
          <div className="xl:col-span-4 space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-8">
                <div className="text-[12px] font-mono tracking-[0.5em] text-white/30 uppercase italic font-bold">Strategic_Assets</div>
                <div className="text-[10px] font-mono text-white/10 uppercase tracking-widest font-bold italic">Neural_Priority</div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {WATCHLIST_MOCK.map((company, i) => {
                const isActive = selectedEvent?.ticker === company.ticker;
                return (
                    <motion.div key={company.ticker} onClick={() => setSelectedEventId(data?.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                        whileHover={{ scale: 1.01, x: 5 }}
                        className={`group relative p-8 border transition-all cursor-pointer backdrop-blur-3xl overflow-hidden ${
                            isActive ? "bg-white/[0.06] border-white/20 shadow-[0_0_50px_rgba(139,92,246,0.1)]" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${isActive ? "bg-[#8b5cf6]" : "bg-white/5 group-hover:bg-white/10"}`} />
                        <div className="flex justify-between items-center relative z-10">
                            <div className="space-y-1">
                                <h3 className={`text-4xl font-black uppercase tracking-tighter transition-colors ${isActive ? "text-white" : "text-white/40 group-hover:text-white"}`}>
                                    {company.ticker}
                                </h3>
                                <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.4em] font-bold">{company.name}</p>
                            </div>
                            <div className="text-right space-y-1">
                                <div className="text-3xl font-black text-white/80 tracking-tighter">{company.conviction}</div>
                                <div className="text-[9px] font-mono text-[#10b981] uppercase tracking-widest font-bold">CONVICTION</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>

          {/* Intelligence Wire */}
          <div className="xl:col-span-8 space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-8">
                <div className="text-[12px] font-mono tracking-[0.5em] text-white/30 uppercase italic font-bold">Intelligence_Wire</div>
                <div className="text-[10px] font-mono text-white/10 uppercase tracking-widest font-bold">Sync: v2.4.0_STABLE</div>
            </div>
            <div className="space-y-6 max-h-[1000px] overflow-y-auto pr-8 scrollbar-thin scrollbar-thumb-white/5">
              {deduplicatedEvents.map((event) => {
                const signal = data?.fusedSignals.find(s => s.disclosure_event_id === event.id);
                const isSelected = selectedEventId === event.id;
                const sentimentColor = signal?.directional_sentiment === "positive" ? "#4ade80" : signal?.directional_sentiment === "negative" ? "#f87171" : "rgba(255,255,255,0.2)";
                
                return (
                    <motion.div key={event.id} onClick={() => setSelectedEventId(event.id)}
                        whileHover={{ x: 10 }}
                        className={`group relative p-12 border transition-all cursor-pointer backdrop-blur-3xl overflow-hidden ${
                            isSelected ? "bg-white/[0.08] border-white/30 shadow-[0_30px_90px_rgba(0,0,0,0.5)]" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 opacity-60" style={{ backgroundColor: sentimentColor }} />
                        
                        <div className="flex flex-col gap-10 relative z-10">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                                <div className="flex items-center gap-10">
                                    <span className="px-5 py-2 border border-white/10 text-white/40 tracking-[0.5em] uppercase font-bold bg-white/5">{event.filing_type}</span>
                                    <span className="text-white/20 uppercase tracking-[0.5em] font-bold italic">{new Date(event.event_timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-white/50 uppercase tracking-[0.6em] font-black">{event.ticker}</span>
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sentimentColor, boxShadow: `0 0 20px ${sentimentColor}` }} />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className={`text-4xl md:text-5xl font-black uppercase tracking-tighter leading-[1.1] transition-colors ${isSelected ? "text-white" : "text-white/60 group-hover:text-white"}`}>
                                    {event.title || "Neutral Interpretation"}
                                </h3>
                                {event.filing_type !== "MARKET SNAPSHOT" && signal?.causal_summary && (
                                    <p className="text-2xl text-white/30 leading-relaxed max-w-6xl font-light italic pl-10 border-l-2 border-white/5">
                                        "{signal.causal_summary}"
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between pt-10 border-t border-white/[0.05]">
                                <div className="flex gap-16">
                                    <div className="space-y-2">
                                        <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.6em] font-bold italic">Neural_Confidence</div>
                                        <div className="text-2xl font-black text-white/60 tracking-tight">{(signal?.confidence || 0.85).toFixed(2)}</div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.6em] font-bold italic">Directional_Bias</div>
                                        <div className="text-2xl font-black uppercase tracking-[0.1em]" style={{ color: sentimentColor }}>{signal?.directional_sentiment || "Neutral"}</div>
                                    </div>
                                </div>
                                <div className="text-[11px] font-mono text-white/10 uppercase tracking-[1em] font-bold italic">SYNC_ACTIVE</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[#020202]/98 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-16 text-[11px] font-mono tracking-[0.8em] text-white/20 uppercase w-full font-black italic">
          <div className="flex items-center gap-6 text-[#10b981]">
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_15px_#10b981]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-6 w-px bg-white/10" />
          <span>AUTONOMOUS_INTELLIGENCE_STREAM // 24H_CYCLE</span>
          <div className="ml-auto text-white/10 tracking-[1.5em] scale-75 origin-right">ACE_FINS_PROTOCOL_V2.4</div>
        </div>
      </footer>
    </div>
  );
}
