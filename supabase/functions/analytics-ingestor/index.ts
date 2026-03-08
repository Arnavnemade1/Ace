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
  ALPACA_KEY: Deno.env.get("ALPACA_API_KEY"),
  ALPACA_SECRET: Deno.env.get("ALPACA_API_SECRET"),
};

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META"];
const MACRO_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "XLE", "XLF", "XLK", "SMH", "TLT", "GLD", "USO", "BTCUSD"];
const SYMBOL_SAMPLE_SIZE = 200;
const PROVIDER_SAMPLE_SIZE = {
  ALPHA_VANTAGE: 5,
  FINNHUB: 10,
  MARKETSTACK: 5,
  TWELVEDATA: 5,
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parsePublishedAt(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function symbolKeywords(symbols: string[]) {
  return [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

function extractNewsKeywords(article: any) {
  return symbolKeywords([
    ...(Array.isArray(article?.keywords) ? article.keywords : []),
    ...(Array.isArray(article?.symbols) ? article.symbols : []),
    ...(Array.isArray(article?.category) ? article.category : []),
  ]);
}

function deriveFallbackKeywords(text: string) {
  const input = text.toLowerCase();
  const keywords = ["SPY", "QQQ"];
  if (/(oil|energy|crude|opec|gas)/.test(input)) keywords.push("USO", "XLE", "OXY", "XOM");
  if (/(bitcoin|crypto|ethereum|token|coinbase)/.test(input)) keywords.push("BTCUSD", "COIN");
  if (/(nvidia|ai|artificial intelligence|semiconductor|chip)/.test(input)) keywords.push("NVDA", "SMH", "QQQ");
  if (/(fed|rates|bond|treasury|inflation|yield)/.test(input)) keywords.push("TLT", "XLF", "JPM");
  if (/(defense|war|pentagon|military|missile|conflict)/.test(input)) keywords.push("LMT", "RTX", "NOC", "GD");
  if (/(travel|airline|hotel|cruise)/.test(input)) keywords.push("ABNB", "BKNG", "DAL", "UAL");
  return symbolKeywords(keywords);
}

function scoreSentimentHint(text: string): number {
  const input = text.toLowerCase();
  const bullish = (input.match(/surge|soar|beat|record|upgrade|growth|profit|breakout|bullish|rally|expansion/g) || []).length;
  const bearish = (input.match(/drop|miss|downgrade|loss|crash|bearish|cut|warning|war|conflict|tariff|investigation/g) || []).length;
  if (bullish === 0 && bearish === 0) return 0;
  const raw = (bullish - bearish) / Math.max(bullish + bearish, 1);
  return Number(raw.toFixed(3));
}

function normalizeQuote(source: string, symbol: string, payload: any, fallbackAsOf = new Date().toISOString()) {
  if (!payload) return null;

  if (source === "AlphaVantage") {
    return {
      source,
      symbol,
      price: toNumber(payload["05. price"]),
      open: toNumber(payload["02. open"]),
      high: toNumber(payload["03. high"]),
      low: toNumber(payload["04. low"]),
      prev_close: toNumber(payload["08. previous close"]),
      change_percent: toNumber(String(payload["10. change percent"] || "").replace("%", "")),
      volume: toNumber(payload["06. volume"]),
      as_of: parsePublishedAt(payload["07. latest trading day"]) || fallbackAsOf,
      payload,
    };
  }

  if (source === "Finnhub") {
    return {
      source,
      symbol,
      price: toNumber(payload.c),
      open: toNumber(payload.o),
      high: toNumber(payload.h),
      low: toNumber(payload.l),
      prev_close: toNumber(payload.pc),
      change_percent: payload.pc ? Number((((Number(payload.c) - Number(payload.pc)) / Number(payload.pc)) * 100).toFixed(3)) : null,
      volume: null,
      as_of: payload.t ? new Date(Number(payload.t) * 1000).toISOString() : fallbackAsOf,
      payload,
    };
  }

  if (source === "MarketStack") {
    return {
      source,
      symbol,
      price: toNumber(payload.close),
      open: toNumber(payload.open),
      high: toNumber(payload.high),
      low: toNumber(payload.low),
      prev_close: toNumber(payload.previous_close),
      change_percent: toNumber(payload.change_pct),
      volume: toNumber(payload.volume),
      as_of: parsePublishedAt(payload.date) || fallbackAsOf,
      payload,
    };
  }

  if (source === "TwelveData") {
    return {
      source,
      symbol,
      price: toNumber(payload.close),
      open: toNumber(payload.open),
      high: toNumber(payload.high),
      low: toNumber(payload.low),
      prev_close: toNumber(payload.previous_close),
      change_percent: payload.percent_change ? toNumber(String(payload.percent_change).replace("%", "")) : null,
      volume: toNumber(payload.volume),
      as_of: parsePublishedAt(payload.datetime) || fallbackAsOf,
      payload,
    };
  }

  if (source === "AlpacaSnapshot") {
    const latestTrade = payload.latestTrade || {};
    const dailyBar = payload.dailyBar || {};
    const prevDailyBar = payload.prevDailyBar || {};
    const price = toNumber(latestTrade.p) ?? toNumber(dailyBar.c);
    const prevClose = toNumber(prevDailyBar.c) ?? toNumber(dailyBar.o);
    return {
      source,
      symbol,
      price,
      open: toNumber(dailyBar.o),
      high: toNumber(dailyBar.h),
      low: toNumber(dailyBar.l),
      prev_close: prevClose,
      change_percent: price !== null && prevClose ? Number((((price - prevClose) / prevClose) * 100).toFixed(3)) : null,
      volume: toNumber(dailyBar.v),
      as_of: latestTrade.t || dailyBar.t || fallbackAsOf,
      payload,
    };
  }

  return null;
}

function normalizeNewsArticle(source: string, article: any) {
  const title = String(article?.title || article?.headline || "").trim();
  if (!title) return null;

  const summary = String(article?.description || article?.content || article?.summary || "").trim() || null;
  const url = String(article?.url || article?.link || "").trim() || null;
  const publishedAt =
    parsePublishedAt(article?.publishedAt) ||
    parsePublishedAt(article?.pubDate) ||
    parsePublishedAt(article?.datetime) ||
    parsePublishedAt(article?.created_at);
  const symbols = symbolKeywords(Array.isArray(article?.symbols) ? article.symbols : []);
  const text = `${title} ${summary || ""}`;
  const keywords = (() => {
    const explicit = extractNewsKeywords(article);
    return explicit.length > 0 ? explicit : deriveFallbackKeywords(text);
  })();

  return {
    source,
    external_id: String(article?.article_id || article?.id || url || `${source}:${title.toLowerCase()}`),
    title,
    summary,
    url,
    published_at: publishedAt,
    symbols,
    sentiment_hint: scoreSentimentHint(text),
    keywords,
    payload: article,
  };
}

async function safeFetchJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
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
    const macroSymbols = [...new Set([...MACRO_SYMBOLS, ...symbols.slice(0, 12)])].filter((s) => s !== "BTCUSD");

    const rows: any[] = [];
    const normalizedQuotes: any[] = [];
    const normalizedArticles: any[] = [];
    const nowIso = new Date().toISOString();

    // Alpha Vantage
    if (KEYS.ALPHA_VANTAGE) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.ALPHA_VANTAGE)) {
        const data = await safeFetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${KEYS.ALPHA_VANTAGE}`);
        if (data?.["Global Quote"]) {
          const payload = data["Global Quote"];
          rows.push({ source: "AlphaVantage", symbol_or_context: sym, payload });
          const quote = normalizeQuote("AlphaVantage", sym, payload, nowIso);
          if (quote) normalizedQuotes.push(quote);
        }
      }
    }

    // Finnhub
    if (KEYS.FINNHUB) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.FINNHUB)) {
        const data = await safeFetchJson(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${KEYS.FINNHUB}`);
        if (data) {
          rows.push({ source: "Finnhub", symbol_or_context: sym, payload: data });
          const quote = normalizeQuote("Finnhub", sym, data, nowIso);
          if (quote) normalizedQuotes.push(quote);
        }
      }
    }

    // MarketStack
    if (KEYS.MARKETSTACK) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.MARKETSTACK)) {
        const data = await safeFetchJson(`https://api.marketstack.com/v2/eod/latest?access_key=${KEYS.MARKETSTACK}&symbols=${sym}`);
        const row = data?.data?.[0];
        if (row) {
          rows.push({ source: "MarketStack", symbol_or_context: sym, payload: row });
          const quote = normalizeQuote("MarketStack", sym, row, nowIso);
          if (quote) normalizedQuotes.push(quote);
        }
      }
    }

    // TwelveData
    if (KEYS.TWELVEDATA) {
      for (const sym of symbols.slice(0, PROVIDER_SAMPLE_SIZE.TWELVEDATA)) {
        const data = await safeFetchJson(`https://api.twelvedata.com/quote?symbol=${sym}&apikey=${KEYS.TWELVEDATA}`);
        if (data?.close) {
          rows.push({ source: "TwelveData", symbol_or_context: sym, payload: data });
          const quote = normalizeQuote("TwelveData", sym, data, nowIso);
          if (quote) normalizedQuotes.push(quote);
        }
      }
    }

    // Alpaca snapshots for macro tape and recent market structure
    if (KEYS.ALPACA_KEY && KEYS.ALPACA_SECRET && macroSymbols.length > 0) {
      const alpaca = await safeFetchJson(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${macroSymbols.join(",")}`,
        {
          headers: {
            "APCA-API-KEY-ID": KEYS.ALPACA_KEY,
            "APCA-API-SECRET-KEY": KEYS.ALPACA_SECRET,
          },
        }
      );
      if (alpaca) {
        for (const [sym, payload] of Object.entries(alpaca)) {
          rows.push({ source: "AlpacaSnapshot", symbol_or_context: sym, payload });
          const quote = normalizeQuote("AlpacaSnapshot", sym, payload, nowIso);
          if (quote) normalizedQuotes.push(quote);
        }
      }
    }

    // CoinGecko
    const coinData = await safeFetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true");
    if (coinData) {
      rows.push({ source: "CoinGecko", symbol_or_context: "CRYPTO_MACRO", payload: coinData });
      const btc = coinData?.bitcoin;
      if (btc?.usd) {
        normalizedQuotes.push({
          source: "CoinGecko",
          symbol: "BTCUSD",
          price: toNumber(btc.usd),
          open: null,
          high: null,
          low: null,
          prev_close: null,
          change_percent: toNumber(btc.usd_24h_change),
          volume: null,
          as_of: nowIso,
          payload: btc,
        });
      }
    }

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
      if (news?.articles) {
        rows.push({ source: "NewsAPI", symbol_or_context: "GLOBAL_NEWS", payload: news.articles });
        normalizedArticles.push(...news.articles.map((article: any) => normalizeNewsArticle("NewsAPI", article)).filter(Boolean));
      }
    }

    // NewsData.io
    if (KEYS.NEWSDATA) {
      const news = await safeFetchJson(`https://newsdata.io/api/1/latest?apikey=${KEYS.NEWSDATA}&q=${encodeURIComponent(contextQuery)}&language=en`);
      if (news?.results) {
        const batch = news.results.slice(0, 10);
        rows.push({ source: "NewsData.io", symbol_or_context: "GLOBAL_NEWS", payload: batch });
        normalizedArticles.push(...batch.map((article: any) => normalizeNewsArticle("NewsData.io", article)).filter(Boolean));
      }
    }

    if (rows.length > 0) {
      await supabase.from("live_api_streams").insert(rows);
    }

    if (normalizedQuotes.length > 0) {
      await supabase.from("market_quotes").insert(normalizedQuotes);
    }

    if (normalizedArticles.length > 0) {
      await supabase.from("news_articles").upsert(normalizedArticles, { onConflict: "source,external_id" });
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Analytics Ingestor",
      log_type: "info",
      message: `Ingested ${rows.length} external payloads, ${normalizedQuotes.length} normalized quotes, ${normalizedArticles.length} normalized articles.`,
      metadata: {
        symbols_sampled: symbols.length,
        symbols,
        macro_symbols: macroSymbols,
        sources: rows.map((r) => r.source),
        normalized_quotes: normalizedQuotes.length,
        normalized_articles: normalizedArticles.length,
      },
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
