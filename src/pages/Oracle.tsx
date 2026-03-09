import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Database, Wifi, Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import RegimeDashboard from "@/components/RegimeDashboard";
import SwarmMindsetControls from "@/components/SwarmMindsetControls";
import { toast } from "sonner";

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

function sentimentColor(score: number | null): string {
  if (score === null) return "text-white/40";
  if (score >= 0.4) return "text-[#93d24a]";
  if (score >= 0.15) return "text-[#b8d86a]";
  if (score > -0.15) return "text-[#d8c3a5]";
  if (score > -0.4) return "text-[#e89b6a]";
  return "text-[#ff6b4a]";
}

function sentimentBg(score: number | null): string {
  if (score === null) return "bg-white/5";
  if (score >= 0.4) return "bg-[#93d24a]/8";
  if (score >= 0.15) return "bg-[#93d24a]/5";
  if (score > -0.15) return "bg-white/3";
  if (score > -0.4) return "bg-[#ff8362]/5";
  return "bg-[#ff6b4a]/8";
}

function sentimentBorder(score: number | null): string {
  if (score === null) return "border-white/8";
  if (score >= 0.4) return "border-[#93d24a]/25";
  if (score >= 0.15) return "border-[#93d24a]/15";
  if (score > -0.15) return "border-white/10";
  if (score > -0.4) return "border-[#ff8362]/15";
  return "border-[#ff6b4a]/25";
}

