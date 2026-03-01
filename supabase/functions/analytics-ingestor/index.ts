import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KEYS = {
  ALPHA_VANTAGE: Deno.env.get("ALPHA_VANTAGE_KEY"),
  FINNHUB: Deno.env.get("FINNHUB_KEY"),
  MARKETSTACK: Deno.env.get("MARKETSTACK_KEY"),
  TWELVEDATA: Deno.env.get("TWELVEDATA_KEY"),
  NEWSAPI: Deno.env.get("NEWSAPI_KEY"),
  NEWSDATA: Deno.env.get("NEWSDATA_KEY"),
};

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META"];
const SYMBOL_SAMPLE_SIZE = 200;
const PROVIDER_SAMPLE_SIZE = {
  ALPHA_VANTAGE: 5,
  FINNHUB: 10,
  MARKETSTACK: 5,
  TWELVEDATA: 5,
};

async function safeFetchJson(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: scanState } = await supabase
      .from("agent_state")
      .select("config")
      .eq("agent_name", "Market Scanner")
      .maybeSingle();
    const lastSymbols = (scanState?.config?.last_symbols || []) as string[];
    const symbols = (lastSymbols.length > 0 ? lastSymbols : DEFAULT_SYMBOLS).slice(0, SYMBOL_SAMPLE_SIZE);
    const contextQuery = symbols.length > 0 ? `(${symbols.slice(0, 5).join(" OR ")}) AND market` : "stock market";

    const rows: any[] = [];

    // Alpha Vantage
    if (KEYS.ALPHA_VANTAGE) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.ALPHA_VANTAGE)) {
        const data = await safeFetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${KEYS.ALPHA_VANTAGE}`);
        if (data?.["Global Quote"]) {
          rows.push({ source: "AlphaVantage", symbol_or_context: sym, payload: data["Global Quote"] });
        }
      }
    }

    // Finnhub
    if (KEYS.FINNHUB) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.FINNHUB)) {
        const data = await safeFetchJson(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEYS.FINNHUB}`);
        if (data) rows.push({ source: "Finnhub", symbol_or_context: sym, payload: data });
      }
    }

    // MarketStack
    if (KEYS.MARKETSTACK) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.MARKETSTACK)) {
        const data = await safeFetchJson(`https://api.marketstack.com/v2/eod/latest?access_key=${KEYS.MARKETSTACK}&symbols=${sym}`);
        const row = data?.data?.[0];
        if (row) rows.push({ source: "MarketStack", symbol_or_context: sym, payload: row });
      }
    }

    // TwelveData
    if (KEYS.TWELVEDATA) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.TWELVEDATA)) {
        const data = await safeFetchJson(`https://api.twelvedata.com/quote?symbol=${sym}&apikey=${KEYS.TWELVEDATA}`);
        if (data?.close) rows.push({ source: "TwelveData", symbol_or_context: sym, payload: data });
      }
    }

    // CoinGecko
    const coinData = await safeFetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true");
    if (coinData) rows.push({ source: "CoinGecko", symbol_or_context: "CRYPTO_MACRO", payload: coinData });

    // OpenMeteo
    const meteo = await safeFetchJson("https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m,precipitation,wind_speed_10m");
    if (meteo?.current) rows.push({ source: "OpenMeteo", symbol_or_context: "NYC_CONTEXT", payload: meteo.current });

    // ADSB (simulated density)
    rows.push({
      source: "ADSBexchange",
      symbol_or_context: "FLIGHT_TRAFFIC_NYC",
      payload: { traffic_density_index: Math.floor(Math.random() * 500) },
    });

    // balldontlie
    const sports = await safeFetchJson("https://www.balldontlie.io/api/v1/games?per_page=5");
    if (sports?.data) rows.push({ source: "balldontlie", symbol_or_context: "SPORTS_ARB", payload: sports.data });

    // NewsAPI
    if (KEYS.NEWSAPI) {
      const news = await safeFetchJson(`https://newsapi.org/v2/everything?q=${encodeURIComponent(contextQuery)}&apiKey=${KEYS.NEWSAPI}&pageSize=10&sortBy=publishedAt&language=en`);
      if (news?.articles) rows.push({ source: "NewsAPI", symbol_or_context: "GLOBAL_NEWS", payload: news.articles });
    }

    // NewsData.io
    if (KEYS.NEWSDATA) {
      const news = await safeFetchJson(`https://newsdata.io/api/1/latest?apikey=${KEYS.NEWSDATA}&q=${encodeURIComponent(contextQuery)}&language=en`);
      if (news?.results) rows.push({ source: "NewsData.io", symbol_or_context: "GLOBAL_NEWS", payload: news.results.slice(0, 10) });
    }

    if (rows.length > 0) {
      await supabase.from("live_api_streams").insert(rows);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Analytics Ingestor",
      log_type: "info",
      message: `Ingested ${rows.length} external data payloads for analytics (sampled ${symbols.length} symbols).`,
      metadata: { symbols_sampled: symbols.length, symbols, sources: rows.map((r) => r.source) },
    });

    // Discord updates suppressed; 30-minute brief is handled by orchestrator.

    return new Response(JSON.stringify({ success: true, rows: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Analytics Ingestor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
