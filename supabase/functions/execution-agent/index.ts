import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const NY_TZ = "America/New_York";

function isMarketOpen(): boolean {
  const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: NY_TZ }));
  const day = nowNY.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function alpacaGet(path: string, key: string, secret: string) {
  const res = await fetch(`${ALPACA_PAPER_URL}${path}`, {
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
  });
  if (!res.ok) return null;
  return await res.json();
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
    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");

    // NO Discord spam from execution agent — orchestrator handles all Discord comms

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Order Agent");

    // Fetch pending trades
    const { data: pendingTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!pendingTrades || pendingTrades.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending trades" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clock = await alpacaGet("/v2/clock", ALPACA_API_KEY, ALPACA_API_SECRET);
    const marketOpen = clock?.is_open ?? isMarketOpen();
    const account = await alpacaGet("/v2/account", ALPACA_API_KEY, ALPACA_API_SECRET);
    const positions = await alpacaGet("/v2/positions", ALPACA_API_KEY, ALPACA_API_SECRET) || [];
    const buyingPower = account ? parseFloat(account.buying_power) : 0;
    const positionSymbols = new Set(Array.isArray(positions) ? positions.map((p: any) => p.symbol) : []);

    const results: any[] = [];

    for (const trade of pendingTrades) {
      try {
        if (trade.side === "BUY" && buyingPower < 100) {
          await supabase.from("trades").update({ status: "failed", reasoning: "Insufficient buying power" }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "insufficient funds" });
          continue;
        }
        if (trade.side === "SELL" && !positionSymbols.has(trade.symbol)) {
          await supabase.from("trades").update({ status: "failed", reasoning: "No position to sell" }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "no position" });
          continue;
        }

        // Get live price for limit orders
        const snapRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${trade.symbol}`,
          { headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET } }
        );
        const snapData = snapRes.ok ? await snapRes.json() : {};
        const snap = snapData[trade.symbol];
        const refPrice = trade.side === "BUY"
          ? (snap?.latestQuote?.ap || snap?.latestTrade?.p)
          : (snap?.latestQuote?.bp || snap?.latestTrade?.p);

        if (!refPrice) {
          await supabase.from("trades").update({ status: "failed", reasoning: "No live quote" }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "no quote" });
          continue;
        }

        const orderBody: any = {
          symbol: trade.symbol,
          qty: String(Math.max(1, Math.round(trade.qty))),
          side: trade.side.toLowerCase(),
          type: marketOpen ? "market" : "limit",
          time_in_force: marketOpen ? "day" : "gtc",
        };
        if (!marketOpen) {
          orderBody.limit_price = trade.side === "BUY"
            ? Number((refPrice * 1.001).toFixed(2))
            : Number((refPrice * 0.999).toFixed(2));
        }

        const orderRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders`, {
          method: "POST",
          headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET, "Content-Type": "application/json" },
          body: JSON.stringify(orderBody),
        });

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          await supabase.from("trades").update({ status: "failed", reasoning: `Alpaca: ${errText}` }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: errText });
          continue;
        }

        const order = await orderRes.json();
        let fillPrice = 0;
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const check = await alpacaGet(`/v2/orders/${order.id}`, ALPACA_API_KEY, ALPACA_API_SECRET);
          if (check?.status === "filled") { fillPrice = parseFloat(check.filled_avg_price); break; }
          if (check?.status === "cancelled" || check?.status === "rejected") break;
        }

        await supabase.from("trades").update({
          price: fillPrice || refPrice,
          total_value: (fillPrice || refPrice) * trade.qty,
          status: fillPrice > 0 ? "executed" : "submitted",
          alpaca_order_id: order.id,
          executed_at: new Date().toISOString(),
        }).eq("id", trade.id);

        results.push({ trade_id: trade.id, status: fillPrice > 0 ? "executed" : "submitted", fill_price: fillPrice });

        await supabase.from("agent_logs").insert({
          agent_name: "Order Agent", log_type: "trade",
          message: `${fillPrice > 0 ? "✅" : "⏳"} ${trade.side} ${trade.qty} ${trade.symbol} @ $${(fillPrice || refPrice).toFixed(2)}`,
          reasoning: trade.reasoning,
        });
      } catch (tradeErr) {
        await supabase.from("trades").update({ status: "failed" }).eq("id", trade.id);
        results.push({ trade_id: trade.id, status: "failed", error: String(tradeErr) });
      }
    }

    // Sync portfolio
    const freshAcc = await alpacaGet("/v2/account", ALPACA_API_KEY, ALPACA_API_SECRET);
    const freshPos = await alpacaGet("/v2/positions", ALPACA_API_KEY, ALPACA_API_SECRET) || [];
    if (freshAcc) {
      await supabase.from("portfolio_state").update({
        total_value: parseFloat(freshAcc.portfolio_value),
        cash: parseFloat(freshAcc.cash),
        buying_power: parseFloat(freshAcc.buying_power),
        equity: parseFloat(freshAcc.equity),
        positions: Array.isArray(freshPos) ? freshPos.map((p: any) => ({
          symbol: p.symbol, qty: parseFloat(p.qty), avg_entry: parseFloat(p.avg_entry_price),
          current_price: parseFloat(p.current_price), unrealized_pnl: parseFloat(p.unrealized_pl),
          market_value: parseFloat(p.market_value), side: p.side,
        })) : [],
        daily_pnl: parseFloat(freshAcc.equity) - parseFloat(freshAcc.last_equity),
        updated_at: new Date().toISOString(),
      }).not("id", "is", null);
    }

    await supabase.from("agent_state").update({
      last_action: `Executed ${results.filter(r => r.status === "executed").length}/${pendingTrades.length} trades`,
      last_action_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Order Agent");

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Order Agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
