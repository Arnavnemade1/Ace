import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_WATCHLIST = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META"];

// Keyword-based sentiment scoring — NO AI calls to save API costs
const BULLISH_WORDS = new Set(["surge", "soar", "rally", "beat", "record", "upgrade", "growth", "profit", "boom", "strong", "gain", "rise", "jumps", "bullish", "outperform", "breakthrough", "buy", "positive", "optimistic", "expansion"]);
const BEARISH_WORDS = new Set(["crash", "plunge", "drop", "miss", "downgrade", "loss", "decline", "fall", "weak", "bearish", "selloff", "recession", "layoff", "warning", "cut", "negative", "risk", "fear", "concern", "investigation", "lawsuit", "war", "conflict"]);

function scoreSentiment(text: string): number {
  const words = text.toLowerCase().split(/\W+/);
  let score = 0;
  for (const w of words) {
    if (BULLISH_WORDS.has(w)) score += 0.15;
    if (BEARISH_WORDS.has(w)) score -= 0.15;
  }
  return Math.max(-1, Math.min(1, score));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Sentiment Analyst");

    const { data: scanState } = await supabase.from("agent_state").select("config").eq("agent_name", "Market Scanner").maybeSingle();
    const lastSymbols = (scanState?.config?.last_symbols || []) as string[];
    const symbols = lastSymbols.length > 0 ? lastSymbols.slice(0, 50) : FALLBACK_WATCHLIST;

    // Fetch news from ALL sources in parallel
    const newsFetchers: Promise<any[]>[] = [];

    // 1. Alpaca News (keyed)
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      newsFetchers.push(
        fetch(`https://data.alpaca.markets/v1beta1/news?symbols=${symbols.join(",")}&limit=25`, {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }).then(r => r.ok ? r.json().then(d => (d.news || []).map((n: any) => ({ headline: n.headline, summary: n.summary, symbols: n.symbols, source: "Alpaca" }))) : []).catch(() => [])
      );
    }

    // 2. Knowivate News API (keyless)
    newsFetchers.push(
      fetch("https://news.knowivate.com/api/latest").then(r => r.ok ? r.json() : []).then((articles: any) => {
        const arr = Array.isArray(articles) ? articles : articles?.articles || articles?.data || [];
        return arr.slice(0, 20).map((a: any) => ({ headline: a.title || a.headline || "", summary: a.description || a.summary || "", symbols: [], source: "Knowivate" }));
      }).catch(() => [])
    );

    // 3. Knowivate Business category
    newsFetchers.push(
      fetch("https://news.knowivate.com/api/business").then(r => r.ok ? r.json() : []).then((articles: any) => {
        const arr = Array.isArray(articles) ? articles : articles?.articles || articles?.data || [];
        return arr.slice(0, 15).map((a: any) => ({ headline: a.title || a.headline || "", summary: a.description || a.summary || "", symbols: [], source: "Knowivate-Biz" }));
      }).catch(() => [])
    );

    // 4. Saurav Tech News API (keyless) - business + general
    for (const cat of ["business", "general", "technology"]) {
      newsFetchers.push(
        fetch(`https://saurav.tech/NewsAPI/top-headlines/category/${cat}/us.json`).then(r => r.ok ? r.json() : { articles: [] }).then((d: any) => {
          return (d.articles || []).slice(0, 10).map((a: any) => {
            // Try to match symbols from headline text
            const matchedSymbols = symbols.filter(s => (a.title || "").toUpperCase().includes(s));
            return { headline: a.title || "", summary: a.description || "", symbols: matchedSymbols, source: `SauravNews-${cat}` };
          });
        }).catch(() => [])
      );
    }

    const allResults = await Promise.all(newsFetchers);
    const newsItems = allResults.flat().filter((n: any) => n.headline && n.headline.length > 5);

    // ALGORITHMIC sentiment scoring — no AI call, saves API costs
    const symbolScores: Record<string, { scores: number[], reasons: string[] }> = {};
    let overallSum = 0;
    let overallCount = 0;

    for (const news of newsItems) {
      const text = `${news.headline || ""} ${news.summary || ""}`;
      const score = scoreSentiment(text);
      overallSum += score;
      overallCount++;

      for (const sym of (news.symbols || [])) {
        if (!symbolScores[sym]) symbolScores[sym] = { scores: [], reasons: [] };
        symbolScores[sym].scores.push(score);
        symbolScores[sym].reasons.push(news.headline?.slice(0, 80) || "");
      }
    }

    const overallScore = overallCount > 0 ? overallSum / overallCount : 0;

    // Generate signals for strong sentiment
    const sentimentSignals = Object.entries(symbolScores)
      .map(([symbol, data]) => {
        const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        if (Math.abs(avg) < 0.3) return null;
        return {
          symbol,
          signal_type: avg > 0 ? "sentiment_bullish" : "sentiment_bearish",
          strength: Math.min(Math.abs(avg), 1),
          source_agent: "Sentiment Analyst",
          metadata: { sentiment_score: avg, reasoning: data.reasons.slice(0, 3).join("; "), news_count: data.scores.length },
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        };
      })
      .filter(Boolean);

    if (sentimentSignals.length > 0) {
      await supabase.from("signals").insert(sentimentSignals);
    }

    // Log to analytics
    await supabase.from("live_api_streams").insert({
      source: "SentimentAnalyst",
      symbol_or_context: "SENTIMENT_SCAN",
      payload: { overall_score: overallScore, signals_generated: sentimentSignals.length, news_analyzed: newsItems.length },
    });

    await supabase.from("agent_logs").insert({
      agent_name: "Sentiment Analyst",
      log_type: "info",
      message: `Analyzed ${newsItems.length} news items. Overall sentiment: ${overallScore.toFixed(2)}. Generated ${sentimentSignals.length} signals. [NO AI — keyword-based]`,
      metadata: { overall_score: overallScore, signal_count: sentimentSignals.length },
    });

    const bullishScore = ((overallScore + 1) / 2).toFixed(2);
    await supabase.from("agent_state").update({
      metric_value: bullishScore,
      metric_label: "bullish score",
      last_action: `Analyzed ${newsItems.length} news items`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Sentiment Analyst");

    return new Response(JSON.stringify({ success: true, sentiment: { overall_score: overallScore, symbol_sentiments: Object.entries(symbolScores).map(([s, d]) => ({ symbol: s, score: d.scores.reduce((a, b) => a + b, 0) / d.scores.length })) } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Sentiment Analyst error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
