import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MIN_POSITIONS_FOR_OPTIMIZATION = 2;
const CASH_BUFFER_PCT = 0.25;

// AI helper: Gemini primary → Lovable AI fallback
async function callAIJson(prompt: string, geminiKey: string, lovableKey: string, maxTokens = 2048): Promise<string> {
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) return t;
      } else {
        console.log(`Gemini ${r.status}, falling back to Lovable AI`);
      }
    } catch (e) {
      console.log("Gemini error, falling back:", (e as Error).message);
    }
  }
  if (lovableKey) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) throw new Error(`Lovable AI fallback failed: ${r.status}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "{}";
  }
  throw new Error("No AI keys available");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI keys configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Portfolio Optimizer");

    // Fetch current positions from Alpaca
    let positions: any[] = [];
    let account: any = null;
    if (ALPACA_API_KEY && ALPACA_API_SECRET) {
      const [posRes, accRes] = await Promise.all([
        fetch("https://paper-api.alpaca.markets/v2/positions", {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }),
        fetch("https://paper-api.alpaca.markets/v2/account", {
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
        }),
      ]);
      if (posRes.ok) positions = await posRes.json();
      if (accRes.ok) account = await accRes.json();
    }

    const equity = Number(account?.equity || 0);
    const cash = Number(account?.cash || 0);
    const minCashBuffer = equity * CASH_BUFFER_PCT;

    if ((positions?.length || 0) < MIN_POSITIONS_FOR_OPTIMIZATION) {
      await supabase.from("agent_logs").insert({
        agent_name: "Portfolio Optimizer",
        log_type: "info",
        message: "Optimization skipped: not enough open positions.",
      });
      await supabase.from("agent_state").update({
        metric_value: "0",
        metric_label: "Sharpe ratio",
        last_action: "Skipped optimization (insufficient positions)",
        last_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "idle",
      }).eq("agent_name", "Portfolio Optimizer");
      return new Response(JSON.stringify({ success: true, optimization: null, reason: "insufficient positions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (equity > 0 && cash < minCashBuffer) {
      await supabase.from("agent_logs").insert({
        agent_name: "Portfolio Optimizer",
        log_type: "info",
        message: "Optimization skipped: cash buffer below threshold.",
      });
      await supabase.from("agent_state").update({
        metric_value: "0",
        metric_label: "Sharpe ratio",
        last_action: "Skipped optimization (cash buffer)",
        last_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "idle",
      }).eq("agent_name", "Portfolio Optimizer");
      return new Response(JSON.stringify({ success: true, optimization: null, reason: "cash buffer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch trade history for performance calculation
    const { data: allTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "executed")
      .order("executed_at", { ascending: false })
      .limit(100);

    const positionsSummary = positions.map((p: any) =>
      `${p.symbol}: ${p.qty} shares @ $${p.avg_entry_price} (current: $${p.current_price}, P&L: $${p.unrealized_pl})`
    ).join("\n") || "No open positions";

    const accountSummary = account
      ? `Equity: $${account.equity}, Cash: $${account.cash}, Buying Power: $${account.buying_power}`
      : "No account data";

    // AI optimization via Gemini direct
    const systemPrompt = `You are the Portfolio Optimizer agent. You continuously rebalance using Markowitz-enhanced allocation principles:

1. Calculate current allocation weights
2. Estimate expected returns and covariances
3. Optimize for maximum Sharpe ratio
4. Suggest rebalancing trades to move toward optimal allocation
5. Consider transaction costs and tax implications

Also calculate portfolio metrics: Sharpe ratio, Sortino ratio, max drawdown.

Respond ONLY with a JSON object with this exact structure:
{
  "sharpe_ratio": number,
  "sortino_ratio": number,
  "max_drawdown": number,
  "current_allocations": [{"symbol": "string", "current_weight": number, "optimal_weight": number}],
  "rebalance_trades": [{"symbol": "string", "side": "BUY" or "SELL", "qty": number, "reasoning": "string"}]
}`;

    const userPrompt = `Current positions:\n${positionsSummary}\n\nAccount:\n${accountSummary}\n\nRecent trade count: ${allTrades?.length || 0}\n\nAnalyze and suggest rebalancing.`;

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
      }),
    });

    if (!aiResponse.ok) throw new Error(`Gemini API error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let optResult = { sharpe_ratio: 0, current_allocations: [], rebalance_trades: [] } as any;

    try {
      optResult = JSON.parse(rawText);
    } catch { /* use defaults */ }

    // Submit rebalance trades as pending
    for (const trade of optResult.rebalance_trades) {
      await supabase.from("trades").insert({
        symbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        price: 0,
        total_value: 0,
        agent: "Portfolio Optimizer",
        strategy: "rebalance",
        reasoning: trade.reasoning,
        status: "pending",
      });
    }

    // Update portfolio metrics
    const { data: portfolioRow } = await supabase.from("portfolio_state").select("id").limit(1).single();
    if (portfolioRow) {
      await supabase.from("portfolio_state").update({
        sharpe_ratio: optResult.sharpe_ratio,
        max_drawdown: optResult.max_drawdown || 0,
        updated_at: new Date().toISOString(),
      }).eq("id", portfolioRow.id);
    }

    // Calculate win rate from trades
    const wins = allTrades?.filter((t) => t.pnl !== null && t.pnl > 0).length || 0;
    const totalWithPnl = allTrades?.filter((t) => t.pnl !== null).length || 1;
    const winRate = ((wins / totalWithPnl) * 100).toFixed(1);
    if (portfolioRow) {
      await supabase.from("portfolio_state").update({ win_rate: parseFloat(winRate), total_trades: allTrades?.length || 0 }).eq("id", portfolioRow.id);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Portfolio Optimizer",
      log_type: "decision",
      message: `Sharpe: ${optResult.sharpe_ratio.toFixed(2)}, suggested ${optResult.rebalance_trades.length} rebalance trades`,
      metadata: optResult,
    });

    await supabase.from("agent_state").update({
      metric_value: optResult.sharpe_ratio.toFixed(2),
      metric_label: "Sharpe ratio",
      last_action: `Optimized portfolio, ${optResult.rebalance_trades.length} rebalance trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Portfolio Optimizer");

    return new Response(JSON.stringify({ success: true, optimization: optResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Portfolio Optimizer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
