import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Strategy Engine");

    // Fetch unacted signals
    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("acted_on", false)
      .gte("expires_at", new Date().toISOString())
      .order("strength", { ascending: false })
      .limit(30);

    // Fetch portfolio state
    const { data: portfolio } = await supabase.from("portfolio_state").select("*").limit(1).single();

    // Fetch recent trades for context
    const { data: recentTrades } = await supabase
      .from("trades")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(10);

    // Fetch real prices from Alpaca for sizing
    let snapshots: Record<string, any> = {};
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      const symbols = [...new Set((signals || []).map(s => s.symbol))];
      if (symbols.length > 0) {
        const snapRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(",")}`,
          { headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET } }
        );
        if (snapRes.ok) snapshots = await snapRes.json();
      }
    }

    if (!signals || signals.length === 0) {
      await supabase.from("agent_logs").insert({
        agent_name: "Strategy Engine",
        log_type: "info",
        message: "No actionable signals found",
      });
      return new Response(JSON.stringify({ success: true, decisions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signalSummary = signals.map((s) => {
      const snap = snapshots[s.symbol];
      const price = snap?.latestTrade?.p || "unknown";
      return `${s.symbol}: ${s.signal_type} (strength: ${s.strength}, price: $${price}) - ${s.metadata?.reasoning || "No reasoning"}`;
    }).join("\n");

    const portfolioValue = portfolio?.total_value || 100000;
    const cash = portfolio?.cash || 100000;
    const currentPositions = portfolio?.positions || [];

    const portfolioSummary = `Cash: $${cash}, Total Value: $${portfolioValue}, Positions: ${JSON.stringify(currentPositions)}`;

    const tradeHistory = recentTrades?.map((t) =>
      `${t.side} ${t.qty} ${t.symbol} @ $${t.price} (${t.strategy})`
    ).join("\n") || "No recent trades";

    // AI decides which signals to act on — NO COOLDOWNS
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
            content: `You are the Strategy Engine of an aggressive autonomous paper trading system. You run three strategies:
1. Momentum: Follow strong trends (signal strength > 0.6)
2. Mean Reversion: Fade overextended moves
3. Volatility Arbitrage: Trade vol spikes

IMPORTANT RULES:
- NO waiting periods or cooldowns. Trade whenever opportunities exist.
- Size positions appropriately: use real prices to calculate qty (max 10% of portfolio per trade)
- It's OK to open NEW positions — be aggressive on paper trading
- Multiple trades per cycle are fine
- Consider existing positions to avoid over-concentration
- Calculate qty based on real prices: qty = floor(allocation / price)`,
          },
          {
            role: "user",
            content: `Active Signals:\n${signalSummary}\n\nPortfolio:\n${portfolioSummary}\n\nRecent Trades:\n${tradeHistory}\n\nRecommend trades. Be aggressive — this is paper trading. Size appropriately using real prices.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_trades",
              description: "Recommend trades to execute",
              parameters: {
                type: "object",
                properties: {
                  trades: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        side: { type: "string", enum: ["BUY", "SELL"] },
                        qty: { type: "number" },
                        strategy: { type: "string" },
                        reasoning: { type: "string" },
                      },
                      required: ["symbol", "side", "qty", "strategy", "reasoning"],
                    },
                  },
                },
                required: ["trades"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_trades" } },
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI gateway error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let decisions: any[] = [];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      decisions = parsed.trades || [];
    }

    // Mark signals as acted on
    const signalIds = signals.map((s) => s.id);
    await supabase.from("signals").update({ acted_on: true }).in("id", signalIds);

    // Store decisions as pending trades
    for (const decision of decisions) {
      await supabase.from("trades").insert({
        symbol: decision.symbol,
        side: decision.side,
        qty: Math.max(1, Math.round(decision.qty)),
        price: 0,
        total_value: 0,
        agent: "Strategy Engine",
        strategy: decision.strategy,
        reasoning: decision.reasoning,
        status: "pending",
      });
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Strategy Engine",
      log_type: "decision",
      message: `Processed ${signals.length} signals → ${decisions.length} trades recommended`,
      reasoning: decisions.map((d) => `${d.side} ${d.qty} ${d.symbol}: ${d.reasoning}`).join("; "),
      metadata: { signal_count: signals.length, trade_count: decisions.length },
    });

    await supabase.from("agent_state").update({
      metric_value: String(decisions.length),
      metric_label: "active strategies",
      last_action: `Recommended ${decisions.length} trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Strategy Engine");

    return new Response(JSON.stringify({ success: true, decisions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Strategy Engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
