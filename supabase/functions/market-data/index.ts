import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
    if (!ALPACA_API_KEY || !ALPACA_API_SECRET) throw new Error("Alpaca keys not configured");

    const body = await req.json().catch(() => ({}));
    const symbols = body.symbols || ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "XLE", "USO", "MSFT", "AMZN", "META"];

    // Fetch snapshots
    const snapshotsRes = await fetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(",")}`,
      {
        headers: {
          "APCA-API-KEY-ID": ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": ALPACA_API_SECRET,
        },
      }
    );

    if (!snapshotsRes.ok) {
      const err = await snapshotsRes.text();
      throw new Error(`Alpaca error: ${snapshotsRes.status} — ${err}`);
    }

    const snapshots = await snapshotsRes.json();

    // Fetch account
    const accRes = await fetch("https://paper-api.alpaca.markets/v2/account", {
      headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
    });
    const account = accRes.ok ? await accRes.json() : null;

    // Fetch positions
    const posRes = await fetch("https://paper-api.alpaca.markets/v2/positions", {
      headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
    });
    const positions = posRes.ok ? await posRes.json() : [];

    return new Response(JSON.stringify({ snapshots, account, positions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Market data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
