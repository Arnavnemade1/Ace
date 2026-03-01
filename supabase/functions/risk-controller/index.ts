import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_POSITION_PCT = 0.05; // 5% max per position (mindful)
const MAX_DAILY_LOSS = 0.02; // 2% max daily loss
const MIN_BUYING_POWER = 1000;
const CASH_BUFFER_PCT = 0.25;
const MAX_OPEN_POSITIONS = 8;
const MAX_TRADES_PER_DAY = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Risk Controller");

    // Fetch pending trades
    const { data: pendingTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    // Fetch portfolio
    const { data: portfolio } = await supabase.from("portfolio_state").select("*").limit(1).single();

    if (!pendingTrades || pendingTrades.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending trades to review" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portfolioValue = portfolio?.total_value || 100000;
    const cash = portfolio?.cash || 100000;
    const buyingPower = portfolio?.buying_power || cash;
    const dailyPnl = portfolio?.daily_pnl || 0;
    const positions = portfolio?.positions || [];
    const minCashBuffer = portfolioValue * CASH_BUFFER_PCT;
    const positionSymbols = new Set((positions || []).map((p: any) => p.symbol));

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: executedToday } = await supabase
      .from("trades")
      .select("id")
      .eq("status", "executed")
      .gte("created_at", dayAgo);
    if ((executedToday?.length || 0) >= MAX_TRADES_PER_DAY) {
      await supabase.from("agent_logs").insert({
        agent_name: "Risk Controller",
        log_type: "info",
        message: `Daily trade cap reached (${MAX_TRADES_PER_DAY}). Skipping risk approvals.`,
      });
      return new Response(JSON.stringify({ success: true, approved: 0, rejected: pendingTrades.length, reason: "daily cap" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI-enhanced risk assessment — mindful for paper trading
    const tradesSummary = pendingTrades.map((t) =>
      `ID:${t.id} — ${t.side} ${t.qty} ${t.symbol} (strategy: ${t.strategy}, reasoning: ${t.reasoning})`
    ).join("\n");

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
            content: `You are the Risk Controller of an autonomous PAPER trading system. Review pending trades and apply risk rules:

Rules (MINDFUL):
- Max ${MAX_POSITION_PCT * 100}% of portfolio ($${portfolioValue}) in any single position
- Max ${MAX_DAILY_LOSS * 100}% daily loss (current daily P&L: $${dailyPnl})
- Maintain cash buffer of ${CASH_BUFFER_PCT * 100}% (min $${minCashBuffer.toFixed(2)})
- Reject trades that would create over-concentration or exceed cash/buying power
- Adjust qty down when needed; prefer fewer, higher-quality trades

Current positions: ${JSON.stringify(positions)}
Cash available: $${cash}

IMPORTANT: Be conservative. If in doubt, HOLD/REJECT.`,
          },
          {
            role: "user",
            content: `Review these pending trades:\n${tradesSummary}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "risk_decisions",
              description: "Risk decisions for pending trades",
              parameters: {
                type: "object",
                properties: {
                  decisions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        trade_id: { type: "string" },
                        approved: { type: "boolean" },
                        adjusted_qty: { type: "number" },
                        risk_score: { type: "number" },
                        reasoning: { type: "string" },
                      },
                      required: ["trade_id", "approved", "reasoning"],
                    },
                  },
                  portfolio_var: { type: "number" },
                },
                required: ["decisions", "portfolio_var"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "risk_decisions" } },
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI gateway error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let riskResult = { decisions: [] as any[], portfolio_var: 0 };

    if (toolCall?.function?.arguments) {
      riskResult = JSON.parse(toolCall.function.arguments);
    }

    // Apply risk decisions
    let approved = 0;
    let rejected = 0;

    for (const decision of riskResult.decisions) {
      const trade = pendingTrades.find((t) => t.id === decision.trade_id);
      if (!trade) continue;

      if (trade.side === "BUY") {
        if (buyingPower < MIN_BUYING_POWER || cash < minCashBuffer) {
          await supabase.from("trades").update({ status: "cancelled", reasoning: "Risk rejected: insufficient buying power or cash buffer." }).eq("id", trade.id);
          rejected++;
          continue;
        }
        if (positions.length >= MAX_OPEN_POSITIONS && !positionSymbols.has(trade.symbol)) {
          await supabase.from("trades").update({ status: "cancelled", reasoning: "Risk rejected: max open positions reached." }).eq("id", trade.id);
          rejected++;
          continue;
        }
      }
      if (trade.side === "SELL" && !positionSymbols.has(trade.symbol)) {
        await supabase.from("trades").update({ status: "cancelled", reasoning: "Risk rejected: no existing position to sell." }).eq("id", trade.id);
        rejected++;
        continue;
      }

      if (decision.approved) {
        const newQty = decision.adjusted_qty || trade.qty;
        await supabase.from("trades").update({
          qty: Math.max(1, Math.round(newQty)),
          status: "pending",
        }).eq("id", trade.id);
        approved++;
      } else {
        await supabase.from("trades").update({ status: "cancelled", reasoning: `Risk rejected: ${decision.reasoning}` }).eq("id", trade.id);
        rejected++;
      }
    }

    // If AI didn't return decisions for some trades, auto-approve them
    const decidedIds = riskResult.decisions.map((d: any) => d.trade_id);
    const undecided = pendingTrades.filter(t => !decidedIds.includes(t.id));
    for (const trade of undecided) {
      approved++;
      // Leave as pending — auto-approved
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Risk Controller",
      log_type: "decision",
      message: `Reviewed ${pendingTrades.length} trades: ${approved} approved, ${rejected} rejected. VaR: ${riskResult.portfolio_var}%`,
      metadata: { approved, rejected, portfolio_var: riskResult.portfolio_var },
    });

    await supabase.from("agent_state").update({
      metric_value: `${riskResult.portfolio_var}%`,
      metric_label: "current VaR",
      last_action: `${approved} approved, ${rejected} rejected`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Risk Controller");

    return new Response(JSON.stringify({ success: true, approved, rejected, portfolio_var: riskResult.portfolio_var }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Risk Controller error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
