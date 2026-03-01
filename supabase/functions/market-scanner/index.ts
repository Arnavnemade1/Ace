import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_WATCHLIST = ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META", "AMD", "GOOGL"];
const MAX_SYMBOLS_PER_REQUEST = 100;
const DEFAULT_SCAN_SIZE = 200;
const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS"]);

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function sanitizeSymbol(sym: string): string | null {
  const clean = sym?.trim().toUpperCase();
  if (!clean) return null;
  // Avoid symbols with dots/dashes that often fail on snapshot endpoints
  if (!/^[A-Z]{1,5}$/.test(clean)) return null;
  return clean;
}

async function fetchUniverse(alpacaKey: string, alpacaSecret: string): Promise<string[]> {
  try {
    const res = await fetch("https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity", {
      headers: {
        "APCA-API-KEY-ID": alpacaKey,
        "APCA-API-SECRET-KEY": alpacaSecret,
      },
    });
    if (!res.ok) return [];
    const assets = await res.json();
    const symbols = (assets || [])
      .filter((a: any) => a?.tradable && a?.status === "active" && ALLOWED_EXCHANGES.has(a?.exchange))
      .map((a: any) => sanitizeSymbol(a?.symbol))
      .filter(Boolean) as string[];
    return Array.from(new Set(symbols)).sort();
  } catch {
    return [];
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Market Scanner");

    const scanSize = Number(Deno.env.get("MARKET_SCAN_SIZE") || DEFAULT_SCAN_SIZE);
    const universe = await fetchUniverse(ALPACA_API_KEY, ALPACA_API_SECRET);
    const effectiveUniverse = universe.length > 0 ? universe : FALLBACK_WATCHLIST;

    const { data: stateRow } = await supabase
      .from("agent_state")
      .select("config")
      .eq("agent_name", "Market Scanner")
      .maybeSingle();
    const config = (stateRow?.config || {}) as Record<string, any>;
    const cursor = Number(config.scan_cursor || 0);
    const sliceSize = Math.min(scanSize, effectiveUniverse.length);
    const scanSymbols: string[] = [];
    for (let i = 0; i < sliceSize; i++) {
      scanSymbols.push(effectiveUniverse[(cursor + i) % effectiveUniverse.length]);
    }
    const nextCursor = (cursor + scanSymbols.length) % effectiveUniverse.length;

    await supabase.from("agent_state").update({
      config: {
        ...config,
        scan_cursor: nextCursor,
        last_symbols: scanSymbols,
        universe_size: effectiveUniverse.length,
        last_scan_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Market Scanner");

    let snapshots: Record<string, any> = {};
    for (const group of chunk(scanSymbols, MAX_SYMBOLS_PER_REQUEST)) {
      const snapRes = await fetch(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${group.join(",")}`,
        {
          headers: {
            "APCA-API-KEY-ID": ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
          },
        }
      );
      if (snapRes.ok) {
        const data = await snapRes.json();
        snapshots = { ...snapshots, ...(data || {}) };
      }
    }

    const streamRows = scanSymbols.map((symbol) => {
      const snap = snapshots[symbol];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c;
      if (!price) return null;
      return {
        source: "AlpacaSnapshot",
        symbol_or_context: symbol,
        payload: {
          symbol,
          price,
          change_pct: snap?.prevDailyBar?.c ? ((price - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100 : null,
          volume: snap?.dailyBar?.v || 0,
          high: snap?.dailyBar?.h || 0,
          low: snap?.dailyBar?.l || 0,
          vwap: snap?.dailyBar?.vw || 0,
          ts: new Date().toISOString(),
        },
      };
    }).filter(Boolean) as any[];

    if (streamRows.length > 0) {
      await supabase.from("live_api_streams").insert(streamRows);
    }

    const ranked = scanSymbols
      .map((symbol) => {
        const snap = snapshots[symbol];
        const price = snap?.latestTrade?.p || snap?.dailyBar?.c || 0;
        const prevClose = snap?.prevDailyBar?.c || snap?.dailyBar?.o || price;
        const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;
        const vol = snap?.dailyBar?.v || 0;
        return { symbol, price, change, vol, snap };
      })
      .filter((row) => row.price > 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 40);

    const marketContext = ranked.map((row) => {
      const snap = row.snap;
      const high = snap?.dailyBar?.h || 0;
      const low = snap?.dailyBar?.l || 0;
      const vwap = snap?.dailyBar?.vw || 0;
      return `${row.symbol}: Price=$${row.price.toFixed(2)}, Change=${row.change.toFixed(2)}%, Vol=${row.vol}, High=$${high}, Low=$${low}, VWAP=$${vwap}`;
    }).join("\n");

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
            content: `You are the Market Scanner agent of a cautious autonomous paper trading system. Analyze REAL market data and identify ONLY high-quality signals.

For each signal, provide:
- symbol
- signal_type: "momentum_long", "momentum_short", "mean_reversion_long", "mean_reversion_short", "breakout", "breakdown", "vol_spike"
- strength: 0.0 to 1.0
- reasoning: brief explanation

IMPORTANT:
- Return only signals with strength >= 0.6.
- Prefer liquidity, strong trend confirmation, and clean setups.
- If data quality is weak, return fewer signals rather than forcing trades.
- Max 10 signals total.`,
          },
          {
            role: "user",
            content: `Current REAL market data (top movers from a full-market sweep of ${scanSymbols.length} symbols):\n${marketContext}\n\nFind high-quality signals only.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_signals",
              description: "Report detected market signals",
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
          },
        ],
        tool_choice: { type: "function", function: { name: "report_signals" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway error: ${aiResponse.status} — ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let signals: any[] = [];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      signals = parsed.signals || [];
    }

    // Store signals in database
    const filteredSignals = (signals || [])
      .filter((s: any) => Number(s.strength || 0) >= 0.6)
      .slice(0, 10);

    if (filteredSignals.length > 0) {
      const signalRows = filteredSignals.map((s: any) => ({
        symbol: s.symbol,
        signal_type: s.signal_type,
        strength: s.strength,
        source_agent: "Market Scanner",
        metadata: { reasoning: s.reasoning, market_data: snapshots[s.symbol]?.dailyBar || {} },
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      }));

      await supabase.from("signals").insert(signalRows);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Market Scanner",
      log_type: "info",
      message: `Scanned ${scanSymbols.length} symbols (sweep of ${effectiveUniverse.length}), found ${filteredSignals.length} signals`,
      metadata: { symbols_scanned: scanSymbols, signal_count: filteredSignals.length, universe_size: effectiveUniverse.length },
    });

    await supabase.from("agent_state").update({
      metric_value: String(filteredSignals.length),
      metric_label: "signals / hr",
      last_action: `Scanned ${scanSymbols.length} symbols (market sweep)`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Market Scanner");

    return new Response(JSON.stringify({ success: true, signals_found: filteredSignals.length, signals: filteredSignals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Market Scanner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
