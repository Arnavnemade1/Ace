import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import RegimeDashboard from "@/components/RegimeDashboard";
import SwarmMindsetControls from "@/components/SwarmMindsetControls";
import { toast } from "sonner";

/**
 * ORACLE: Team Command Deck
 * A high-fidelity control surface for the Ace neural collective.
 * Design language: Onyx, warm neutrals, zero icons, cinematic motion.
 */

const STREAMS = [
  "CAPTAIN_BOOTSTRAP_COMPLETE...",
  "TEAM_ROSTER_SYNCED...",
  "MISSION_PIPELINE_HEALTHY...",
  "RISK_LEAD_CASH_FLOOR_LOCKED...",
  "EXECUTION_HANDOFF_SIGNAL_READY...",
  "REGIME_SHIFT_WATCH_ACTIVE...",
  "SWARM_TEAM_RESONANCE_STABLE...",
];

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  sentiment_hint: number | null;
  symbols: string[];
  url: string | null;
  summary: string | null;
  published_at: string | null;
  created_at: string;
  payload: any;
}

const sentimentColor = (score: number | null) => {
  if (score === null) return "text-white/20";
  if (score >= 0.15) return "text-[#93d24a]";
  if (score <= -0.15) return "text-[#ff8362]";
  return "text-[#d8c3a5]";
};

const sentimentBorder = (score: number | null) => {
  if (score === null) return "border-white/5";
  if (score >= 0.15) return "border-[#93d24a]/20";
  if (score <= -0.15) return "border-[#ff8362]/20";
  return "border-white/10";
};

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
};

