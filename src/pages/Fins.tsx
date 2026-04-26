import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { FinsComposition } from "@/components/FinsComposition";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";

/**
 * FINS: Financial Intelligence Network Surface
 * A streamlined, high-fidelity interface focused on the cinematic intelligence briefing.
 */

const STREAMS = [
  "PIPELINE_STABLE",
  "NEURAL_FILTER_ACTIVE",
  "EXTRACTING_MATERIAL_DATA",
  "FUSING_CONTEXT",
  "SYNC_COMPLETE",
];

export default function Fins() {
  const { data, isLoading, error } = useFinsData();
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
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.03),_transparent_50%),radial-gradient(circle_at_bottom_right,_rgba(74,222,128,0.02),_transparent_50%)]" />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1800px] mx-auto space-y-24">
        <header className="flex flex-col lg:flex-row justify-between items-end gap-12 border-b border-white/[0.03] pb-20">
          <div className="space-y-8">
            <div className="flex items-center gap-6">
              <span className="font-['Dancing_Script'] font-bold text-5xl text-white">Ace</span>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-[11px] font-mono tracking-[0.6em] text-white/30 uppercase">// Disclosure_Intelligence_Hub</div>
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-tight leading-[0.9] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow">
              Filing <br /> Analysis.
            </h1>
          </div>
          <div className="hidden lg:block w-96 text-right space-y-2">
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">Surface Status</div>
            <div className="text-xs font-mono text-white/40 tracking-tight uppercase">
                <AnimatePresence mode="wait">
                  <motion.div key={streamIndex} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
                    {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
            </div>
          </div>
        </header>

        <section className="space-y-12">
            <div className="aspect-video w-full bg-black border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-4 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Watchlist</div>
            <div className="space-y-2 max-h-[800px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-white/5">
              {data?.companies?.map((company, i) => (
                <div key={company.id} onClick={() => setSelectedEventId(data.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                    className={`p-4 border transition-all cursor-pointer group flex justify-between items-center ${
                        selectedEvent?.ticker === company.ticker ? "border-[#4ade80]/30 bg-white/[0.03]" : "border-white/5 bg-transparent hover:border-white/10"
                    }`}>
                  <div>
                    <h3 className="text-xl font-black uppercase text-white group-hover:text-[#4ade80]">{company.ticker}</h3>
                    <p className="text-[9px] font-mono text-white/20 uppercase">{company.company_name}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white tracking-tighter">{80 - i}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Event_Wire_Log</div>
            <div className="space-y-1 max-h-[800px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-white/5 font-mono">
              {data?.disclosureEvents?.map((event) => {
                const signal = data.fusedSignals.find(s => s.disclosure_event_id === event.id);
                const isSnapshot = event.filing_type === "MARKET SNAPSHOT";
                
                return (
                    <motion.div key={event.id} onClick={() => setSelectedEventId(event.id)}
                        className={`p-4 border transition-all relative group cursor-pointer flex flex-col gap-2 ${
                            selectedEventId === event.id ? "bg-white/[0.05] border-white/20" : "bg-transparent border-white/[0.03] hover:bg-white/[0.02]"
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-4">
                                <span className={`px-2 py-0.5 border ${isSnapshot ? "border-white/10 text-white/40" : "border-[#4ade80]/20 text-[#4ade80]"} font-bold`}>
                                    {event.filing_type}
                                </span>
                                <span className="text-white/20">{new Date(event.event_timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className={`font-bold ${signal?.directional_sentiment === "positive" ? "text-[#4ade80]" : signal?.directional_sentiment === "negative" ? "text-[#f87171]" : "text-white/30"}`}>
                                {signal?.directional_sentiment?.toUpperCase() || "NEUTRAL"}
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                            <h3 className={`text-sm font-bold uppercase ${selectedEventId === event.id ? "text-white" : "text-white/70"}`}>
                                {event.ticker}: {event.title || "Intelligence Summary"}
                            </h3>
                            {!isSnapshot && (
                                <p className="text-xs text-white/40 leading-relaxed max-w-4xl italic">
                                    {signal?.causal_summary}
                                </p>
                            )}
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#020202]/80 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12">
        <div className="flex items-center gap-12 text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase w-full">
          <div className="flex items-center gap-4 text-[#4ade80]">
            <div className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_10px_#4ade80]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>Auto-Sync Cycle: 24H Active</span>
          <div className="ml-auto flex items-center gap-8 text-white/10">
            <span>V2.4.0</span>
            <div className="h-4 w-px bg-white/5" />
            <span>SESSION_SECURE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
