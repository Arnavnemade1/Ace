import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MIN_MINUTES_BETWEEN_TRADES = 30;
const MAX_TRADES_PER_DAY = 5;
const MIN_BUYING_POWER = 1000;
const CASH_BUFFER_PCT = 0.25;
const MAX_ALLOCATION_PCT = 0.02;
const MAX_OPEN_POSITIONS = 8;

async function getMarketClock(key?: string, secret?: string) {
  if (!key || !secret) return null;
  try {
    const res = await fetch("https://paper-api.alpaca.markets/v2/clock", {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

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

    const { data: lastTrade } = await supabase
      .from("trades")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastTrade?.created_at) {
      const ageMs = Date.now() - new Date(lastTrade.created_at).getTime();
      if (ageMs < MIN_MINUTES_BETWEEN_TRADES * 60 * 1000) {
        await supabase.from("agent_logs").insert({
          agent_name: "Strategy Engine",
          log_type: "info",
          message: `Cooldown active (${Math.round(ageMs / 60000)}m ago). No new trades recommended.`,
        });
        return new Response(JSON.stringify({ success: true, decisions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentExecutions } = await supabase
      .from("trades")
      .select("id")
      .eq("status", "executed")
      .gte("created_at", dayAgo);
    if ((recentExecutions?.length || 0) >= MAX_TRADES_PER_DAY) {
      await supabase.from("agent_logs").insert({
        agent_name: "Strategy Engine",
        log_type: "info",
        message: `Daily trade cap reached (${MAX_TRADES_PER_DAY}). Skipping new recommendations.`,
      });
      return new Response(JSON.stringify({ success: true, decisions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const clock = await getMarketClock(ALPACA_API_KEY || undefined, ALPACA_API_SECRET || undefined);
    let account: any = null;
    let positions: any[] = [];
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      const [accRes, posRes] = await Promise.all([
        fetch("https://paper-api.alpaca.markets/v2/account", {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }),
        fetch("https://paper-api.alpaca.markets/v2/positions", {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }),
      ]);
      if (accRes.ok) account = await accRes.json();
      if (posRes.ok) positions = await posRes.json();
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

    const portfolioValue = Number(account?.equity || portfolio?.total_value || 100000);
    const cash = Number(account?.cash || portfolio?.cash || 100000);
    const buyingPower = Number(account?.buying_power || portfolio?.buying_power || cash);
    const currentPositions = positions.length > 0 ? positions : (portfolio?.positions || []);
    const maxAllocation = portfolioValue * MAX_ALLOCATION_PCT;
    const minCashBuffer = portfolioValue * CASH_BUFFER_PCT;

    const portfolioSummary = `Cash: $${cash}, Total Value: $${portfolioValue}, Buying Power: $${buyingPower}, Open Positions: ${currentPositions.length}`;

    const tradeHistory = recentTrades?.map((t) =>
      `${t.side} ${t.qty} ${t.symbol} @ $${t.price} (${t.strategy})`
    ).join("\n") || "No recent trades";

    // AI decides which signals to act on — selective
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
            content: `You are the Strategy Engine of a cautious autonomous paper trading system. You run three strategies:
1. Momentum: Follow strong trends (signal strength > 0.7)
2. Mean Reversion: Fade overextended moves with confirmation
3. Volatility Arbitrage: Trade vol spikes only if liquidity is strong

IMPORTANT RULES:
- Be selective and avoid overtrading. If signals are weak, return no trades.
- Max 1 trade per cycle.
- Prefer signals with strength >= 0.8.
- Do NOT recommend new BUYs if cash buffer is below ${CASH_BUFFER_PCT * 100}% of equity.
- Do NOT recommend trades if buying power is below $${MIN_BUYING_POWER}.
- Consider existing positions to avoid over-concentration.
- Calculate qty based on real prices: qty = floor(allocation / price), allocation <= ${MAX_ALLOCATION_PCT * 100}% of equity.`,
          },
          {
            role: "user",
            content: `Active Signals:\n${signalSummary}\n\nPortfolio:\n${portfolioSummary}\n\nMarket Clock: ${clock?.is_open ? "OPEN" : "CLOSED"} | Next Open: ${clock?.next_open || "unknown"} | Next Close: ${clock?.next_close || "unknown"}\n\nRecent Trades:\n${tradeHistory}\n\nRecommend trades. If market is closed, still recommend if you would queue a GTC limit order at open.`,
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
      decisions = (parsed.trades || []).slice(0, 1);
    }

    // Budget-aware filtering: only BUY if strength is high and allocation fits live price
    const signalStrengthBySymbol = new Map((signals || []).map((s) => [s.symbol, Number(s.strength || 0)]));
    const heldSymbols = new Set((currentPositions || []).map((p: any) => p.symbol));
    decisions = decisions.filter((d) => {
      if (d.side !== "BUY") return true;
      const strength = signalStrengthBySymbol.get(d.symbol) || 0;
      if (strength < 0.8) return false;
      const snap = snapshots[d.symbol];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c;
      if (!price) return false;
      if (buyingPower < MIN_BUYING_POWER) return false;
      if (cash < minCashBuffer) return false;
      if (heldSymbols.has(d.symbol)) return false;
      if (currentPositions.length >= MAX_OPEN_POSITIONS) return false;
      const maxQty = Math.max(1, Math.floor(maxAllocation / price));
      d.qty = Math.min(d.qty, maxQty);
      return d.qty >= 1;
    });
    decisions = decisions.filter((d) => {
      if (d.side === "SELL") return heldSymbols.has(d.symbol);
      return true;
    });

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
      reasoning: decisions.map((d) => `${d.side} ${d.qty} ${d.symbol}: ${d.reasoning}`).join("; ") || "No trades recommended.",
      metadata: { signal_count: signals.length, trade_count: decisions.length },
    });

    await supabase.from("agent_state").update({
      metric_value: String(decisions.length),
      metric_label: "active strategies",
      last_action: `Recommended ${decisions.length} trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
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