export default function Oracle() {
  const [logStream, setLogStream] = useState<string[]>([]);
  const [subagents, setSubagents] = useState<any[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"all" | "geopolitics" | "stocks">("all");
  const [visibleCount, setVisibleCount] = useState(10);

  const fetchNews = useCallback(async () => {
    const { data } = await supabase.from("news_articles").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) setNewsArticles(data as unknown as NewsArticle[]);
  }, []);

  const triggerSentimentScan = useCallback(async () => {
    setIsRefreshing(true);
    toast.info("SWARM_SENTIMENT_ANALYSIS_INITIALIZED...");
    try {
      await supabase.functions.invoke("sentiment-analyst");
      await fetchNews();
      toast.success("SWARM_SCAN_COMPLETE");
    } catch (e) {
      toast.error("SCAN_FAILED");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchNews]);

  useEffect(() => {
    window.scrollTo(0, 0);
    let currentIndex = 0;
    const interval = setInterval(() => {
      setLogStream((prev) => {
        const updated = [STREAMS[currentIndex], ...prev].slice(0, 4);
        currentIndex = (currentIndex + 1) % STREAMS.length;
        return updated;
      });
    }, 3000);

    const fetchSubagents = async () => {
      const { data } = await supabase.from("agent_state").select("*").order("updated_at", { ascending: false });
      if (data) setSubagents(data);
    };

    fetchSubagents();
    fetchNews();

    const subSub = supabase.channel("subagent_updates").on("postgres_changes", { event: "*", schema: "public", table: "agent_state" }, fetchSubagents).subscribe();
    const newsSub = supabase.channel("news_realtime").on("postgres_changes", { event: "INSERT", schema: "public", table: "news_articles" }, fetchNews).subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(subSub);
      supabase.removeChannel(newsSub);
    };
  }, [fetchNews]);

  const GEOPOLITICS_KEYWORDS = useMemo(() => /war|conflict|sanction|tariff|nato|china|russia|iran|israel|gaza|ukraine|taiwan|missile|nuclear|troops|military|defense|geopolit|sovereignty|embargo|oil|opec|treaty|alliance|invasion|border|diplomacy|summit|un\b|g7|g20|coup|election|regime/i, []);
  const STOCK_KEYWORDS = useMemo(() => /stock|share|market|bull|bear|rally|crash|earnings|revenue|profit|loss|ipo|nasdaq|s&p|dow|nyse|fed|interest rate|inflation|gdp|unemployment|trade|sector|etf|bond|yield|dividend|buyback|merger|acquisition|\$[A-Z]{1,5}\b/i, []);

  const filteredArticles = useMemo(() => {
    if (feedFilter === "all") return newsArticles;
    if (feedFilter === "geopolitics") return newsArticles.filter(a => GEOPOLITICS_KEYWORDS.test(`${a.title} ${a.summary || ""}`));
    return newsArticles.filter(a => STOCK_KEYWORDS.test(`${a.title} ${a.summary || ""}`) || ((a.symbols as unknown as string[]) || []).length > 0);
  }, [newsArticles, feedFilter, GEOPOLITICS_KEYWORDS, STOCK_KEYWORDS]);

  const avgSentiment = filteredArticles.length > 0 ? filteredArticles.reduce((sum, a) => sum + (a.sentiment_hint ?? 0), 0) / filteredArticles.length : 0;

  return (
    <div className="min-h-screen bg-[#020202] text-[#f4efe6] font-body selection:bg-[#d8c3a5]/30">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_rgba(216,195,165,0.05),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(147,210,74,0.03),_transparent_40%)]" />
      </div>

      <main className="pt-32 pb-24 relative z-10 px-10 max-w-[1400px] mx-auto">
        <header className="border-b border-white/[0.03] pb-12 mb-12 flex flex-col md:flex-row justify-between items-end gap-10">
          <div className="space-y-4">
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold">// Strategic Oracle</div>
            <h1 className="text-6xl md:text-8xl font-display font-black tracking-[-0.05em] leading-[0.85]">
              Team Command <br /> <span className="text-white/20">Deck.</span>
            </h1>
          </div>
          <div className="w-full md:w-80 border border-white/5 bg-white/[0.01] p-6 space-y-4">
            <div className="flex items-center justify-between text-[9px] font-mono tracking-widest text-white/20 uppercase">
              <span>Neural Stream</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] animate-pulse" />
            </div>
            <div className="space-y-1.5">
              {logStream.map((log, i) => (
                <div key={i} className="text-[10px] font-mono text-[#d8c3a5] tracking-tight opacity-40 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden">
                  &gt; {log}
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-20">
          <SwarmMindsetControls />

          {/* Intelligence Pulse */}
          <section className="space-y-10">
            <div className="flex items-end justify-between border-b border-white/[0.03] pb-6">
              <div className="space-y-1">
                <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase">Market Intelligence</div>
                <h2 className="text-3xl font-display font-black tracking-tighter uppercase">Live Intel Feed</h2>
              </div>
              <div className="flex gap-4">
                {(["all", "geopolitics", "stocks"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setFeedFilter(tab); setVisibleCount(10); }}
                    className={`px-4 py-2 text-[9px] font-mono tracking-[0.2em] uppercase border transition-all ${
                      feedFilter === tab ? "border-[#d8c3a5] bg-[#d8c3a5] text-black" : "border-white/10 text-white/30 hover:border-white/20"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Sentiment Gauge */}
              <div className="lg:col-span-4 border border-white/5 bg-white/[0.01] p-8 space-y-8 flex flex-col justify-center">
                <div className="space-y-2">
                  <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase italic">// Swarm Sentiment</div>
                  <div className={`text-6xl font-display font-black tracking-tighter ${sentimentColor(avgSentiment)}`}>
                    {avgSentiment >= 0 ? "+" : ""}{avgSentiment.toFixed(3)}
                  </div>
                </div>
                <div className="h-1 w-full bg-white/5 relative overflow-hidden">
                  <motion.div 
                    animate={{ left: `${((avgSentiment + 1) / 2) * 100}%` }}
                    className="absolute top-0 w-1 h-full bg-white shadow-[0_0_10px_white]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ff8362] via-white/5 to-[#93d24a] opacity-30" />
                </div>
                <button 
                  onClick={triggerSentimentScan}
                  disabled={isRefreshing}
                  className="w-full py-4 border border-[#d8c3a5]/20 text-[10px] font-mono tracking-[0.3em] uppercase hover:bg-white/5 transition-all disabled:opacity-20"
                >
                  {isRefreshing ? "ANALYZING_SWARM..." : "TRIGGER_SCAN"}
                </button>
              </div>

              {/* Articles Grid */}
              <div className="lg:col-span-8 space-y-4 max-h-[600px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-white/5">
                {filteredArticles.slice(0, visibleCount).map((article, i) => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`p-6 border ${sentimentBorder(article.sentiment_hint)} bg-white/[0.01] hover:bg-white/[0.02] transition-all group`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-3">
                        <span className="text-[9px] font-mono px-2 py-1 border border-white/10 text-white/30 uppercase tracking-widest">{article.source}</span>
                        {article.symbols && (article.symbols as unknown as string[]).slice(0, 2).map(s => (
                          <span key={s} className="text-[9px] font-mono px-2 py-1 bg-[#d8c3a5]/10 text-[#d8c3a5] tracking-widest">${s}</span>
                        ))}
                      </div>
                      <span className="text-[9px] font-mono text-white/10 uppercase tracking-widest">{timeAgo(article.published_at || article.created_at)}</span>
                    </div>
                    <a href={article.url || "#"} target="_blank" className="text-lg font-display font-bold tracking-tight text-white/80 group-hover:text-white transition-colors block mb-2">{article.title}</a>
                    <div className="flex items-center gap-4">
                      <span className={`text-[10px] font-mono font-bold ${sentimentColor(article.sentiment_hint)}`}>
                        {article.sentiment_hint !== null ? `${article.sentiment_hint >= 0 ? "+" : ""}${article.sentiment_hint.toFixed(2)}` : "NA"}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.03]" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Subagent Status */}
          <section className="space-y-10">
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase border-b border-white/[0.03] pb-6">Core Team Pods</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {subagents.map((agent, i) => (
                <div key={agent.id} className="p-8 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all space-y-8">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-mono text-white/10 tracking-[0.3em] uppercase">Node_0{i+1}</span>
                    <div className={`text-[8px] font-mono px-2 py-1 border uppercase tracking-widest ${
                      agent.status === 'active' ? 'border-[#93d24a]/30 text-[#93d24a]' : agent.status === 'error' ? 'border-[#ff8362]/30 text-[#ff8362]' : 'border-white/10 text-white/30'
                    }`}>{agent.status}</div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-display font-black tracking-tighter uppercase">{agent.agent_name}</h3>
                    <p className="text-[10px] text-white/30 leading-relaxed font-light tracking-wide uppercase truncate">"{agent.last_action || "SYNCING..."}"</p>
                  </div>
                  <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-[8px] font-mono text-white/10 uppercase tracking-widest">Metric</div>
                      <div className="text-lg font-mono font-bold text-[#d8c3a5] tracking-tight">{agent.metric_value || "0.00"}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="text-[8px] font-mono text-white/10 uppercase tracking-widest">Mission</div>
                      <div className="text-[9px] font-mono text-white/40 tracking-widest uppercase truncate">{agent.metric_label || "WAIT"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <RegimeDashboard />
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-12 bg-[#020202]/80 backdrop-blur-xl border-t border-white/[0.03] flex items-center px-10 z-50">
        <div className="flex items-center gap-10 w-full text-[9px] font-mono tracking-[0.3em] text-white/20 uppercase">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#93d24a] shadow-[0_0_8px_#93d24a]" />
            <span className="text-white/60">NODE_ACE_ONLINE</span>
          </div>
          <div className="hidden md:block h-3 w-px bg-white/10" />
          <span className="hidden md:block">Persistent Link: Stable</span>
          <span className="ml-auto italic opacity-50">ACE_ORACLE_V2.4</span>
        </div>
      </footer>
    </div>
  );
}
