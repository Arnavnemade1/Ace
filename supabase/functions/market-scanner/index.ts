import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WATCHLIST = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META", "AMD", "GOOGL"];

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

    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Market Scanner");

    // Fetch snapshots for all watchlist symbols
    const snapshotsRes = await fetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${WATCHLIST.join(",")}`,
      {
        headers: {
          "APCA-API-KEY-ID": ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
        },
      }
    );

    let snapshots: Record<string, any> = {};
    if (snapshotsRes.ok) {
      snapshots = await snapshotsRes.json();
    }

    // Also store raw data to live_api_streams for Analytics page
    for (const [symbol, snap] of Object.entries(snapshots)) {
      if (snap?.latestTrade?.p) {
        await supabase.from("live_api_streams").insert({
          source: "AlphaVantage",
          symbol_or_context: symbol,
          payload: { "05. price": String(snap.latestTrade.p), symbol, ...snap.dailyBar },
        });
      }
    }

    // Build rich market context with real data
    const marketContext = WATCHLIST.map((symbol) => {
      const snap = snapshots[symbol];
      if (!snap) return `${symbol}: No data available`;
      const price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
      const prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || price;
      const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100).toFixed(2) : "N/A";
      const vol = snap.dailyBar?.v || 0;
      const high = snap.dailyBar?.h || 0;
      const low = snap.dailyBar?.l || 0;
      const vwap = snap.dailyBar?.vw || 0;
      return `${symbol}: Price=$${price}, Change=${change}%, Vol=${vol}, High=$${high}, Low=$${low}, VWAP=$${vwap}`;
    }).join("\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are the Market Scanner agent of an aggressive autonomous paper trading system. Analyze REAL market data and identify strong trading signals. 

For each signal, provide:
- symbol
- signal_type: "momentum_long", "momentum_short", "mean_reversion_long", "mean_reversion_short", "breakout", "breakdown", "vol_spike"
- strength: 0.0 to 1.0
- reasoning: brief explanation

IMPORTANT: Be generous with signals — lower the threshold. Return signals with strength >= 0.4.
Look for: momentum plays, oversold bounces, breakouts, high volume moves, sector divergences.
This is paper trading — we want to learn from many trades.`,
          },
          {
            role: "user",
            content: `Current REAL market data:\n${marketContext}\n\nFind ALL tradeable signals. Be aggressive.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_signals",
              description: "Report detected market signals",
              parameters: {
                type: "object",
                properties: {
                  signals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        signal_type: { type: "string" },
                        strength: { type: "number" },
                        reasoning: { type: "string" },
                      },
                      required: ["symbol", "signal_type", "strength", "reasoning"],
                    },
                  },
                },
                required: ["signals"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_signals" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let signals: any[] = [];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      signals = parsed.signals || [];
    }

    // Store signals in database
    if (signals.length > 0) {
      const signalRows = signals.map((s: any) => ({
        symbol: s.symbol,
        signal_type: s.signal_type,
        strength: s.strength,
        source_agent: "Market Scanner",
        metadata: { reasoning: s.reasoning, market_data: snapshots[s.symbol]?.dailyBar || {} },
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      }));

      await supabase.from("signals").insert(signalRows);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Market Scanner",
      log_type: "info",
      message: `Scanned ${WATCHLIST.length} symbols with REAL data, found ${signals.length} signals`,
      metadata: { symbols_scanned: WATCHLIST, signal_count: signals.length },
    });

    await supabase.from("agent_state").update({
      metric_value: String(signals.length),
      metric_label: "signals / hr",
      last_action: `Scanned ${WATCHLIST.length} symbols (live)`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Market Scanner");

    return new Response(JSON.stringify({ success: true, signals_found: signals.length, signals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Market Scanner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
