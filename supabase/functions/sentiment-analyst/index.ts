import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WATCHLIST = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Sentiment Analyst");

    // Fetch news from Alpaca
    let newsItems: any[] = [];
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      const newsRes = await fetch(
        `https://data.alpaca.markets/v1beta1/news?symbols=${WATCHLIST.join(",")}&limit=20`,
        {
          headers: {
            "APCA-API-KEY-ID": ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
          },
        }
      );
      if (newsRes.ok) {
        const newsData = await newsRes.json();
        newsItems = newsData.news || [];
      }
    }

    const newsContext = newsItems.length > 0
      ? newsItems.map((n: any) => `[${n.symbols?.join(",")}] ${n.headline} - ${n.summary?.slice(0, 200) || ""}`).join("\n")
      : "No recent news available. Provide general market sentiment based on current market conditions for: " + WATCHLIST.join(", ");

    // AI sentiment analysis
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are the Sentiment Analyst agent. Analyze news headlines and market context to produce sentiment scores for each symbol. 

Score from -1.0 (extremely bearish) to 1.0 (extremely bullish). 0.0 is neutral.
Also provide an overall market sentiment score.

Be nuanced — consider sector rotation, macro factors, and cross-asset implications.`,
          },
          {
            role: "user",
            content: `Analyze sentiment for these headlines:\n${newsContext}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_sentiment",
              description: "Report sentiment analysis results",
              parameters: {
                type: "object",
                properties: {
                  overall_score: { type: "number", description: "Overall market sentiment -1 to 1" },
                  symbol_sentiments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        score: { type: "number" },
                        reasoning: { type: "string" },
                      },
                      required: ["symbol", "score", "reasoning"],
                    },
                  },
                },
                required: ["overall_score", "symbol_sentiments"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_sentiment" } },
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI gateway error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let sentimentResult = { overall_score: 0, symbol_sentiments: [] as any[] };

    if (toolCall?.function?.arguments) {
      sentimentResult = JSON.parse(toolCall.function.arguments);
    }

    // Store sentiment signals
    const sentimentSignals = sentimentResult.symbol_sentiments
      .filter((s: any) => Math.abs(s.score) >= 0.3) // Only meaningful sentiment
      .map((s: any) => ({
        symbol: s.symbol,
        signal_type: s.score > 0 ? "sentiment_bullish" : "sentiment_bearish",
        strength: Math.abs(s.score),
        source_agent: "Sentiment Analyst",
        metadata: { sentiment_score: s.score, reasoning: s.reasoning, news_count: newsItems.length },
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }));

    if (sentimentSignals.length > 0) {
      await supabase.from("signals").insert(sentimentSignals);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Sentiment Analyst",
      log_type: "info",
      message: `Analyzed ${newsItems.length} news items. Overall sentiment: ${sentimentResult.overall_score.toFixed(2)}. Generated ${sentimentSignals.length} signals.`,
      metadata: { overall_score: sentimentResult.overall_score, signal_count: sentimentSignals.length },
    });

    // Display bullish score (normalized 0-1)
    const bullishScore = ((sentimentResult.overall_score + 1) / 2).toFixed(2);
    await supabase.from("agent_state").update({
      metric_value: bullishScore,
      metric_label: "bullish score",
      last_action: `Analyzed ${newsItems.length} news items`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Sentiment Analyst");

    return new Response(JSON.stringify({ success: true, sentiment: sentimentResult }), {
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
