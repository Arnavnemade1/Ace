import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_DATA_URL = "https://data.alpaca.markets";
const NY_TZ = "America/New_York";
const MIN_BUYING_POWER = 100;
const MAX_ALLOCATION_PCT = 0.02;

function isMarketOpen(): boolean {
  const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: NY_TZ }));
  const day = nowNY.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function getMarketClock(key: string, secret: string) {
  try {
    const res = await fetch(`${ALPACA_PAPER_URL}/v2/clock`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchSnapshot(symbol: string, key: string, secret: string) {
  const snapRes = await fetch(`${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbol}`, {
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
  });
  if (!snapRes.ok) return null;
  const data = await snapRes.json();
  return data?.[symbol] || null;
}

async function sendDiscord(webhookUrl: string, content: string, embeds?: any[]) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds }),
    });
  } catch (e) {
    console.error("Discord webhook failed:", e);
  }
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
    const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Execution Agent");

    const { data: directiveState } = await supabase
      .from("agent_state")
      .select("config")
      .eq("agent_name", "Orchestrator")
      .maybeSingle();
    const directive = directiveState?.config || {};
    const strategyBias = String(directive.strategy_bias || "balanced");
    const riskProfile = String(directive.risk_profile || "standard");
    const tradingEnabled = directive.trading_enabled !== false;
    if (!tradingEnabled) {
      await supabase.from("agent_logs").insert({
        agent_name: "Execution Agent",
        log_type: "info",
        message: "Trading paused via Discord directive. Skipping execution.",
        reasoning: `Directive: trading_enabled=false | strategy_bias=${strategyBias} | risk_profile=${riskProfile}`,
      });
      return new Response(JSON.stringify({ success: true, message: "Trading paused by directive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No cooldown or daily caps; only buying power governs execution.

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
    const clock = await getMarketClock(ALPACA_API_KEY, ALPACA_API_SECRET);
    const marketOpen = clock?.is_open ?? isMarketOpen();

    await supabase.from("agent_logs").insert({
      agent_name: "Execution Agent",
      log_type: "info",
      message: `Market ${marketOpen ? "OPEN" : "CLOSED"} | Next open: ${clock?.next_open || "unknown"} | Next close: ${clock?.next_close || "unknown"}`,
    });
    await supabase.from("agent_logs").insert({
      agent_name: "Execution Agent",
      log_type: "info",
      message: "Order routing: market orders during open; GTC limit orders when closed. BUY opens long positions; SELL exits existing positions.",
    });

    // Fetch account/positions/orders for guardrails
    const [accountRes, positionsRes, openOrdersRes] = await Promise.all([
      fetch(`${ALPACA_PAPER_URL}/v2/account`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      }),
      fetch(`${ALPACA_PAPER_URL}/v2/positions`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      }),
      fetch(`${ALPACA_PAPER_URL}/v2/orders?status=open`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      }),
    ]);
    const account = accountRes.ok ? await accountRes.json() : null;
    const positions = positionsRes.ok ? await positionsRes.json() : [];
    const openOrders = openOrdersRes.ok ? await openOrdersRes.json() : [];
    const equity = account ? parseFloat(account.equity) : 0;
    const cash = account ? parseFloat(account.cash) : 0;
    const buyingPower = account ? parseFloat(account.buying_power) : 0;
    const allocationMultiplier = strategyBias === "aggressive" ? 1.15 : strategyBias === "conservative" ? 0.75 : 1;
    const maxAllocation = Math.min(equity * 0.03, equity * MAX_ALLOCATION_PCT * allocationMultiplier);
    const positionSymbols = new Set(Array.isArray(positions) ? positions.map((p: any) => p.symbol) : []);

    await supabase.from("agent_logs").insert({
      agent_name: "Execution Agent",
      log_type: "learning",
      message: "Journal — Execution posture",
      reasoning: [
        `Mode: NORMAL`,
        `Directive: ${strategyBias}/${riskProfile}`,
        `Buying power: $${buyingPower.toFixed(2)}`,
      ].join(" | "),
    });

    if (buyingPower < MIN_BUYING_POWER) {
      await supabase.from("agent_logs").insert({
        agent_name: "Execution Agent",
        log_type: "info",
        message: `Buying power below $${MIN_BUYING_POWER}. Skipping execution.`,
      });
      return new Response(JSON.stringify({ success: true, message: "Insufficient buying power" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const trade of pendingTrades) {
      try {
        if (trade.side === "BUY" && buyingPower < MIN_BUYING_POWER) {
          await supabase.from("trades").update({
            status: "failed",
            reasoning: "Skipped: insufficient buying power.",
          }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "insufficient funds" });
          continue;
        }

        if (trade.side === "SELL" && !positionSymbols.has(trade.symbol)) {
          await supabase.from("trades").update({
            status: "failed",
            reasoning: "Skipped: no position to sell.",
          }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "no position" });
          continue;
        }


        const snap = await fetchSnapshot(trade.symbol, ALPACA_API_KEY, ALPACA_API_SECRET);
        const bid = snap?.latestQuote?.bp;
        const ask = snap?.latestQuote?.ap;
        const lastTrade = snap?.latestTrade?.p;
        const refPrice = trade.side === "BUY" ? (ask || lastTrade) : (bid || lastTrade);
        if (!refPrice || Number.isNaN(refPrice)) {
          await supabase.from("trades").update({
            status: "failed",
            reasoning: "No live quote available for limit pricing.",
          }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: "no live quote" });
          continue;
        }

        if (trade.side === "BUY") {
          const maxQty = Math.max(1, Math.floor(maxAllocation / refPrice));
          if (maxQty < 1) {
            await supabase.from("trades").update({
              status: "failed",
              reasoning: "Skipped: allocation too small for minimum order size.",
            }).eq("id", trade.id);
            results.push({ trade_id: trade.id, status: "failed", error: "allocation too small" });
            continue;
          }
          trade.qty = Math.min(trade.qty, maxQty);
        }

        // Submit order to Alpaca paper trading
        const orderBody: any = {
          symbol: trade.symbol,
          qty: String(Math.max(1, Math.round(trade.qty))),
          side: trade.side.toLowerCase(),
          type: marketOpen ? "market" : "limit",
          time_in_force: marketOpen ? "day" : "gtc",
        };
        if (!marketOpen) {
          const limitPrice = trade.side === "BUY"
            ? Number((refPrice * 1.001).toFixed(2))
            : Number((refPrice * 0.999).toFixed(2));
          orderBody.limit_price = limitPrice;
        }

        console.log(`Submitting ${trade.side} ${trade.qty} ${trade.symbol} to Alpaca...`);

        const orderRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders`, {
          method: "POST",
          headers: {
            "APCA-API-KEY-ID": ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderBody),
        });

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          console.error(`Alpaca order error for ${trade.symbol}:`, errText);
          await supabase.from("trades").update({ status: "failed", reasoning: `Alpaca rejected: ${errText}` }).eq("id", trade.id);
          results.push({ trade_id: trade.id, status: "failed", error: errText });
          continue;
        }

        const order = await orderRes.json();
        console.log(`Order submitted: ${order.id} — status: ${order.status}`);

        // Poll for fill (up to 10 attempts, 2s apart)
        let fillPrice = 0;
        let fillStatus = order.status;
        let attempts = 0;
        while (attempts < 10) {
          await new Promise((r) => setTimeout(r, 2000));
          const checkRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders/${order.id}`, {
            headers: {
              "APCA-API-KEY-ID": ALPACA_API_KEY,
              "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
            },
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            fillStatus = checkData.status;
            if (checkData.status === "filled") {
              fillPrice = parseFloat(checkData.filled_avg_price);
              break;
            }
            if (checkData.status === "cancelled" || checkData.status === "rejected") {
              break;
            }
          }
          attempts++;
        }

        // Update trade record
        const finalStatus = fillPrice > 0 ? "executed" : fillStatus;
        await supabase.from("trades").update({
          price: fillPrice,
          total_value: fillPrice * trade.qty,
          status: finalStatus,
          alpaca_order_id: order.id,
          executed_at: new Date().toISOString(),
        }).eq("id", trade.id);

        results.push({ trade_id: trade.id, status: finalStatus, fill_price: fillPrice, order_id: order.id });
        processed++;

        await supabase.from("agent_logs").insert({
          agent_name: "Execution Agent",
          log_type: "trade",
          message: `${finalStatus === "executed" ? "✅" : "⚠️"} ${trade.side} ${trade.qty} ${trade.symbol} @ $${fillPrice.toFixed(2)} (${trade.strategy})`,
          reasoning: trade.reasoning,
          metadata: { order_id: order.id, fill_price: fillPrice, strategy: trade.strategy },
        });

        // Discord notification: BUY only
        if (DISCORD_WEBHOOK_URL && trade.side === "BUY") {
          const priceLine = fillPrice ? `Filled @ $${fillPrice.toFixed(2)}` : `Limit @ $${orderBody.limit_price || refPrice}`;
          await sendDiscord(DISCORD_WEBHOOK_URL, "", [{
            title: `✅ BUY EXECUTED — ${trade.symbol}`,
            description: [
              `Qty: ${trade.qty}`,
              priceLine,
              `Market: ${marketOpen ? "OPEN" : "CLOSED"}`,
              `Buying Power: $${buyingPower.toFixed(2)}`,
              trade.reasoning ? `Signal: ${trade.reasoning}` : "",
            ].filter(Boolean).join("\n"),
            color: 0x00ff41,
            footer: { text: "ACE_OS Execution Agent" },
            timestamp: new Date().toISOString(),
          }]);
        }
      } catch (tradeErr) {
        console.error(`Error executing trade ${trade.id}:`, tradeErr);
        await supabase.from("trades").update({ status: "failed" }).eq("id", trade.id);
        results.push({ trade_id: trade.id, status: "failed", error: String(tradeErr) });
      }
    }

    // Sync portfolio state from Alpaca
    const [accountResSync, positionsResSync] = await Promise.all([
      fetch(`${ALPACA_PAPER_URL}/v2/account`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      }),
      fetch(`${ALPACA_PAPER_URL}/v2/positions`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      }),
    ]);

    if (accountResSync.ok) {
      const account = await accountResSync.json();
      const positionsData = positionsResSync.ok ? await positionsResSync.json() : [];

      const formattedPositions = Array.isArray(positionsData) ? positionsData.map((p: any) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        avg_entry: parseFloat(p.avg_entry_price),
        current_price: parseFloat(p.current_price),
        unrealized_pnl: parseFloat(p.unrealized_pl),
        unrealized_plpc: parseFloat(p.unrealized_plpc),
        market_value: parseFloat(p.market_value),
        side: p.side,
      })) : [];

      // Fetch open orders too
      const ordersRes = await fetch(`${ALPACA_PAPER_URL}/v2/orders?status=open`, {
        headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
      });
      const openOrders = ordersRes.ok ? await ordersRes.json() : [];

      await supabase.from("portfolio_state").update({
        total_value: parseFloat(account.portfolio_value),
        cash: parseFloat(account.cash),
        buying_power: parseFloat(account.buying_power),
        equity: parseFloat(account.equity),
        positions: formattedPositions,
        orders: Array.isArray(openOrders) ? openOrders.map((o: any) => ({
          symbol: o.symbol, qty: o.qty, side: o.side, status: o.status,
          type: o.type, limit_price: o.limit_price, filled_avg_price: o.filled_avg_price,
        })) : [],
        daily_pnl: parseFloat(account.equity) - parseFloat(account.last_equity),
        updated_at: new Date().toISOString(),
      }).not("id", "is", null);

      // No Discord portfolio summaries; only BUY executions send notifications.
    }

    const executed = results.filter((r) => r.status === "executed").length;
    await supabase.from("agent_state").update({
      metric_value: String(executed),
      metric_label: "trades today",
      last_action: `Executed ${executed}/${pendingTrades.length} trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
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
