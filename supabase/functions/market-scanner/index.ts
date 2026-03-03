import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"]);

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function isMarketOpen(): boolean {
  const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nowNY.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

// Pure algorithmic signal detection — NO AI calls to save API costs
function detectSignals(ranked: any[]): any[] {
  const signals: any[] = [];
  for (const r of ranked) {
    const absChange = Math.abs(r.change);
    if (absChange < 1.5) continue; // Only significant movers

    let signalType = "";
    let strength = 0;
    let reasoning = "";

    // Momentum signals
    if (r.change > 3 && r.vol > 500000) {
      signalType = "momentum_long";
      strength = Math.min(0.95, 0.6 + (r.change / 20));
      reasoning = `Strong upward momentum: +${r.change.toFixed(2)}% on ${(r.vol / 1e6).toFixed(1)}M volume`;
    } else if (r.change < -3 && r.vol > 500000) {
      signalType = "momentum_short";
      strength = Math.min(0.95, 0.6 + (Math.abs(r.change) / 20));
      reasoning = `Strong downward momentum: ${r.change.toFixed(2)}% on ${(r.vol / 1e6).toFixed(1)}M volume`;
    }
    // Mean reversion on extreme moves
    else if (r.change > 6) {
      signalType = "mean_reversion_short";
      strength = Math.min(0.9, 0.65 + (r.change / 30));
      reasoning = `Overextended +${r.change.toFixed(2)}%, potential mean reversion`;
    } else if (r.change < -6) {
      signalType = "mean_reversion_long";
      strength = Math.min(0.9, 0.65 + (Math.abs(r.change) / 30));
      reasoning = `Oversold ${r.change.toFixed(2)}%, potential bounce`;
    }
    // Volume spike breakouts
    else if (absChange > 2 && r.vol > 2000000) {
      signalType = r.change > 0 ? "breakout" : "breakdown";
      strength = Math.min(0.85, 0.6 + (r.vol / 10000000));
      reasoning = `${r.change > 0 ? "Breakout" : "Breakdown"}: ${r.change.toFixed(2)}% on high volume ${(r.vol / 1e6).toFixed(1)}M`;
    }

    if (signalType && strength >= 0.6) {
      signals.push({ symbol: r.symbol, signal_type: signalType, strength: Math.round(strength * 100) / 100, reasoning });
    }
    if (signals.length >= 15) break;
  }
  return signals;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Market Scanner");

    const marketOpen = isMarketOpen();
    const scanSize = marketOpen ? 400 : 150;

    // Fetch tradable universe
    const assetsRes = await fetch("https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity", {
      headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
    });
    let universe: string[] = [];
    if (assetsRes.ok) {
      const assets = await assetsRes.json();
      universe = (assets || [])
        .filter((a: any) => a?.tradable && ALLOWED_EXCHANGES.has(a?.exchange) && /^[A-Z]{1,5}$/.test(a?.symbol || ""))
        .map((a: any) => a.symbol);
    }

    // Rotating cursor
    const { data: stateRow } = await supabase.from("agent_state").select("config").eq("agent_name", "Market Scanner").maybeSingle();
    const config = (stateRow?.config || {}) as Record<string, any>;
    const cursor = Number(config.scan_cursor || 0);
    const scanSymbols: string[] = [];
    for (let i = 0; i < Math.min(scanSize, universe.length); i++) {
      scanSymbols.push(universe[(cursor + i) % universe.length]);
    }
    const nextCursor = (cursor + scanSymbols.length) % Math.max(universe.length, 1);

    await supabase.from("agent_state").update({
      config: { ...config, scan_cursor: nextCursor, universe_size: universe.length, mode: marketOpen ? "HYPER" : "STANDARD", last_symbols: scanSymbols.slice(0, 50) },
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Market Scanner");

    // Fetch snapshots in batches
    let snapshots: Record<string, any> = {};
    for (const group of chunk(scanSymbols, 80)) {
      try {
        const res = await fetch(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${group.join(",")}`,
          { headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET } }
        );
        if (res.ok) Object.assign(snapshots, await res.json());
      } catch {}
    }

    // Rank by absolute change
    const ranked = scanSymbols
      .map(sym => {
        const snap = snapshots[sym];
        const price = snap?.latestTrade?.p || snap?.dailyBar?.c || 0;
        const prev = snap?.prevDailyBar?.c || snap?.dailyBar?.o || price;
        const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
        const vol = snap?.dailyBar?.v || 0;
        return { symbol: sym, price, change, vol, snap };
      })
      .filter(r => r.price > 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 50);

    // ALGORITHMIC signal detection — no AI call needed, saves API costs
    const signals = detectSignals(ranked);

    if (signals.length > 0) {
      await supabase.from("signals").insert(signals.map((s: any) => ({
        symbol: s.symbol, signal_type: s.signal_type, strength: s.strength,
        source_agent: "Market Scanner",
        metadata: { reasoning: s.reasoning },
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      })));
    }

    // Log to analytics
    await supabase.from("live_api_streams").insert({
      source: "MarketScanner",
      symbol_or_context: "SCAN_RESULT",
      payload: { mode: marketOpen ? "HYPER" : "STANDARD", scanned: scanSymbols.length, signals_found: signals.length, top_movers: ranked.slice(0, 10).map(r => ({ s: r.symbol, c: r.change, v: r.vol })) },
    });

    await supabase.from("agent_logs").insert({
      agent_name: "Market Scanner", log_type: "info",
      message: `${marketOpen ? "HYPER" : "STANDARD"} scan: ${scanSymbols.length} symbols → ${signals.length} signals (universe: ${universe.length}) [NO AI — algorithmic]`,
    });

    await supabase.from("agent_state").update({
      metric_value: String(signals.length), metric_label: "signals / scan",
      last_action: `${marketOpen ? "Hyper" : "Standard"} scan: ${scanSymbols.length} symbols`,
      last_action_at: new Date().toISOString(), status: "idle",
    }).eq("agent_name", "Market Scanner");

    return new Response(JSON.stringify({ success: true, mode: marketOpen ? "HYPER" : "STANDARD", scanned: scanSymbols.length, signals_found: signals.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Market Scanner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
