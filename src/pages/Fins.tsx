import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { FinsComposition } from "@/components/FinsComposition";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinsData } from "@/hooks/useFinsData";
import { Button } from "@/components/ui/button";

/**
 * FINS: Financial Intelligence Network Surface
 * A professional, high-fidelity interface for real-time disclosure interpretation.
 */

const STREAMS = [
  "PIPELINE_STABLE",
  "NEURAL_FILTER_ACTIVE",
  "EXTRACTING_MATERIAL_DATA",
  "FUSING_CONTEXT",
  "SYNC_COMPLETE",
];

const agentCommentary = {
  FilingStructurer: "Identified high-density material clusters in SEC disclosure. Normalizing semantic variance.",
  RiskEvaluator: "Cross-referencing cautionary language with volatility benchmarks. Risk delta calculated.",
  SentimentAnalyst: "Processing narrative tone against sector peers. Sentiment velocity showing directional bias.",
};

export default function Fins() {
  const { data, isLoading, error } = useFinsData();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
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
    } else if (!selectedEventId) {
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

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-sans selection:bg-[#4ade80]/30 relative overflow-hidden">
      {/* Premium Background: Deep Spectrum */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.05),_transparent_50%),radial-gradient(circle_at_bottom_right,_rgba(74,222,128,0.04),_transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.02] contrast-150 brightness-150 pointer-events-none"
          style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1800px] mx-auto space-y-24">
        {/* Header Section: Clean & Professional */}
        <header className="flex flex-col lg:flex-row justify-between items-end gap-12 border-b border-white/[0.03] pb-20">
          <div className="space-y-8">
            <div className="flex items-center gap-6">
              <span className="font-['Dancing_Script'] font-bold text-5xl text-white">Ace</span>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-[11px] font-mono tracking-[0.6em] text-white/30 uppercase">// Disclosure_Intelligence_Hub</div>
            </div>
            <h1 className="text-7xl md:text-8xl font-black tracking-tight leading-[0.9] uppercase text-[#f4efe6]">
              Filing <br /> <span className="text-white/20">Analysis.</span>
            </h1>
            <p className="max-w-2xl text-lg text-white/40 font-light leading-relaxed">
              Real-time processing of SEC disclosures. FINS extracts narrative divergence and policy-bounded signals without human oversight.
            </p>
          </div>

          <div className="w-full lg:w-[400px] space-y-6">
            <div className="p-8 border border-white/5 bg-white/[0.01] backdrop-blur-3xl space-y-6 relative group">
              <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-white/20 uppercase font-bold">
                <span>Status</span>
                <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]" />
              </div>
              <div className="text-xs font-mono text-white/60 tracking-tight h-5 overflow-hidden uppercase">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={streamIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                  >
                    &gt; {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
              </div>
              <Button 
                onClick={() => triggerSurfaceSync("manual")}
                disabled={isSyncing}
                className="w-full bg-white text-black font-black text-[11px] uppercase tracking-[0.4em] h-14 rounded-none hover:bg-white/90 transition-all"
              >
                {isSyncing ? "SYNCING..." : "REFRESH_SURFACE"}
              </Button>
            </div>
          </div>
        </header>

        {/* Visual Briefing: Controls Removed, Stunning View */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-16 items-start">
          <div className="xl:col-span-8 space-y-10">
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase italic">// Atmospheric Recap</div>
                    <h2 className="text-4xl font-black tracking-tight uppercase">Briefing</h2>
                </div>
                <div className="text-right text-[10px] font-mono text-white/20 uppercase tracking-widest">
                    Symbol: <span className="text-[#4ade80]">${selectedEvent?.ticker || "---"}</span>
                </div>
            </div>
            
            <div className="aspect-video w-full bg-black border border-white/5 shadow-2xl relative overflow-hidden">
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
                    }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
          </div>

          {/* Selection Detail: Agents Perspective */}
          <div className="xl:col-span-4 space-y-12 h-full">
            <div className="space-y-8">
                <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-4">Agent_Detail</div>
                <div className="space-y-6">
                    {Object.entries(agentCommentary).map(([agent, comment], i) => (
                        <motion.div 
                            key={agent}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono text-[#4ade80] uppercase tracking-widest font-bold">{agent}</span>
                                <div className="w-1 h-1 rounded-full bg-[#4ade80]" />
                            </div>
                            <p className="text-sm font-light text-white/50 leading-relaxed italic">
                                "{selectedSignal?.comparative_context?.[agent] as string || comment}"
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>

            <div className="p-8 border border-white/5 bg-white/[0.02] space-y-6">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Policy Outcome</div>
                <div className="space-y-2">
                    <div className="text-3xl font-black text-white uppercase tracking-tighter">
                        {selectedDecision?.action.replace(/_/g, ' ') || "Hold Baseline"}
                    </div>
                    <p className="text-[10px] text-white/30 leading-relaxed uppercase tracking-widest">
                        {selectedDecision?.causal_explanation?.primary_driver as string || "Filing normalized for comparison. Standing by for confirmation layers."}
                    </p>
                </div>
            </div>
          </div>
        </section>

        {/* Detailed Disclosure Feed */}
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
                        selectedEvent?.ticker === company.ticker ? "border-[#4ade80]/30 bg-[#4ade80]/5" : "border-white/5 bg-white/[0.01] hover:border-white/10"
                    }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-3xl font-black tracking-tight uppercase text-white group-hover:text-[#4ade80] transition-colors">{company.ticker}</h3>
                      <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{company.company_name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-white/20 uppercase mb-1">Conviction</div>
                      <div className="text-2xl font-bold text-white tracking-tighter">
                        {80 - i}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Signal</div>
                          <div className="text-[11px] font-bold text-white/40 uppercase">Stable</div>
                      </div>
                      <div className="space-y-1 text-right">
                          <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Risk</div>
                          <div className="text-[11px] font-bold text-white/40 uppercase">Low</div>
                      </div>
                  </div>

                  <div className="h-0.5 w-full bg-white/5 relative">
                    <motion.div 
                      className="absolute top-0 h-full bg-white/20" 
                      initial={{ width: 0 }}
                      animate={{ width: `${80 - i}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event Feed */}
          <div className="lg:col-span-8 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Event_Stream</div>
            <div className="space-y-8 max-h-[800px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-white/5">
              {data?.disclosureEvents?.map((event, i) => {
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
                            <div className={`w-2 h-2 rounded-full ${
                                signal?.directional_sentiment === "positive" ? "bg-[#4ade80] shadow-[0_0_8px_#4ade80]" : signal?.directional_sentiment === "negative" ? "bg-[#f87171] shadow-[0_0_8px_#f87171]" : "bg-white/20"
                            }`} />
                            {signal?.directional_sentiment || "Neutral"}
                            </div>
                        </div>
                        
                        <div className="space-y-4 relative z-10 mb-10">
                            <h3 className="text-4xl font-black tracking-tight text-white uppercase">
                                {event.ticker}: {event.title || "Intelligence Summary"}
                            </h3>
                            <p className="text-xl text-white/40 leading-relaxed font-light max-w-5xl">
                                {signal?.causal_summary || "Analyzing narrative shift and risk factors compared with prior period."}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pt-10 border-t border-white/[0.05] relative z-10">
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">Insight</div>
                                <div className="text-xs font-bold text-white/70 uppercase leading-relaxed tracking-tight">
                                    {signal?.comparative_context?.primary_finding as string || "Detected non-material variance."}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">Causal Effect</div>
                                <div className="text-xs font-bold text-white/50 uppercase leading-relaxed tracking-tight">
                                    {signal?.comparative_context?.impact_reasoning as string || "Neutral portfolio posture."}
                                </div>
                            </div>
                            <div className="space-y-2 text-right">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">Confidence</div>
                                <div className="text-2xl font-black text-white">{(signal?.confidence || 0.81).toFixed(2)}</div>
                            </div>
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
          <span>Real-time Neural Sync Active</span>
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
