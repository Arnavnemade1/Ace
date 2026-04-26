import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { FinsComposition } from "@/components/FinsComposition";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";

/**
 * FINS: Financial Intelligence Network Surface
 * A premium, high-fidelity interface focused on cinematic intelligence briefings.
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
              <div className="text-[11px] font-mono tracking-[0.6em] text-white/30 uppercase font-medium tracking-[0.8em]">Disclosure_Intelligence_Hub</div>
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-tight leading-[0.9] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#8b5cf6] via-[#ec4899] to-[#10b981] animate-gradient-slow pb-4">
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
            <div className="aspect-video w-full bg-black border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden group">
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
            <div className="flex items-center justify-between border-b border-white/[0.03] pb-6">
                <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase italic font-bold">Watchlist</div>
                <div className="text-[9px] font-mono text-white/10 uppercase tracking-widest">Tracking Strategic Assets</div>
            </div>
            <div className="space-y-3 max-h-[800px] overflow-y-auto pr-4 scrollbar-none">
              {data?.companies?.length === 0 ? (
                  <div className="p-8 border border-white/5 bg-white/[0.01] text-center space-y-4">
                      <div className="text-xs text-white/20 uppercase font-mono tracking-widest italic">No assets detected in current tier</div>
                      <p className="text-[10px] text-white/10 leading-relaxed uppercase">The intelligence network is currently focusing on top-tier strategic identifiers. Add companies to your watchlist to initiate neural filtering.</p>
                  </div>
              ) : data?.companies?.map((company, i) => (
                <motion.div 
                    key={company.id} 
                    onClick={() => setSelectedEventId(data.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                    whileHover={{ x: 4 }}
                    className={`p-5 border transition-all cursor-pointer group flex justify-between items-center backdrop-blur-md ${
                        selectedEvent?.ticker === company.ticker ? "border-[#4ade80]/40 bg-[#4ade80]/5" : "border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]"
                    }`}>
                  <div>
                    <h3 className="text-xl font-black uppercase text-white group-hover:text-[#4ade80] transition-colors tracking-tight">{company.ticker}</h3>
                    <p className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">{company.company_name}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white/80 tracking-tighter">{80 - i}%</div>
                    <div className="text-[8px] font-mono text-white/10 uppercase tracking-widest font-bold">Priority</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-10">
            <div className="flex items-center justify-between border-b border-white/[0.03] pb-6">
                <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase italic font-bold">Intelligence Feed</div>
                <div className="text-[9px] font-mono text-white/10 uppercase tracking-widest font-bold italic">Neural Sync: v2.4.0</div>
            </div>
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-white/5">
              {data?.disclosureEvents?.map((event) => {
                const signal = data.fusedSignals.find(s => s.disclosure_event_id === event.id);
                const isSnapshot = event.filing_type === "MARKET SNAPSHOT";
                const sentimentColor = signal?.directional_sentiment === "positive" ? "#4ade80" : signal?.directional_sentiment === "negative" ? "#f87171" : "rgba(255,255,255,0.1)";
                
                // Clean Title: Remove redundant Ticker and "MARKET SNAPSHOT" if obvious
                let cleanTitle = event.title || "Neutral Interpretation";
                if (isSnapshot) {
                    cleanTitle = cleanTitle.replace(`${event.ticker}: `, '').replace(`${event.ticker} `, '');
                    cleanTitle = cleanTitle.replace('MARKET SNAPSHOT', '').trim();
                    if (!cleanTitle) cleanTitle = "Market Pulse Update";
                }

                return (
                    <motion.div key={event.id} onClick={() => setSelectedEventId(event.id)}
                        whileHover={{ y: -2 }}
                        className={`p-6 border transition-all relative group cursor-pointer flex flex-col gap-4 backdrop-blur-3xl overflow-hidden ${
                            selectedEventId === event.id ? "bg-white/[0.04] border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.3)]" : "bg-white/[0.01] border-white/5 hover:border-white/10"
                        }`}
                    >
                        {/* Sentiment Stripe */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 opacity-60" style={{ backgroundColor: sentimentColor }} />

                        <div className="flex items-center justify-between text-[10px] font-mono">
                            <div className="flex items-center gap-6">
                                <span className={`px-2 py-0.5 border ${isSnapshot ? "border-white/10 text-white/30" : "border-[#4ade80]/20 text-[#4ade80]"} font-bold tracking-widest`}>
                                    {event.filing_type}
                                </span>
                                <span className="text-white/20 tracking-widest">{new Date(event.event_timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-white/10 uppercase font-bold tracking-[0.2em]">{event.ticker}</span>
                                <div className={`w-1 h-1 rounded-full`} style={{ backgroundColor: sentimentColor, boxShadow: `0 0 10px ${sentimentColor}` }} />
                            </div>
                        </div>
                        
                        <div className="space-y-2 relative">
                            <h3 className={`text-2xl font-black uppercase tracking-tight ${selectedEventId === event.id ? "text-white" : "text-white/60 group-hover:text-white/80"} transition-colors`}>
                                {cleanTitle}
                            </h3>
                            {!isSnapshot && signal?.causal_summary && (
                                <p className="text-sm text-white/40 leading-relaxed max-w-4xl font-light italic pl-4 border-l border-white/5">
                                    "{signal.causal_summary}"
                                </p>
                            )}
                            {isSnapshot && (
                                <div className="text-[10px] text-white/20 uppercase tracking-widest font-bold">
                                    {signal?.directional_sentiment?.toUpperCase() || "NEUTRAL"} // NO_MATERIAL_SHIFT_DETECTED
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#020202]/90 backdrop-blur-3xl border-t border-white/[0.03] z-50 flex items-center px-12">
        <div className="flex items-center gap-12 text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase w-full">
          <div className="flex items-center gap-4 text-[#4ade80]">
            <div className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_10px_#4ade80]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>Autonomous Neural Sync Active</span>
          <div className="ml-auto flex items-center gap-8 text-white/10">
            <span>ACE_PROTOCOL_V2.4.0</span>
            <div className="h-4 w-px bg-white/5" />
            <span>ENCRYPTED_SESSION</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
