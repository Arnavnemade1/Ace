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
 * A stunning, cinematic interface for real-time disclosure interpretation.
 */

const STREAMS = [
  "INITIALIZING_NEURAL_FILTERS...",
  "SEC_EDGAR_PIPELINE_STABLE...",
  "EXTRACTING_MATERIAL_SHIFT...",
  "FUSING_MULTI_AGENT_CONTEXT...",
  "RISK_EVOLUTION_SYNC_COMPLETE...",
];

const agentCommentary = {
  FilingStructurer: "Identified high-density material clusters in Item 1A and Management Commentary. Normalizing semantic variance.",
  RiskEvaluator: "Cross-referencing newly introduced cautionary language with historical volatility benchmarks. Risk delta calculated.",
  SentimentAnalyst: "Processing narrative tone against sector peers. Sentiment velocity showing significant directional bias.",
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
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-body selection:bg-[#93d24a]/30 relative overflow-hidden">
      {/* High-End Background: Deep Spectrum */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.08),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(147,210,74,0.06),_transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.03] contrast-150 brightness-150 pointer-events-none"
          style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      </div>

      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 max-w-[1800px] mx-auto space-y-24">
        {/* Header Section: Premium Typography */}
        <header className="flex flex-col lg:flex-row justify-between items-end gap-12 border-b border-white/[0.03] pb-20">
          <div className="space-y-8">
            <div className="flex items-center gap-6">
              <span className="font-['Dancing_Script'] font-bold text-5xl text-white">Ace</span>
              <div className="h-6 w-px bg-white/10" />
              <div className="text-[11px] font-mono tracking-[0.6em] text-white/30 uppercase italic">// Financial_Intelligence_Network</div>
            </div>
            <h1 className="text-7xl md:text-9xl font-display font-black tracking-tight leading-[0.85] uppercase text-[#f4efe6] font-outfit">
              Corporate <br /> <span className="text-white/10 italic font-serif font-light lowercase font-cormorant">Whispers.</span>
            </h1>
            <p className="max-w-3xl text-xl text-white/40 font-light leading-relaxed font-cormorant italic">
              Autonomous parsing of SEC EDGAR disclosures and material earnings events. FINS extracts narrative divergence, risk acceleration, and policy-bounded signals in real-time.
            </p>
          </div>

          <div className="w-full lg:w-[400px] space-y-6">
            <div className="p-8 border border-white/5 bg-white/[0.01] backdrop-blur-3xl space-y-6 relative group">
              <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-white/20 uppercase">
                <span>System Pulse</span>
                <div className="flex gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-[#93d24a] animate-ping" />
                    <div className="w-1 h-1 rounded-full bg-[#93d24a]" />
                </div>
              </div>
              <div className="text-xs font-mono text-[#d8c3a5] tracking-tight h-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={streamIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                  >
                    {STREAMS[streamIndex]}
                  </motion.div>
                </AnimatePresence>
              </div>
              <Button 
                onClick={() => triggerSurfaceSync("manual")}
                disabled={isSyncing}
                className="w-full bg-[#f4efe6] text-black font-black text-[11px] uppercase tracking-[0.4em] h-14 rounded-none hover:bg-white transition-all shadow-[0_0_40px_rgba(244,239,230,0.1)]"
              >
                {isSyncing ? "SYNCING..." : "SYNC_SURFACE"}
              </Button>
            </div>
          </div>
        </header>

        {/* Cinematic Briefing: Selection Synced Video */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-16 items-start">
          <div className="xl:col-span-8 space-y-10">
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase italic">// Agent Recap Video</div>
                    <h2 className="text-4xl font-display font-black tracking-tight uppercase font-outfit">Visual Briefing</h2>
                </div>
                <div className="text-right text-[10px] font-mono text-white/20 uppercase tracking-widest">
                    Selection: <span className="text-[#93d24a]">${selectedEvent?.ticker || "---"}</span>
                </div>
            </div>
            
            <div className="aspect-video w-full bg-black border border-white/5 shadow-2xl relative group overflow-hidden">
                <Player
                    component={FinsComposition}
                    durationInFrames={180}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={30}
                    controls
                    autoPlay
                    loop
                    inputProps={{
                        title: selectedEvent?.title || "Neutral Market Context",
                        summary: selectedSignal?.causal_summary || "Analyzing the latest disclosure events for material narrative shifts and risk evolution.",
                        ticker: selectedEvent?.ticker || "ACE",
                        sentiment: selectedSignal?.directional_sentiment || "neutral",
                        confidence: selectedSignal?.confidence || 0.85,
                        agents: ["FilingStructurer", "RiskEvaluator", "SentimentAnalyst"]
                    }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
          </div>

          {/* Selection Detail: Agents Perspective */}
          <div className="xl:col-span-4 space-y-12 h-full">
            <div className="space-y-8">
                <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase italic border-b border-white/[0.03] pb-4">Agent_Perspective_Detail</div>
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
                                <span className="text-[11px] font-mono text-[#93d24a] uppercase tracking-widest">{agent}</span>
                                <div className="w-1 h-1 rounded-full bg-[#93d24a]" />
                            </div>
                            <p className="text-sm font-light text-white/50 leading-relaxed font-cormorant italic">
                                "{selectedSignal?.comparative_context?.[agent] as string || comment}"
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>

            <div className="p-8 border border-white/5 bg-white/[0.02] space-y-6">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Policy Outcome</div>
                <div className="space-y-2">
                    <div className="text-3xl font-display font-black text-white uppercase font-outfit">
                        {selectedDecision?.action.replace(/_/g, ' ') || "Hold Baseline"}
                    </div>
                    <p className="text-xs text-white/30 leading-relaxed uppercase tracking-tighter">
                        {selectedDecision?.causal_explanation?.primary_driver as string || "Filing normalized for historical comparison. Standing by for additional confirmation layers."}
                    </p>
                </div>
            </div>
          </div>
        </section>

        {/* Detailed Disclosure Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Watchlist: High Detail */}
          <div className="lg:col-span-4 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Strategic_Watchlist</div>
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-white/5">
              {data?.companies?.map((company, i) => (
                <div 
                    key={company.id}
                    onClick={() => setSelectedEventId(data.disclosureEvents.find(e => e.ticker === company.ticker)?.id || null)}
                    className={`p-6 border transition-all cursor-pointer group space-y-6 ${
                        selectedEvent?.ticker === company.ticker ? "border-[#93d24a]/30 bg-[#93d24a]/5" : "border-white/5 bg-white/[0.01] hover:border-white/10"
                    }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-3xl font-display font-black tracking-tight uppercase font-outfit text-white group-hover:text-[#93d24a] transition-colors">{company.ticker}</h3>
                      <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{company.company_name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-white/20 uppercase mb-1">Conviction</div>
                      <div className="text-2xl font-display font-bold text-white tracking-tighter">
                        {80 - i}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Signal Pulse</div>
                          <div className="text-[11px] font-bold text-[#d8c3a5] uppercase">Normalized</div>
                      </div>
                      <div className="space-y-1 text-right">
                          <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest italic">Risk Level</div>
                          <div className="text-[11px] font-bold text-white/60 uppercase">Stable</div>
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

          {/* Event Feed: Detailed Agents Insight */}
          <div className="lg:col-span-8 space-y-10">
            <div className="text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6 italic">Detailed_Event_Stream</div>
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
                            <span className="text-[11px] font-mono px-4 py-1.5 bg-white/5 border border-white/10 text-white tracking-[0.2em] uppercase">
                                {event.filing_type}
                            </span>
                            <span className="text-[11px] font-mono text-white/20 uppercase tracking-widest">
                                {new Date(event.event_timestamp).toLocaleTimeString()}
                            </span>
                            </div>
                            <div className={`text-[11px] font-mono uppercase tracking-[0.2em] flex items-center gap-2 ${
                                signal?.directional_sentiment === "positive" ? "text-[#93d24a]" : signal?.directional_sentiment === "negative" ? "text-[#ff8362]" : "text-[#d8c3a5]"
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${
                                signal?.directional_sentiment === "positive" ? "bg-[#93d24a] shadow-[0_0_8px_#93d24a]" : signal?.directional_sentiment === "negative" ? "bg-[#ff8362] shadow-[0_0_8px_#ff8362]" : "bg-[#d8c3a5]"
                            }`} />
                            Sentiment: {signal?.directional_sentiment || "Neutral"}
                            </div>
                        </div>
                        
                        <div className="space-y-4 relative z-10 mb-10">
                            <h3 className="text-4xl font-display font-black tracking-tight text-white uppercase font-outfit">
                                {event.ticker}: {event.title || "Disclosure Intelligence Hub"}
                            </h3>
                            <p className="text-xl text-white/40 leading-relaxed font-cormorant italic max-w-5xl">
                                "{signal?.causal_summary || "Automated agent segmentation is currently normalizing this filing against prior guidance. Identifying structural changes in risk disclosure and forward-looking sentiment."}"
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pt-10 border-t border-white/[0.05] relative z-10">
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">Agent Insight</div>
                                <div className="text-xs font-bold text-white/70 uppercase leading-relaxed tracking-tight">
                                    {signal?.comparative_context?.primary_finding as string || "Detected non-material variance in operational hedging language."}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">Causal Effect</div>
                                <div className="text-xs font-bold text-[#d8c3a5] uppercase leading-relaxed tracking-tight">
                                    {signal?.comparative_context?.impact_reasoning as string || "Neutral impact on immediate portfolio posture."}
                                </div>
                            </div>
                            <div className="space-y-2 text-right">
                                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">System Confidence</div>
                                <div className="text-2xl font-display font-black text-white">{(signal?.confidence || 0.81).toFixed(2)}</div>
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
        <div className="flex items-center gap-12 text-[11px] font-mono tracking-[0.4em] text-white/20 uppercase w-full italic">
          <div className="flex items-center gap-4 text-[#93d24a]">
            <div className="w-2 h-2 rounded-full bg-[#93d24a] shadow-[0_0_10px_#93d24a]" />
            FINS_OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span>Real-time Neural Sync Active</span>
          <div className="ml-auto flex items-center gap-8 text-white/10">
            <span>ACE_PROTOCOL_V2.4</span>
            <div className="h-4 w-px bg-white/5" />
            <span>ENCRYPTED_SESSION_STABLE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
