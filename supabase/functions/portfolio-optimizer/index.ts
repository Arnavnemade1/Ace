import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, safeJSON } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const MIN_POSITIONS_FOR_OPTIMIZATION = 2;
const CASH_BUFFER_PCT = 0.25;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    // AI keys read inside callAI

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

    const prompt = `Optimize portfolio (Markowitz, max Sharpe). Return JSON: {"sharpe_ratio":n,"sortino_ratio":n,"max_drawdown":n,"current_allocations":[{"symbol":"s","current_weight":n,"optimal_weight":n}],"rebalance_trades":[{"symbol":"s","side":"BUY|SELL","qty":n,"reasoning":"r"}]}\n\nPositions:\n${positionsSummary}\n\n${accountSummary}\nTrade count: ${allTrades?.length || 0}`;

    const rawText = await callAI(prompt, { maxTokens: 700, temperature: 0.2 });
    const optResult = safeJSON<any>(rawText, { sharpe_ratio: 0, current_allocations: [], rebalance_trades: [] });
    optResult.sharpe_ratio ??= 0;
    optResult.rebalance_trades ??= [];
    optResult.current_allocations ??= [];

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
