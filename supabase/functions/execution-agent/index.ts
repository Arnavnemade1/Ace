import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";

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

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Execution Agent");

    // Fetch approved pending trades
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

    const results: any[] = [];

    for (const trade of pendingTrades) {
      try {
        // Submit order to Alpaca paper trading
        const orderRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders`, {
          method: "POST",
          headers: {
            "APCA-API-KEY-ID": ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol: trade.symbol,
            qty: String(trade.qty),
            side: trade.side.toLowerCase(),
            type: "market",
            time_in_force: "day",
          }),
        });

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          console.error(`Alpaca order error for ${trade.symbol}:`, errText);
          await supabase.from("trades").update({ status: "failed" }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: errText });
          continue;
        }

        const order = await orderRes.json();

        // Get fill price (may need to poll for fill)
        let fillPrice = 0;
        let attempts = 0;
        while (attempts < 5) {
          await new Promise((r) => setTimeout(r, 1000));
          const checkRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders/${order.id}`, {
            headers: {
              "APCA-API-KEY-ID": ALPACA_API_KEY,
              "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
            },
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.status === "filled") {
              fillPrice = parseFloat(checkData.filled_avg_price);
              break;
            }
          }
          attempts++;
        }

        // Update trade record
        await supabase.from("trades").update({
          price: fillPrice,
          total_value: fillPrice * trade.qty,
          status: "executed",
          alpaca_order_id: order.id,
          executed_at: new Date().toISOString(),
        }).eq("id", trade.id);

        results.push({ trade_id: trade.id, status: "executed", fill_price: fillPrice, order_id: order.id });

        await supabase.from("agent_logs").insert({
          agent_name: "Execution Agent",
          log_type: "trade",
          message: `Executed ${trade.side} ${trade.qty} ${trade.symbol} @ $${fillPrice}`,
          metadata: { order_id: order.id, fill_price: fillPrice },
        });
      } catch (tradeErr) {
        console.error(`Error executing trade ${trade.id}:`, tradeErr);
        await supabase.from("trades").update({ status: "failed" }).eq("id", trade.id);
        results.push({ trade_id: trade.id, status: "failed", error: String(tradeErr) });
      }
    }

    // Update portfolio state from Alpaca
    const accountRes = await fetch(`${ALPACA_PAPER_URL}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
      },
    });

    if (accountRes.ok) {
      const account = await accountRes.json();
      const positionsRes = await fetch(`${ALPACA_PAPER_URL}/v2/positions`, {
        headers: {
          "APCA-API-KEY-ID": ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
        },
      });
      const positionsData = positionsRes.ok ? await positionsRes.json() : [];

      await supabase.from("portfolio_state").update({
        total_value: parseFloat(account.portfolio_value),
        cash: parseFloat(account.cash),
        positions: positionsData.map((p: any) => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty),
          avg_entry: parseFloat(p.avg_entry_price),
          current_price: parseFloat(p.current_price),
          unrealized_pnl: parseFloat(p.unrealized_pl),
          market_value: parseFloat(p.market_value),
        })),
        daily_pnl: parseFloat(account.equity) - parseFloat(account.last_equity),
        updated_at: new Date().toISOString(),
      }).not("id", "is", null); // update all rows
    }

    const executed = results.filter((r) => r.status === "executed").length;
    await supabase.from("agent_state").update({
      metric_value: String(executed),
      metric_label: "trades today",
      last_action: `Executed ${executed}/${pendingTrades.length} trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Execution Agent");

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Execution Agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
