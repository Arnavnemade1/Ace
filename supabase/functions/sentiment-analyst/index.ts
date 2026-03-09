import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_WATCHLIST = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META"];

// Keyword-based fast scoring as a FALLBACK
const BULLISH_WORDS = new Set(["surge", "soar", "rally", "beat", "record", "upgrade", "growth", "profit", "boom", "strong", "gain", "rise", "jumps", "bullish", "outperform", "breakthrough", "buy", "positive", "optimistic", "expansion"]);
const BEARISH_WORDS = new Set(["crash", "plunge", "drop", "miss", "downgrade", "loss", "decline", "fall", "weak", "bearish", "selloff", "recession", "layoff", "warning", "cut", "negative", "risk", "fear", "concern", "investigation", "lawsuit", "war", "conflict"]);

function keywordScore(text: string): number {
  const words = text.toLowerCase().split(/\W+/);
  let score = 0;
  for (const w of words) {
    if (BULLISH_WORDS.has(w)) score += 0.15;
    if (BEARISH_WORDS.has(w)) score -= 0.15;
  }
  return Math.max(-1, Math.min(1, score));
}

// AI-powered batch sentiment analysis via Gemini direct API
async function aiSentimentBatch(
  headlines: { headline: string; source: string }[],
  apiKey: string
): Promise<Record<number, number>> {
  const scores: Record<number, number> = {};
  if (!headlines.length) return scores;

  const batch = headlines.slice(0, 25);
  const numberedList = batch.map((h, i) => `${i + 1}. [${h.source}] ${h.headline}`).join("\n");

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `You are a financial sentiment analysis engine for an autonomous trading swarm. Score each headline from -1.0 (extremely bearish) to +1.0 (extremely bullish). Consider market impact, not just tone. Respond ONLY with a JSON object mapping headline number to score. Example: {"1": 0.7, "2": -0.3, "3": 0.0}\n\nScore these market headlines:\n${numberedList}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) {
      console.error("Gemini sentiment failed:", res.status, await res.text());
      return scores;
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (content) {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      for (const [key, val] of Object.entries(parsed)) {
        const idx = parseInt(key, 10) - 1;
        if (!isNaN(idx) && typeof val === "number") {
          scores[idx] = Math.max(-1, Math.min(1, val));
        }
      }
    }
  } catch (e) {
    console.error("AI sentiment batch error:", e);
  }

  return scores;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Sentiment Analyst");

    const { data: scanState } = await supabase.from("agent_state").select("config").eq("agent_name", "Market Scanner").maybeSingle();
    const lastSymbols = (scanState?.config?.last_symbols || []) as string[];
    const symbols = lastSymbols.length > 0 ? lastSymbols.slice(0, 50) : FALLBACK_WATCHLIST;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Fetch news from ALL sources in parallel
    // ═══════════════════════════════════════════════════════
    const newsFetchers: Promise<any[]>[] = [];

    // 1. Alpaca News (keyed)
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      newsFetchers.push(
        fetch(`https://data.alpaca.markets/v1beta1/news?symbols=${symbols.join(",")}&limit=25`, {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }).then(r => r.ok ? r.json().then(d => (d.news || []).map((n: any) => ({
          headline: n.headline, summary: n.summary, symbols: n.symbols || [],
          source: "Alpaca", url: n.url || null, published_at: n.created_at || null,
          external_id: `alpaca-${n.id || n.headline?.slice(0, 30)}`,
        }))) : []).catch(() => [])
      );
    }

    // 2. Knowivate News API (keyless)
    newsFetchers.push(
      fetch("https://news.knowivate.com/api/latest").then(r => r.ok ? r.json() : []).then((articles: any) => {
        const arr = Array.isArray(articles) ? articles : articles?.articles || articles?.data || [];
        return arr.slice(0, 20).map((a: any) => ({
          headline: a.title || a.headline || "", summary: a.description || a.summary || "",
          symbols: [], source: "Knowivate", url: a.url || a.link || null,
          published_at: a.publishedAt || a.published_at || null,
          external_id: `knowivate-${(a.title || "").slice(0, 40)}`,
        }));
      }).catch(() => [])
    );

    // 3. Knowivate Business
    newsFetchers.push(
      fetch("https://news.knowivate.com/api/business").then(r => r.ok ? r.json() : []).then((articles: any) => {
        const arr = Array.isArray(articles) ? articles : articles?.articles || articles?.data || [];
        return arr.slice(0, 15).map((a: any) => ({
          headline: a.title || a.headline || "", summary: a.description || a.summary || "",
          symbols: [], source: "Knowivate-Biz", url: a.url || a.link || null,
          published_at: a.publishedAt || a.published_at || null,
          external_id: `knowbiz-${(a.title || "").slice(0, 40)}`,
        }));
      }).catch(() => [])
    );

    // 4. Knowivate Geopolitics / World news
    newsFetchers.push(
      fetch("https://news.knowivate.com/api/technologies").then(r => r.ok ? r.json() : []).then((articles: any) => {
        const arr = Array.isArray(articles) ? articles : articles?.articles || articles?.data || [];
        return arr.slice(0, 10).map((a: any) => ({
          headline: a.title || a.headline || "", summary: a.description || a.summary || "",
          symbols: [], source: "Knowivate-Tech", url: a.url || a.link || null,
          published_at: a.publishedAt || a.published_at || null,
          external_id: `knowtech-${(a.title || "").slice(0, 40)}`,
        }));
      }).catch(() => [])
    );

    // 5. Saurav — science (geopolitical/macro overlap) + health (pandemic risk)
    for (const cat of ["business", "general", "technology", "science", "health"]) {
      newsFetchers.push(
        fetch(`https://saurav.tech/NewsAPI/top-headlines/category/${cat}/us.json`).then(r => r.ok ? r.json() : { articles: [] }).then((d: any) => {
          return (d.articles || []).slice(0, 10).map((a: any) => {
            const matchedSymbols = symbols.filter(s => (a.title || "").toUpperCase().includes(s));
            return {
              headline: a.title || "", summary: a.description || "",
              symbols: matchedSymbols, source: `Saurav-${cat}`, url: a.url || null,
              published_at: a.publishedAt || null,
              external_id: `saurav-${cat}-${(a.title || "").slice(0, 40)}`,
            };
          });
        }).catch(() => [])
      );
    }

    const allResults = await Promise.all(newsFetchers);
    const newsItems = allResults.flat().filter((n: any) => n.headline && n.headline.length > 5);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: AI-powered sentiment scoring via the swarm
    // ═══════════════════════════════════════════════════════
    let useAI = !!LOVABLE_API_KEY;
    let aiScores: Record<number, number> = {};

    if (useAI) {
      aiScores = await aiSentimentBatch(
        newsItems.map(n => ({ headline: n.headline, source: n.source })),
        LOVABLE_API_KEY!
      );
      // If AI returned nothing, fall back to keyword
      if (Object.keys(aiScores).length === 0) useAI = false;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: Score, persist to news_articles, generate signals
    // ═══════════════════════════════════════════════════════
    const symbolScores: Record<string, { scores: number[]; reasons: string[] }> = {};
    let overallSum = 0;
    let overallCount = 0;
    const articlesToInsert: any[] = [];

    for (let i = 0; i < newsItems.length; i++) {
      const news = newsItems[i];
      const text = `${news.headline} ${news.summary || ""}`;

      // Use AI score if available, else keyword fallback
      const score = aiScores[i] !== undefined ? aiScores[i] : keywordScore(text);
      overallSum += score;
      overallCount++;

      for (const sym of (news.symbols || [])) {
        if (!symbolScores[sym]) symbolScores[sym] = { scores: [], reasons: [] };
        symbolScores[sym].scores.push(score);
        symbolScores[sym].reasons.push(news.headline.slice(0, 80));
      }

      // Build news_articles row
      articlesToInsert.push({
        title: news.headline.slice(0, 500),
        source: news.source,
        external_id: news.external_id || `auto-${Date.now()}-${i}`,
        url: news.url,
        summary: (news.summary || "").slice(0, 1000),
        sentiment_hint: score,
        symbols: news.symbols || [],
        keywords: [],
        published_at: news.published_at || new Date().toISOString(),
        payload: { scored_by: useAI ? "ai-swarm" : "keyword-engine", source_api: news.source },
      });
    }

    // Upsert articles (ignore duplicates by external_id)
    if (articlesToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("news_articles")
        .upsert(articlesToInsert, { onConflict: "external_id", ignoreDuplicates: true });
      if (insertErr) console.error("news_articles upsert error:", insertErr.message);
    }

    const overallScore = overallCount > 0 ? overallSum / overallCount : 0;

    // Generate signals for strong sentiment
    const sentimentSignals = Object.entries(symbolScores)
      .map(([symbol, data]) => {
        const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        if (Math.abs(avg) < 0.25) return null;
        return {
          symbol,
          signal_type: avg > 0 ? "sentiment_bullish" : "sentiment_bearish",
          strength: Math.min(Math.abs(avg), 1),
          source_agent: "Sentiment Analyst",
          metadata: {
            sentiment_score: avg,
            reasoning: data.reasons.slice(0, 3).join("; "),
            news_count: data.scores.length,
            scored_by: useAI ? "ai-swarm" : "keyword",
          },
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        };
      })
      .filter(Boolean);

    if (sentimentSignals.length > 0) {
      await supabase.from("signals").insert(sentimentSignals);
    }

    // Log analytics
    await supabase.from("live_api_streams").insert({
      source: "SentimentAnalyst",
      symbol_or_context: "SENTIMENT_SCAN",
      payload: {
        overall_score: overallScore,
        signals_generated: sentimentSignals.length,
        news_analyzed: newsItems.length,
        scoring_method: useAI ? "ai-swarm" : "keyword-fallback",
        ai_scores_returned: Object.keys(aiScores).length,
      },
    });

    const scoringLabel = useAI ? "AI Swarm" : "Keyword Fallback";
    await supabase.from("agent_logs").insert({
      agent_name: "Sentiment Analyst",
      log_type: "info",
      message: `[${scoringLabel}] Analyzed ${newsItems.length} articles. Overall: ${overallScore.toFixed(3)}. ${sentimentSignals.length} signals. ${articlesToInsert.length} persisted.`,
      metadata: { overall_score: overallScore, signal_count: sentimentSignals.length, method: scoringLabel },
    });

    const bullishScore = ((overallScore + 1) / 2).toFixed(2);
    await supabase.from("agent_state").update({
      metric_value: bullishScore,
      metric_label: "bullish score",
      last_action: `[${scoringLabel}] ${newsItems.length} articles scored`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Sentiment Analyst");

    return new Response(JSON.stringify({
      success: true,
      scoring_method: useAI ? "ai-swarm" : "keyword-fallback",
      articles_persisted: articlesToInsert.length,
      sentiment: {
        overall_score: overallScore,
        symbol_sentiments: Object.entries(symbolScores).map(([s, d]) => ({
          symbol: s,
          score: d.scores.reduce((a, b) => a + b, 0) / d.scores.length,
        })),
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Sentiment Analyst error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
