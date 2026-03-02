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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Market Scanner");

    const marketOpen = isMarketOpen();

    // HYPER MODE: During market hours scan 400 symbols, off-hours scan 150
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

    // Rotating cursor for full coverage
    const { data: stateRow } = await supabase.from("agent_state").select("config").eq("agent_name", "Market Scanner").maybeSingle();
    const config = (stateRow?.config || {}) as Record<string, any>;
    const cursor = Number(config.scan_cursor || 0);
    const scanSymbols: string[] = [];
    for (let i = 0; i < Math.min(scanSize, universe.length); i++) {
      scanSymbols.push(universe[(cursor + i) % universe.length]);
    }
    const nextCursor = (cursor + scanSymbols.length) % Math.max(universe.length, 1);

    await supabase.from("agent_state").update({
      config: { ...config, scan_cursor: nextCursor, universe_size: universe.length, mode: marketOpen ? "HYPER" : "STANDARD" },
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

    const marketContext = ranked.map(r =>
      `${r.symbol}: $${r.price.toFixed(2)} (${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}%) Vol:${r.vol}`
    ).join("\n");

    // AI signal detection
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `You are a market scanner. Analyze real stock data and find high-quality trading signals.
Signal types: momentum_long, momentum_short, mean_reversion_long, mean_reversion_short, breakout, breakdown, vol_spike.
Strength: 0.0-1.0 (only report >= 0.6). Max 15 signals. Be selective — quality over quantity.` },
          { role: "user", content: `Market mode: ${marketOpen ? "HYPER (open)" : "PREP (closed)"}\nTop movers from ${scanSymbols.length} symbols:\n${marketContext}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_signals",
            description: "Report market signals",
            parameters: {
              type: "object",
              properties: {
                signals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      signal_type: { type: "string" },
                      strength: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["symbol", "signal_type", "strength", "reasoning"],
                  },
                },
              },
              required: ["signals"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_signals" } },
      }),
    });

    let signals: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        signals = (parsed.signals || []).filter((s: any) => s.strength >= 0.6).slice(0, 15);
      }
    }

    if (signals.length > 0) {
      await supabase.from("signals").insert(signals.map((s: any) => ({
        symbol: s.symbol, signal_type: s.signal_type, strength: s.strength,
        source_agent: "Market Scanner",
        metadata: { reasoning: s.reasoning },
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      })));
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Market Scanner", log_type: "info",
      message: `${marketOpen ? "HYPER" : "STANDARD"} scan: ${scanSymbols.length} symbols → ${signals.length} signals (universe: ${universe.length})`,
    });

    await supabase.from("agent_state").update({
      metric_value: String(signals.length), metric_label: "signals / scan",
      last_action: `${marketOpen ? "Hyper" : "Standard"} scan: ${scanSymbols.length} symbols`,
      last_action_at: new Date().toISOString(), status: "idle",
    }).eq("agent_name", "Market Scanner");

    // NO Discord messages from scanner — orchestrator sends consolidated briefs only

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