function SentimentIcon({ score }: { score: number | null }) {
  if (score === null) return <Minus className="w-3 h-3 text-white/30" />;
  if (score >= 0.15) return <TrendingUp className="w-3.5 h-3.5" />;
  if (score <= -0.15) return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3 h-3" />;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Oracle() {
  const [logStream, setLogStream] = useState<string[]>([]);
  const [subagents, setSubagents] = useState<any[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScanInfo, setLastScanInfo] = useState<{ method: string; count: number; overall: number } | null>(null);

  const activeCount = subagents.filter((agent) => agent.status === "active").length;
  const idleCount = subagents.filter((agent) => agent.status === "idle").length;
  const errorCount = subagents.filter((agent) => agent.status === "error").length;

  const fetchNews = useCallback(async () => {
    const { data } = await supabase
      .from("news_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNewsArticles(data as unknown as NewsArticle[]);
  }, []);

  const triggerSentimentScan = useCallback(async () => {
    setIsRefreshing(true);
    toast.info("Swarm Sentiment Analyst scanning...");
    try {
      const { data, error } = await supabase.functions.invoke("sentiment-analyst");
      if (error) throw error;
      const result = data as any;
      setLastScanInfo({
        method: result?.scoring_method || "unknown",
        count: result?.articles_persisted || 0,
        overall: result?.sentiment?.overall_score || 0,
      });
      toast.success(
        `Scan complete: ${result?.articles_persisted || 0} articles scored via ${result?.scoring_method || "unknown"}`
      );
      // Re-fetch articles
      await fetchNews();
    } catch (e: any) {
      console.error("Sentiment scan error:", e);
      toast.error(`Scan failed: ${e.message || "Unknown error"}`);
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

    // Fetch subagent states
    const fetchSubagents = async () => {
      const { data } = await supabase
        .from("agent_state")
        .select("*")
        .order("updated_at", { ascending: false });
      if (data) setSubagents(data);
    };

    fetchSubagents();
    fetchNews();

    const subSub = supabase
      .channel("subagent_updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_state" }, () => {
        fetchSubagents();
      })
      .subscribe();

    // Real-time news subscription
    const newsSub = supabase
      .channel("news_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_articles" }, () => {
        fetchNews();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(subSub);
      supabase.removeChannel(newsSub);
    };
  }, [fetchNews]);

  // Compute aggregate stats from loaded articles
  const bullishCount = newsArticles.filter((a) => (a.sentiment_hint ?? 0) >= 0.15).length;
  const bearishCount = newsArticles.filter((a) => (a.sentiment_hint ?? 0) <= -0.15).length;
  const neutralCount = newsArticles.length - bullishCount - bearishCount;
  const avgSentiment =
    newsArticles.length > 0
      ? newsArticles.reduce((sum, a) => sum + (a.sentiment_hint ?? 0), 0) / newsArticles.length
      : 0;

  return (
    <div className="min-h-screen bg-[#101312] text-[#f4efe6] overflow-x-hidden relative">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(206,172,114,0.1),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(107,138,177,0.14),transparent_24%),linear-gradient(180deg,#101312_0%,#0b0d0d_100%)]" />
      <main className="pt-32 pb-20 relative z-10 px-6">
        <div className="mx-auto max-w-[92rem]">
          {/* Top Row: Mission Status & Neural Stream */}
          <div className="border-t border-white/10 pt-6 mb-14">
            <div className="grid grid-cols-1 xl:grid-cols-[0.7fr_0.3fr] gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/34 mb-4">Oracle</div>
                <h1 className="text-5xl md:text-7xl font-display tracking-[-0.05em] leading-[0.92] mb-4">
                  Team Command Deck
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-white/58">
                  Live command surface for the regime engine, adaptive roster, and captain-level coordination logic.
                </p>
              </div>
              <div className="border border-white/8 bg-black/10 p-5 flex flex-col justify-center">
                <div className="text-[10px] text-white/30 uppercase tracking-[0.24em] mb-3 flex items-center gap-2">
                  <Wifi className="w-3 h-3 text-[#93d24a]" /> Neural Stream
                </div>
                <div className="space-y-2">
                  {logStream.map((log, i) => (
                    <motion.div
                      key={`${log}-${i}`}
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1 - i * 0.25, x: 0 }}
                      className="text-[11px] tracking-[0.12em] text-[#9bb8d3]"
                    >
                      &gt; {log}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Dashboard Components */}
          <div className="grid grid-cols-1 gap-12">
            <SwarmMindsetControls />

            {/* ═══════════════════════════════════════════════════════ */}
            {/* LIVE NEWS FEED WITH AI SENTIMENT                       */}
            {/* ═══════════════════════════════════════════════════════ */}
            <section>
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <Newspaper className="w-5 h-5 text-[#9bb8d3]" />
                <h2 className="text-sm tracking-[0.24em] uppercase text-white/50">Live Intel Feed</h2>
                <div className="h-px flex-1 bg-white/8" />

                {/* Sentiment aggregate chips */}
                <span className="text-[10px] px-2 py-1 border border-[#93d24a]/30 text-[#93d24a] bg-[#93d24a]/8">
                  ↑ {bullishCount}
                </span>
                <span className="text-[10px] px-2 py-1 border border-white/10 text-white/50">
                  — {neutralCount}
                </span>
                <span className="text-[10px] px-2 py-1 border border-[#ff8362]/30 text-[#ff8362] bg-[#ff8362]/10">
                  ↓ {bearishCount}
                </span>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={triggerSentimentScan}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-3 py-1.5 border border-[#9bb8d3]/30 bg-[#9bb8d3]/8 text-[#9bb8d3] text-[10px] uppercase tracking-[0.2em] hover:bg-[#9bb8d3]/15 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Scanning..." : "Scan Now"}
                </motion.button>
              </div>

              {/* Sentiment Gauge Bar */}
              <div className="mb-6 border border-white/8 bg-black/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#d8c3a5]" />
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/40">
                      Swarm Sentiment Pulse
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-display ${sentimentColor(avgSentiment)}`}>
                      {avgSentiment >= 0 ? "+" : ""}
                      {avgSentiment.toFixed(3)}
                    </span>
                    {lastScanInfo && (
                      <span className="text-[9px] text-white/25 tracking-wider">
                        via {lastScanInfo.method}
                      </span>
                    )}
                  </div>
                </div>
                {/* Gradient bar */}
                <div className="relative h-2 bg-gradient-to-r from-[#ff6b4a] via-[#d8c3a5] to-[#93d24a] rounded-full overflow-hidden">
                  <motion.div
                    className="absolute top-0 w-1 h-full bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                    animate={{ left: `${((avgSentiment + 1) / 2) * 100}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[8px] text-white/20 uppercase tracking-widest">
                  <span>Extreme Bear</span>
                  <span>Neutral</span>
                  <span>Extreme Bull</span>
                </div>
              </div>

              {/* News Grid */}
              {newsArticles.length === 0 ? (
                <div className="border border-white/8 bg-black/10 p-12 text-center">
                  <Newspaper className="w-8 h-8 text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/30 mb-4">No articles yet. Trigger a scan to populate the feed.</p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={triggerSentimentScan}
                    disabled={isRefreshing}
                    className="px-4 py-2 border border-[#d8c3a5]/30 bg-[#d8c3a5]/8 text-[#d8c3a5] text-xs uppercase tracking-[0.2em] hover:bg-[#d8c3a5]/15 transition-colors"
                  >
                    Initialize Swarm Scan
                  </motion.button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {newsArticles.map((article, idx) => (
                      <motion.div
                        key={article.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ delay: idx * 0.02, duration: 0.3 }}
                        className={`group relative p-4 border ${sentimentBorder(article.sentiment_hint)} ${sentimentBg(article.sentiment_hint)} hover:bg-white/[0.04] transition-all cursor-default`}
                      >
                        {/* Sentiment edge glow */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-[2px] ${
                            (article.sentiment_hint ?? 0) >= 0.15
                              ? "bg-[#93d24a]"
                              : (article.sentiment_hint ?? 0) <= -0.15
                              ? "bg-[#ff6b4a]"
                              : "bg-white/10"
                          }`}
                        />

                        <div className="flex items-start gap-3 pl-2">
                          <div className={`mt-0.5 ${sentimentColor(article.sentiment_hint)}`}>
                            <SentimentIcon score={article.sentiment_hint} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[9px] px-1.5 py-0.5 border border-white/10 text-white/35 uppercase tracking-wider">
                                {article.source}
                              </span>
                              {article.symbols && (article.symbols as unknown as string[]).length > 0 && (
                                (article.symbols as unknown as string[]).slice(0, 3).map((sym) => (
                                  <span
                                    key={sym}
                                    className="text-[9px] px-1.5 py-0.5 border border-[#9bb8d3]/20 text-[#9bb8d3] bg-[#9bb8d3]/5 font-mono"
                                  >
                                    ${sym}
                                  </span>
                                ))
                              )}
                              <span className="text-[9px] text-white/20 ml-auto whitespace-nowrap">
                                {timeAgo(article.published_at || article.created_at)}
                              </span>
                            </div>

                            {article.url ? (
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm leading-snug text-white/80 group-hover:text-white transition-colors line-clamp-2 hover:underline"
                              >
                                {article.title}
                              </a>
                            ) : (
                              <p className="text-sm leading-snug text-white/80 group-hover:text-white transition-colors line-clamp-2">
                                {article.title}
                              </p>
                            )}

                            {article.summary && (
                              <p className="text-[11px] text-white/30 mt-1 line-clamp-1">{article.summary}</p>
                            )}

                            <div className="flex items-center gap-3 mt-2">
                              <span
                                className={`text-[10px] font-mono ${sentimentColor(article.sentiment_hint)}`}
                              >
                                {article.sentiment_hint !== null
                                  ? `${article.sentiment_hint >= 0 ? "+" : ""}${article.sentiment_hint.toFixed(2)}`
                                  : "N/A"}
                              </span>
                              {article.payload?.scored_by && (
                                <span className="text-[8px] text-white/15 uppercase tracking-wider">
                                  {article.payload.scored_by}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* Subagent Status Matrix */}
            <section>
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <Database className="w-5 h-5 text-[#d8c3a5]" />
                <h2 className="text-sm tracking-[0.24em] uppercase text-white/50">Core Team Pods</h2>
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-[10px] px-2 py-1 border border-[#93d24a]/30 text-[#93d24a] bg-[#93d24a]/8">
                  Active {activeCount}
                </span>
                <span className="text-[10px] px-2 py-1 border border-white/10 text-white/50">
                  Idle {idleCount}
                </span>
                <span className="text-[10px] px-2 py-1 border border-[#ff8362]/30 text-[#ff8362] bg-[#ff8362]/10">
                  Error {errorCount}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {subagents.map((agent) => (
                  <SubagentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>

            {/* Dynamic team lifecycle dashboard */}
            <RegimeDashboard />
          </div>
        </div>
      </main>

      {/* Micro-monologue Stream - Bottom Fixed */}
      <div className="fixed bottom-0 left-0 right-0 h-10 border-t border-white/8 bg-[#0c0f0f]/80 backdrop-blur-xl z-40 flex items-center px-6 overflow-hidden">
        <div className="flex items-center gap-6 text-[9px] text-white/30 w-full uppercase tracking-[0.24em]">
          <span className="flex items-center gap-2 text-[#d8c3a5]">
            <div className="w-1 h-1 rounded-full bg-[#93d24a] animate-pulse" />
            NODE_ACE_01: ONLINE
          </span>
          <span className="hidden md:flex items-center gap-2">
            <div className="w-1.5 h-px bg-white/20" />
            TEAMLINK: PERSISTENT
          </span>
          <span className="ml-auto text-white/20 tracking-[0.3em]">SECURE SECTOR 7-G</span>
        </div>
      </div>
    </div>
  );
}

function SubagentCard({ agent }: { agent: any }) {
  const isError = agent.status === "error";
  const isActive = agent.status === "active";

  return (
    <motion.div
      whileHover={{ y: -4, backgroundColor: "rgba(255,255,255,0.03)" }}
      className="p-5 border border-white/8 bg-black/10 transition-all relative group overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
        <Brain className="w-12 h-12" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono text-white/40 tracking-wider">0x{agent.id.slice(0, 4)}</span>
        <div
          className={`px-2 py-0.5 text-[8px] uppercase border ${
            isError
              ? "bg-[#ff8362]/10 text-[#ff8362] border-[#ff8362]/30"
              : isActive
              ? "bg-[#93d24a]/10 text-[#93d24a] border-[#93d24a]/30"
              : "bg-[#9bb8d3]/10 text-[#9bb8d3] border-[#9bb8d3]/30"
          }`}
        >
          {agent.status}
        </div>
      </div>

      <h3 className="text-lg font-display text-white mb-1 group-hover:text-[#d8c3a5] transition-colors">
        {agent.agent_name}
      </h3>
      <p className="text-[10px] text-white/30 italic mb-4 truncate">
        "{agent.last_action || "Synchronizing neural pathways..."}"
      </p>

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <div className="p-2 bg-black/30 border border-white/8">
          <div className="text-[8px] text-white/20 uppercase font-mono">Metric</div>
          <div className="text-xs font-bold text-[#d8c3a5]">{agent.metric_value || "0.00"}</div>
        </div>
        <div className="p-2 bg-black/30 border border-white/8 text-right">
          <div className="text-[8px] text-white/20 uppercase font-mono">Mission</div>
          <div className="text-[9px] font-mono text-white/60 truncate">{agent.metric_label || "Wait"}</div>
        </div>
      </div>
    </motion.div>
  );
}
