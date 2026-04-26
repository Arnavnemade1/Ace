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

  // Auto-refresh logic: trigger sync on load if not already primed
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
    
    // Auto-refresh on mount
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
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.03),_transparent_50%),radial-gradient(circle_at_bottom_right,_rgba(74,222,128,0.02),_transparent_50%)]" />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1800px] mx-auto space-y-24">
        {/* Header: Aurora Gradient & Professional Minimalist */}
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
            <p className="max-w-2xl text-lg text-white/40 font-light leading-relaxed">
              Autonomous SEC disclosure processing. Real-time narrative fusion and policy-bounded signal extraction.
            </p>
          </div>

          <div className="hidden lg:block w-96 text-right space-y-2">
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">Surface Status</div>
            <div className="text-xs font-mono text-white/40 tracking-tight uppercase">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={streamIndex}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                  >
                    {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Central Intelligence Briefing: Full Width Cinematic Video */}
        <section className="space-y-12">
            <div className="flex items-end justify-between border-b border-white/[0.03] pb-8">
                <div className="space-y-2">
                    <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase italic">// Atmospheric Briefing</div>
                    <h2 className="text-4xl font-black tracking-tight uppercase">Cinematic Recap</h2>
                </div>
                <div className="text-right text-[10px] font-mono text-white/20 uppercase tracking-widest">
                    Live Session // <span className="text-[#4ade80]">Auto-Refreshed</span>
                </div>
            </div>
            
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

        {/* Streamlined Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Watchlist */}
          <div className="lg:col-span-4 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Watchlist</div>
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-white/5">
              {data?.companies?.map((company, i) => (
                <div 
                    key={company.id}
                    onClick={() => setSelectedEventId(data.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                    className={`p-6 border transition-all cursor-pointer group space-y-6 ${
                        selectedEvent?.ticker === company.ticker ? "border-[#4ade80]/30 bg-white/[0.03]" : "border-white/5 bg-white/[0.01] hover:border-white/10"
                    }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-3xl font-black tracking-tight uppercase text-white group-hover:text-[#4ade80] transition-colors">{company.ticker}</h3>
                      <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{company.company_name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white tracking-tighter">{80 - i}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event Stream */}
          <div className="lg:col-span-8 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Event_Stream</div>
            <div className="space-y-8 max-h-[800px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-white/5">
              {data?.disclosureEvents?.map((event) => {
                const signal = data.fusedSignals.find(s => s.disclosure_event_id === event.id);
                return (
                    <motion.div
                        key={event.id}
                        onClick={() => setSelectedEventId(event.id)}
                        className={`p-10 border transition-all relative overflow-hidden group cursor-pointer ${
                            selectedEventId === event.id ? "border-white/20 bg-white/[0.03]" : "border-white/5 bg-white/[0.01] hover:border-white/10"
                        }`}
                    >
                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className="flex items-center gap-6">
                                <span className="text-[11px] font-mono px-4 py-1.5 bg-white/5 border border-white/10 text-white tracking-[0.2em] uppercase font-bold">
                                    {event.filing_type}
                                </span>
                                <span className="text-[11px] font-mono text-white/20 uppercase tracking-widest">
                                    {new Date(event.event_timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className={`text-[11px] font-mono uppercase tracking-[0.2em] flex items-center gap-2 font-bold ${
                                signal?.directional_sentiment === "positive" ? "text-[#4ade80]" : signal?.directional_sentiment === "negative" ? "text-[#f87171]" : "text-white/40"
                            }`}>
                                {signal?.directional_sentiment || "Neutral"}
                            </div>
                        </div>
                        
                        <div className="space-y-4 relative z-10">
                            <h3 className="text-4xl font-black tracking-tight text-white uppercase group-hover:text-white transition-colors">
                                {event.ticker}: {event.title || "Intelligence Summary"}
                            </h3>
                            <p className="text-xl text-white/40 leading-relaxed font-light max-w-5xl">
                                {signal?.causal_summary || "Analyzing narrative shift and risk factors compared with prior period."}
                            </p>
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
