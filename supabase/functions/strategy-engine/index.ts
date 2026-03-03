import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ALLOCATION_PCT = 0.02;
const CASH_BUFFER_PCT = 0.25;
const LOW_RISK_SYMBOLS = new Set(["SPY", "QQQ", "VTI", "IWM", "DIA", "TLT", "SHY", "USFR"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Strategy Engine");

    // Fetch unacted signals
    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("acted_on", false)
      .gte("expires_at", new Date().toISOString())
      .order("strength", { ascending: false })
      .limit(30);

    // Fetch portfolio
    const { data: portfolio } = await supabase.from("portfolio_state").select("*").limit(1).single();

    let account: any = null;
    let positions: any[] = [];
    let snapshots: Record<string, any> = {};

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

      // Fetch prices for signal symbols
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
      await supabase.from("agent_logs").insert({ agent_name: "Strategy Engine", log_type: "info", message: "No actionable signals found" });
      await supabase.from("agent_state").update({ status: "idle", updated_at: new Date().toISOString() }).eq("agent_name", "Strategy Engine");
      return new Response(JSON.stringify({ success: true, decisions: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const portfolioValue = Number(account?.equity || portfolio?.total_value || 100000);
    const cash = Number(account?.cash || portfolio?.cash || 100000);
    const buyingPower = Number(account?.buying_power || portfolio?.buying_power || cash);
    const heldSymbols = new Set((positions || []).map((p: any) => p.symbol));
    const maxAllocation = portfolioValue * MAX_ALLOCATION_PCT;
    const dailyPnl = account?.last_equity ? Number(account.equity) - Number(account.last_equity) : Number(portfolio?.daily_pnl || 0);
    const dailyPnlPct = portfolioValue > 0 ? dailyPnl / portfolioValue : 0;
    const lossRecovery = dailyPnlPct < -0.01;

    // ALGORITHMIC strategy selection — no AI call, saves API costs
    // Pick top signals by strength, apply budget constraints
    const decisions: any[] = [];
    const effectiveAlloc = lossRecovery ? portfolioValue * 0.01 : maxAllocation;

    for (const sig of signals) {
      if (decisions.length >= 3) break;
      
      const strength = Number(sig.strength || 0);
      const minStrength = lossRecovery ? 0.85 : 0.7;
      if (strength < minStrength) continue;

      // Determine side from signal type
      const isBuy = sig.signal_type.includes("long") || sig.signal_type.includes("bullish") || sig.signal_type === "breakout";
      const isSell = sig.signal_type.includes("short") || sig.signal_type.includes("bearish") || sig.signal_type === "breakdown";
      
      if (!isBuy && !isSell) continue;
      if (isSell && !heldSymbols.has(sig.symbol)) continue;
      if (isBuy && cash < portfolioValue * CASH_BUFFER_PCT) continue;
      if (lossRecovery && isBuy && !LOW_RISK_SYMBOLS.has(sig.symbol)) continue;

      const snap = snapshots[sig.symbol];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c;
      if (!price) continue;

      const qty = isBuy ? Math.max(1, Math.floor(effectiveAlloc / price)) : Math.min(
        parseInt((positions.find((p: any) => p.symbol === sig.symbol)?.qty || "0")),
        Math.max(1, Math.floor(effectiveAlloc / price))
      );
      if (qty < 1) continue;

      // Determine strategy
      let strategy = "Momentum";
      if (sig.signal_type.includes("mean_reversion")) strategy = "Mean Reversion";
      else if (sig.signal_type.includes("sentiment")) strategy = "Sentiment";
      else if (sig.signal_type.includes("breakout") || sig.signal_type.includes("breakdown")) strategy = "Breakout";

      decisions.push({
        symbol: sig.symbol,
        side: isBuy ? "BUY" : "SELL",
        qty,
        strategy,
        reasoning: sig.metadata?.reasoning || `${strategy} signal with strength ${strength.toFixed(2)}`,
      });
    }

    // Mark signals as acted on
    if (decisions.length > 0) {
      const actedIds = decisions
        .map(d => signals.find(s => s.symbol === d.symbol))
        .filter(Boolean)
        .map((s: any) => s.id);
      if (actedIds.length > 0) {
        await supabase.from("signals").update({ acted_on: true }).in("id", actedIds);
      }
    }

    // Store as pending trades
    for (const d of decisions) {
      const snap = snapshots[d.symbol];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c || 0;
      await supabase.from("trades").insert({
        symbol: d.symbol, side: d.side, qty: d.qty, price,
        total_value: price * d.qty, agent: "Strategy Engine",
        strategy: d.strategy, reasoning: d.reasoning, status: "pending",
      });
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Strategy Engine", log_type: "decision",
      message: `Processed ${signals.length} signals → ${decisions.length} trades [NO AI — algorithmic]`,
      reasoning: decisions.map(d => `${d.side} ${d.qty} ${d.symbol}: ${d.reasoning}`).join("; ") || "No trades.",
    });

    await supabase.from("agent_state").update({
      metric_value: String(decisions.length), metric_label: "active strategies",
      last_action: `Recommended ${decisions.length} trades`,
      last_action_at: new Date().toISOString(), status: "idle",
    }).eq("agent_name", "Strategy Engine");

    return new Response(JSON.stringify({ success: true, decisions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Strategy Engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
