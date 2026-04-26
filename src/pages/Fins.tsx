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
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-[#8b5cf6]/3 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-[#10b981]/3 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 pt-20 pb-20 px-8 md:px-16 max-w-[1920px] mx-auto space-y-24">
        {/* Header: Wider Letter Spacing, More Expansive Layout */}
        <header className="flex flex-col lg:flex-row justify-between items-start gap-12 border-b border-white/[0.03] pb-16">
          <div className="space-y-10 w-full lg:w-2/3">
            <div className="flex items-center gap-8">
              <span className="font-['Dancing_Script'] font-bold text-5xl text-white">Ace</span>
              <div className="h-4 w-px bg-white/10" />
              <div className="text-[10px] font-mono tracking-[0.8em] text-white/20 uppercase font-bold">Neural_Intelligence_Network</div>
            </div>
            <div className="relative group">
                {/* Expansive Glow behind text */}
                <div className="absolute -inset-x-20 -inset-y-10 bg-gradient-to-r from-[#8b5cf6]/5 via-[#ec4899]/5 to-[#10b981]/5 blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <h1 className="text-6xl md:text-8xl font-black tracking-[-0.02em] leading-[0.85] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow pb-2 relative z-10">
                    Intelligence <br /> 
                    <span className="tracking-[0.1em] opacity-90 transition-all duration-700 hover:tracking-[0.15em]">Wire.</span>
                </h1>
            </div>
          </div>
          <div className="hidden lg:block w-80 text-right space-y-3 pt-12">
            <div className="text-[9px] font-mono tracking-[0.5em] text-white/20 uppercase font-bold">Status_Sync</div>
            <div className="text-[11px] font-mono text-white/40 tracking-tighter uppercase overflow-hidden h-5">
                <AnimatePresence mode="wait">
                  <motion.div key={streamIndex} initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -15, opacity: 0 }}>
                    &gt; {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Cinematic Briefing: Center Stage */}
        <section className="space-y-12">
            <div className="aspect-video w-full bg-black border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative overflow-hidden rounded-sm">
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

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
          {/* Watchlist */}
          <div className="xl:col-span-4 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.5em] text-white/20 uppercase italic font-bold border-b border-white/5 pb-6">Strategic_Watchlist</div>
            <div className="grid grid-cols-1 gap-3">
              {WATCHLIST_MOCK.map((company, i) => {
                const isActive = selectedEvent?.ticker === company.ticker;
                return (
                    <motion.div key={company.ticker} onClick={() => setSelectedEventId(data?.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                        whileHover={{ x: 5 }}
                        className={`group relative p-6 border transition-all cursor-pointer backdrop-blur-3xl ${
                            isActive ? "bg-white/[0.05] border-white/20 shadow-2xl" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 transition-all ${isActive ? "bg-[#8b5cf6]" : "bg-white/5"}`} />
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className={`text-2xl font-black uppercase tracking-tight transition-colors ${isActive ? "text-white" : "text-white/40 group-hover:text-white"}`}>
                                    {company.ticker}
                                </h3>
                                <p className="text-[9px] font-mono text-white/10 uppercase tracking-widest">{company.name}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold text-white/80 tracking-tighter">{company.conviction}</div>
                                <div className="text-[8px] font-mono text-[#10b981] uppercase tracking-[0.2em] font-bold">Priority</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>

          {/* Event Wire */}
          <div className="xl:col-span-8 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.5em] text-white/20 uppercase italic font-bold border-b border-white/5 pb-6">Intelligence_Stream</div>
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-white/5">
              {deduplicatedEvents.map((event) => {
                const signal = data?.fusedSignals.find(s => s.disclosure_event_id === event.id);
                const isSelected = selectedEventId === event.id;
                const sentimentColor = signal?.directional_sentiment === "positive" ? "#4ade80" : signal?.directional_sentiment === "negative" ? "#f87171" : "rgba(255,255,255,0.1)";
                
                return (
                    <motion.div key={event.id} onClick={() => setSelectedEventId(event.id)}
                        whileHover={{ y: -2 }}
                        className={`group relative p-8 border transition-all cursor-pointer backdrop-blur-3xl overflow-hidden ${
                            isSelected ? "bg-white/[0.07] border-white/20 shadow-2xl" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        <div className="absolute left-0 top-0 bottom-0 w-1 opacity-50" style={{ backgroundColor: sentimentColor }} />
                        
                        <div className="flex flex-col gap-6 relative z-10">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                                <div className="flex items-center gap-8">
                                    <span className="px-4 py-1.5 border border-white/5 text-white/30 tracking-[0.4em] uppercase font-bold">{event.filing_type}</span>
                                    <span className="text-white/10 uppercase tracking-[0.4em]">{new Date(event.event_timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-white/40 uppercase tracking-[0.4em] font-bold">{event.ticker}</span>
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sentimentColor, boxShadow: `0 0 10px ${sentimentColor}` }} />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className={`text-3xl md:text-4xl font-black uppercase tracking-tighter leading-tight transition-colors ${isSelected ? "text-white" : "text-white/60 group-hover:text-white"}`}>
                                    {event.title || "Intelligence Summary"}
                                </h3>
                                {event.filing_type !== "MARKET SNAPSHOT" && signal?.causal_summary && (
                                    <p className="text-lg text-white/30 leading-relaxed max-w-5xl font-light italic pl-6 border-l border-white/5">
                                        "{signal.causal_summary}"
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between pt-8 border-t border-white/[0.03]">
                                <div className="flex gap-12">
                                    <div className="space-y-1">
                                        <div className="text-[9px] font-mono text-white/10 uppercase tracking-[0.5em] font-bold">Confidence</div>
                                        <div className="text-base font-bold text-white/50">{(signal?.confidence || 0.85).toFixed(2)}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] font-mono text-white/10 uppercase tracking-[0.5em] font-bold">Sentiment</div>
                                        <div className="text-base font-bold uppercase tracking-[0.2em]" style={{ color: sentimentColor }}>{signal?.directional_sentiment || "Neutral"}</div>
                                    </div>
                                </div>
                                <div className="text-[10px] font-mono text-white/5 uppercase tracking-[0.8em] font-bold italic">ACE_SYNC_STABLE</div>
                            </div>
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#020202]/98 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12">
        <div className="flex items-center gap-12 text-[10px] font-mono tracking-[0.6em] text-white/20 uppercase w-full font-bold">
          <div className="flex items-center gap-4 text-[#10b981]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>AUTONOMOUS_SYNC_CYCLE // 24H_ACTIVE</span>
          <div className="ml-auto text-white/5">V2.4.0_ENCRYPTED</div>
        </div>
      </footer>
    </div>
  );
}
