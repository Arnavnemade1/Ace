import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GET_SECRET = (key: string) => Deno.env.get(key) || "";
const NY_TZ = "America/New_York";
const ALPACA_URL = "https://paper-api.alpaca.markets";
const ALPACA_DATA = "https://data.alpaca.markets";
const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// AI Gateway with Gemini fallback to minimize costs
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error.message?.includes("429") || error.message?.toLowerCase().includes("rate limit");
      if (isRateLimit && i < maxRetries - 1) {
        console.log(`[Retry] 429/Rate Limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  return await fn();
}

async function callAI(lovableKey: string, geminiKey: string, messages: any[], jsonMode = true): Promise<string> {
  // Try Lovable AI first (with retry)
  if (lovableKey) {
    try {
      const content = await withRetry(async () => {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Lovable API error: ${res.status}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty content from Lovable");
        return content;
      }, 3, 1000); // 3 retries for Lovable

      if (content) return content;
    } catch (e) {
      console.log("Lovable AI failed after retries, falling back to Gemini direct:", e.message);
    }
  }

  // Fallback to Gemini direct API
  if (!geminiKey) throw new Error("No AI keys available (both Lovable and Gemini missing)");

  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";
  const userMsg = messages.find((m: any) => m.role === "user")?.content || "";

  return await withRetry(async () => {
    const geminiRes = await fetch(`${GEMINI_DIRECT_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemMsg}\n\n${userMsg}` }] }],
        generationConfig: {
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });
    if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`);
    const geminiData = await geminiRes.json();
    return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  });
}

// ── WIDE UNIVERSE: 80+ diverse stocks across sectors ──
const UNIVERSE = {
  TECH: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "CRM", "ADBE", "ORCL", "NFLX"],
  SEMIS: ["AMD", "INTC", "MU", "AVGO", "QCOM", "TSM", "ARM", "SMCI", "MRVL"],
  FINTECH: ["JPM", "BAC", "GS", "V", "MA", "PYPL", "SOFI", "COIN", "SQ"],
  CLOUD_AI: ["PLTR", "SNOW", "DDOG", "NET", "CRWD", "PANW", "NOW", "ZS"],
  RETAIL: ["WMT", "COST", "TGT", "HD", "NKE", "LULU", "SBUX", "MCD"],
  ENERGY: ["XOM", "CVX", "OXY", "SLB", "ENPH", "FSLR", "NEE"],
  HEALTH: ["UNH", "LLY", "JNJ", "PFE", "ABBV", "MRNA", "AMGN"],
  DEFENSE: ["LMT", "RTX", "GD", "NOC", "BA"],
  TRAVEL: ["ABNB", "BKNG", "MAR", "DAL", "UAL", "RCL"],
  EV_AUTO: ["TSLA", "RIVN", "LCID", "F", "GM", "UBER", "LYFT"],
  ETFS: ["SPY", "QQQ", "IWM", "DIA", "GLD", "TLT", "XLE", "XLF", "XLK", "SMH", "ARKK"],
  VOLATILE: ["RDDT", "DKNG", "MSTR", "HOOD", "RBLX"],
};
const ALL_SYMBOLS = [...new Set(Object.values(UNIVERSE).flat())];
const SECTOR_NAMES = Object.keys(UNIVERSE);

type OperatorMindset = "defensive" | "balanced" | "aggressive";

const MINDSET_PROFILES: Record<OperatorMindset, {
  allocationMultiplier: number;
  minCashBufferRatio: number;
  maxOpenPositions: number;
  buyConvictionFloor: number;
  promptLabel: string;
}> = {
  defensive: {
    allocationMultiplier: 0.65,
    minCashBufferRatio: 0.25,
    maxOpenPositions: 8,
    buyConvictionFloor: 0.88,
    promptLabel: "capital preservation mode (defensive)"
  },
  balanced: {
    allocationMultiplier: 1,
    minCashBufferRatio: 0.15,
    maxOpenPositions: 15,
    buyConvictionFloor: 0.8,
    promptLabel: "balanced mode"
  },
  aggressive: {
    allocationMultiplier: 1.35,
    minCashBufferRatio: 0.1,
    maxOpenPositions: 20,
    buyConvictionFloor: 0.75,
    promptLabel: "offensive mode (aggressive)"
  }
};

function normalizeMindset(raw: unknown): OperatorMindset {
  return raw === "defensive" || raw === "aggressive" ? raw : "balanced";
}

function isMarketOpen(): boolean {
  const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: NY_TZ }));
  const day = nowNY.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function alpacaGet(path: string, key: string, secret: string) {
  const res = await fetch(`${ALPACA_URL}${path}`, {
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchSnapshots(symbols: string[], key: string, secret: string) {
  const all: Record<string, any> = {};
  // Batch in chunks of 50
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    try {
      const res = await fetch(
        `${ALPACA_DATA}/v2/stocks/snapshots?symbols=${batch.join(",")}`,
        { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } }
      );
      if (res.ok) {
        const data = await res.json();
        Object.assign(all, data);
      }
    } catch { }
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(GET_SECRET("SUPABASE_URL"), GET_SECRET("SUPABASE_SERVICE_ROLE_KEY"));
  const LOVABLE_API_KEY = GET_SECRET("LOVABLE_API_KEY");
  const GEMINI_API_KEY = GET_SECRET("GEMINI_API_KEY");
  const ALPACA_KEY = GET_SECRET("ALPACA_API_KEY");
  const ALPACA_SECRET = GET_SECRET("ALPACA_API_SECRET");
  const DISCORD_WEBHOOK_URL = GET_SECRET("DISCORD_WEBHOOK_URL");

  // ── DISCORD: Only send via this function, consolidated every 30 min ──
  const sendDiscordBrief = async (embeds: any[]) => {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds }),
      });
    } catch (e) { console.error("Discord failed:", e); }
  };

  try {
    console.log("--- ACE_OS Orchestrator Cycle ---");
    if (!ALPACA_KEY || !ALPACA_SECRET) throw new Error("Missing Alpaca credentials");
    if (!LOVABLE_API_KEY && !GEMINI_API_KEY) throw new Error("Missing AI keys (need LOVABLE_API_KEY or GEMINI_API_KEY)");

    // ═══════════════════════════════════════════════════
    // 0. CHECK DISCORD RATE LIMIT (30 MIN)
    // ═══════════════════════════════════════════════════
    const { data: orchestratorState } = await supabase
      .from("agent_state")
      .select("config")
      .eq("agent_name", "Swarm Orchestrator")
      .maybeSingle();

    const operatorMindset = normalizeMindset(orchestratorState?.config?.operator_mindset);
    const mindsetProfile = MINDSET_PROFILES[operatorMindset];

    const lastDiscordAt = orchestratorState?.config?.last_discord_at
      ? new Date(orchestratorState.config.last_discord_at).getTime()
      : 0;
    const timeSinceDiscord = Date.now() - lastDiscordAt;
    const shouldSendDiscord = timeSinceDiscord >= 30 * 60 * 1000; // 30 minutes

    // ═══════════════════════════════════════════════════
    // 1. FETCH FULL ACCOUNT STATE
    // ═══════════════════════════════════════════════════
    const [account, positions, openOrders, clock] = await Promise.all([
      alpacaGet("/v2/account", ALPACA_KEY, ALPACA_SECRET),
      alpacaGet("/v2/positions", ALPACA_KEY, ALPACA_SECRET),
      alpacaGet("/v2/orders?status=open", ALPACA_KEY, ALPACA_SECRET),
      alpacaGet("/v2/clock", ALPACA_KEY, ALPACA_SECRET),
    ]);

    if (!account) throw new Error("Alpaca account fetch failed");

    const marketOpen = clock?.is_open ?? isMarketOpen();
    const equity = parseFloat(account.equity || "0");
    const cash = parseFloat(account.cash || "0");
    const buyingPower = parseFloat(account.buying_power || "0");
    const lastEquity = parseFloat(account.last_equity || account.equity || "0");
    const dailyPnl = equity - lastEquity;
    const dailyPnlPct = lastEquity > 0 ? (dailyPnl / lastEquity) * 100 : 0;
    const posArr = Array.isArray(positions) ? positions : [];
    const ordersArr = Array.isArray(openOrders) ? openOrders : [];
    const heldSymbols = posArr.map((p: any) => p.symbol);
    const openOrderSymbols = new Set(ordersArr.map((o: any) => o.symbol));

    // ═══════════════════════════════════════════════════
    // 2. HYPER-ANALYTICS: Scan wide during market hours
    // ═══════════════════════════════════════════════════
    // Market open → scan ALL 80+ symbols (hyper mode)
    // Market closed → scan 30 random for pre-market prep
    const scanSymbols = marketOpen
      ? ALL_SYMBOLS
      : ALL_SYMBOLS.sort(() => 0.5 - Math.random()).slice(0, 30);

    console.log(`HYPER MODE: ${marketOpen ? "ON" : "OFF"} | Scanning ${scanSymbols.length} symbols`);

    const snapshots = await fetchSnapshots(scanSymbols, ALPACA_KEY, ALPACA_SECRET);

    // Build ranked movers with sector tags
    const sectorMap: Record<string, string> = {};
    for (const [sector, syms] of Object.entries(UNIVERSE)) {
      for (const s of syms) sectorMap[s] = sector;
    }

    const movers = scanSymbols.map(sym => {
      const snap = snapshots[sym];
      if (!snap) return null;
      const price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
      const prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || price;
      const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      const vol = snap.dailyBar?.v || 0;
      const held = heldSymbols.includes(sym);
      const posData = posArr.find((p: any) => p.symbol === sym);
      const pnl = posData ? parseFloat(posData.unrealized_pl || "0") : 0;
      return { sym, price, changePct, vol, held, pnl, sector: sectorMap[sym] || "OTHER" };
    }).filter(Boolean).sort((a: any, b: any) => Math.abs(b.changePct) - Math.abs(a.changePct));

    // ═══════════════════════════════════════════════════
    // 3. LOSS REFLECTION: Analyze recent losing trades
    // ═══════════════════════════════════════════════════
    const { data: recentTrades } = await supabase
      .from("trades")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(20);

    const losers = (recentTrades || []).filter((t: any) => t.pnl !== null && t.pnl < 0);
    const winners = (recentTrades || []).filter((t: any) => t.pnl !== null && t.pnl > 0);
    const totalRealized = (recentTrades || []).reduce((s: number, t: any) => s + (t.pnl || 0), 0);

    const lossReflection = losers.length > 0
      ? `RECENT LOSSES (${losers.length} trades, total: $${losers.reduce((s: number, t: any) => s + t.pnl, 0).toFixed(2)}):\n` +
      losers.slice(0, 5).map((t: any) => `  ${t.side} ${t.symbol} x${t.qty} @ $${t.price} → P&L: $${t.pnl?.toFixed(2)} | Reason: ${t.reasoning || "unknown"}`).join("\n")
      : "No recent losses — keep the streak going.";

    const winSummary = winners.length > 0
      ? `RECENT WINS (${winners.length} trades, total: $${winners.reduce((s: number, t: any) => s + t.pnl, 0).toFixed(2)})`
      : "No recent realized wins.";

    // ═══════════════════════════════════════════════════
    // 4. PORTFOLIO DIVERSIFICATION ANALYSIS
    // ═══════════════════════════════════════════════════
    const sectorExposure: Record<string, number> = {};
    let totalExposure = 0;
    for (const p of posArr) {
      const mv = Math.abs(parseFloat(p.market_value || "0"));
      const sec = sectorMap[p.symbol] || "OTHER";
      sectorExposure[sec] = (sectorExposure[sec] || 0) + mv;
      totalExposure += mv;
    }
    const diversificationNote = totalExposure > 0
      ? Object.entries(sectorExposure)
        .map(([sec, val]) => `${sec}: ${((val / totalExposure) * 100).toFixed(1)}%`)
        .join(", ")
      : "No positions — fully diversifiable";

    // Money management: dynamic allocation
    const bpRatio = buyingPower / Math.max(equity, 1);
    let allocationPct = bpRatio > 0.8 ? 0.05 : bpRatio > 0.4 ? 0.03 : 0.015;

    // STRICT RISK MANAGEMENT: Cut allocation on negative daily PnL
    if (dailyPnl < 0) {
      allocationPct = allocationPct * 0.25; // Slash by 75% on down days
    }

    allocationPct = allocationPct * mindsetProfile.allocationMultiplier;

    const maxAllocation = equity * allocationPct;
    const minCashBuffer = equity * mindsetProfile.minCashBufferRatio;
    const maxOpenPositions = mindsetProfile.maxOpenPositions; // Hard cap on number of positions
    const buyConvictionFloor = mindsetProfile.buyConvictionFloor;
    const isAtPositionCap = posArr.length >= maxOpenPositions;

    // ═══════════════════════════════════════════════════
    // 5. AI BRAIN: Multi-trade, diversification-aware
    // ═══════════════════════════════════════════════════
    const topMovers = (movers as any[]).slice(0, 40);
    const marketContext = topMovers.map((m: any) =>
      `${m.sym} [${m.sector}]: $${m.price.toFixed(2)} (${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)}%) Vol:${m.vol}${m.held ? ` HELD P&L:$${m.pnl.toFixed(2)}` : ""}`
    ).join("\n");

    const positionsSummary = posArr.length > 0
      ? posArr.map((p: any) => `${p.symbol}: ${p.qty} shares @ $${parseFloat(p.avg_entry_price).toFixed(2)} → $${parseFloat(p.current_price).toFixed(2)} (P&L: $${parseFloat(p.unrealized_pl).toFixed(2)}, ${(parseFloat(p.unrealized_plpc) * 100).toFixed(1)}%)`).join("\n")
      : "EMPTY — need to build positions";

    // Fetch news
    const NEWSDATA_KEY = GET_SECRET("NEWSDATA_KEY");
    let headlines: string[] = [];
    try {
      if (NEWSDATA_KEY) {
        const newsRes = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=stock market finance&language=en`);
        if (newsRes.ok) {
          const nd = await newsRes.json();
          headlines = (nd.results || []).slice(0, 10).map((n: any) => n.title);
        }
      }
    } catch { }

    const brainPrompt = {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are the Omni-Brain of ACE_OS, an elite algorithmic and macro-aware trading system on Alpaca.
You make REAL trades with real money. You must be RUTHLESSLY STRATEGIC, DIVERSIFIED, and CONTEXT-AWARE.
Operator mindset is ${operatorMindset.toUpperCase()} (${mindsetProfile.promptLabel}). Reflect this in position sizing and caution.

═══ MARKET MODE & GEOPOLITICS ═══
Market is currently: ${marketOpen ? "OPEN (DAY TRADING MODE)" : "CLOSED (PREP MODE)"}.
${marketOpen ? "DAY TRADING FOCUS: Look for volatile intraday movers, breakout setups, and quick 1-5% momentum scalps. React instantly to real-time news." : "PREP MODE: Analyze end-of-day data and queue limit orders for tomorrow's open. Set up for gap-ups or overnight momentum carryover."}

GEOPOLITICAL CATALYSTS: You MUST trade based on major world events.
- Wars/Major Conflicts → Target defense (LMT, RTX) and energy/oil (XOM, OXY).
- Fed Rate Hikes/Cuts → Trade financials (JPM, GS) and tech multiples.
- AI & Tech Wars → Watch NVDA, GOOGL, MSFT, PLTR flows.
- Regulatory Shifts/Tariffs → Watch crypto (COIN), supply chain heavily hit retail/tech.

═══ CORE PRINCIPLES & RISK ═══
1. PORTFOLIO CAPS: Current positions: ${posArr.length}/${maxOpenPositions}. ${isAtPositionCap ? "⚠️ AT MAX CAPACITY. You CANNOT BUY new tickers. You may ONLY SELL or hold." : ""}
2. EXPOSURE: ${diversificationNote}. NEVER let a single sector cross 30%.
3. RISK MANAGEMENT: Daily P&L is ${dailyPnl < 0 ? "NEGATIVE. Capital preservation is active. Allocation slashed." : "positive. Normal allocation active."}
   - Max spend per trade: $${maxAllocation.toFixed(0)}.
   - Need >= ${buyConvictionFloor.toFixed(2)} conviction to buy (strict).

4. LOSS REFLECTION:
   ${lossReflection}
   ${winSummary}
   Avoid repeating recent losing patterns. Cut losers down >5%, trim winners up >8%.

═══ DECISION FORMAT ═══
Return valid JSON ONLY (no markdown blocks inside the JSON):
{
  "trades": [
    {"action": "BUY"|"SELL", "symbol": "TICKER", "qty": number, "reasoning": "Be SPECIFIC. Cite exact news, % moves, or macro events driving this. 'Stock is up' is rejected.", "conviction": 0.0-1.0}
  ],
  "market_outlook": "1-2 sentence macro and geopolitical summary",
  "portfolio_health": "1-2 sentence analysis of current allocations",
  "thesis": "Your primary strategic thesis for this precise moment."
}

- Calculate qty: floor(allocation / price).
- NEVER buy if you already hold the ticker. Always diversify.
- If no high-conviction (> ${buyConvictionFloor.toFixed(2)}) trades exist, return an empty "trades" array.`
        },
        {
          role: "user",
          content: `═══ LIVE STATE ═══
Equity: $${equity.toFixed(2)} | Cash: $${cash.toFixed(2)}
Daily P&L: $${dailyPnl.toFixed(2)} (${dailyPnlPct.toFixed(2)}%)
Positions (${posArr.length}/${maxOpenPositions}):
${positionsSummary}

═══ MARKET SCAN (${topMovers.length} top movers) ═══
${marketContext}

═══ NEWS HEADLINES ═══
${headlines.length > 0 ? headlines.map(h => `• ${h}`).join("\n") : "None"}

Execute strategy.`
        }
      ],
    };

    const aiContent = await callAI(LOVABLE_API_KEY, GEMINI_API_KEY, brainPrompt.messages, true);
    if (!aiContent) throw new Error("Empty AI response");

    let brain: any;
    try {
      brain = JSON.parse(aiContent);
    } catch {
      // Try extracting JSON from markdown
      const match = aiContent.match(/\{[\s\S]*\}/);
      brain = match ? JSON.parse(match[0]) : { trades: [], market_outlook: "Parse failed", portfolio_health: "Unknown", loss_lessons: "N/A" };
    }

    const trades = Array.isArray(brain.trades) ? brain.trades : (brain.action ? [brain] : []);

    // ═══════════════════════════════════════════════════
    // 6. EXECUTE TRADES (up to 3 per cycle)
    // ═══════════════════════════════════════════════════
    const executionResults: any[] = [];

    for (const trade of trades.slice(0, 3)) {
      const sym = trade.symbol;
      const action = trade.action;
      const conviction = trade.conviction || 0;
      let tradeQty = Math.max(1, Math.min(trade.qty || 1, 50));

      // Skip low conviction (strictly enforced)
      if (conviction < buyConvictionFloor && action === "BUY") {
        executionResults.push({ symbol: sym, status: "SKIPPED", reason: `Low conviction for BUY: ${conviction}` });
        continue;
      }

      // Enforce position cap strictly
      if (action === "BUY" && isAtPositionCap && !heldSymbols.includes(sym)) {
        executionResults.push({ symbol: sym, status: "SKIPPED", reason: "Max position cap reached" });
        continue;
      }

      // Skip if open order exists
      if (openOrderSymbols.has(sym)) {
        executionResults.push({ symbol: sym, status: "SKIPPED", reason: "Open order exists" });
        continue;
      }

      const snap = snapshots[sym];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c || 0;

      if (action === "BUY") {
        // Cash buffer check
        if (cash < minCashBuffer) {
          executionResults.push({ symbol: sym, status: "SKIPPED", reason: "Cash buffer" });
          continue;
        }
        // Size to allocation
        if (price > 0) {
          const maxQty = Math.max(1, Math.floor(maxAllocation / price));
          tradeQty = Math.min(tradeQty, maxQty);
        }
        // Diversification check: don't overload a sector
        const sector = sectorMap[sym] || "OTHER";
        const sectorPct = totalExposure > 0 ? ((sectorExposure[sector] || 0) / totalExposure) * 100 : 0;
        if (sectorPct > 35 && conviction < 0.9) {
          executionResults.push({ symbol: sym, status: "SKIPPED", reason: `Sector ${sector} overweight at ${sectorPct.toFixed(0)}%` });
          continue;
        }

        const refPrice = snap?.latestQuote?.ap || price;
        const orderBody: any = {
          symbol: sym, qty: String(tradeQty), side: "buy",
          type: marketOpen ? "market" : "limit",
          time_in_force: marketOpen ? "day" : "gtc",
        };
        if (!marketOpen && refPrice) orderBody.limit_price = Number((refPrice * 1.002).toFixed(2));

        const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
          method: "POST",
          headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
          body: JSON.stringify(orderBody)
        });

        if (orderRes.ok) {
          const order = await orderRes.json();
          let fillPrice = 0;
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const check = await alpacaGet(`/v2/orders/${order.id}`, ALPACA_KEY, ALPACA_SECRET);
            if (check?.status === "filled") { fillPrice = parseFloat(check.filled_avg_price); break; }
            if (check?.status === "cancelled" || check?.status === "rejected") break;
          }
          await supabase.from("trades").insert({
            symbol: sym, side: "BUY", qty: tradeQty, price: fillPrice || price,
            total_value: (fillPrice || price) * tradeQty,
            agent: "Omni-Brain", strategy: "AI Diversified",
            reasoning: trade.reasoning, status: fillPrice > 0 ? "executed" : "pending",
            alpaca_order_id: order.id,
          });
          executionResults.push({ symbol: sym, action: "BUY", qty: tradeQty, fill: fillPrice, status: "EXECUTED" });
        } else {
          const err = await orderRes.text();
          executionResults.push({ symbol: sym, status: "FAILED", reason: err });
        }

      } else if (action === "SELL") {
        const posData = posArr.find((p: any) => p.symbol === sym);
        if (!posData) {
          executionResults.push({ symbol: sym, status: "SKIPPED", reason: "Not held" });
          continue;
        }
        const sellQty = Math.min(tradeQty, parseInt(posData.qty || "0"));
        if (sellQty < 1) continue;

        const refPrice = snap?.latestQuote?.bp || price;
        const orderBody: any = {
          symbol: sym, qty: String(sellQty), side: "sell",
          type: marketOpen ? "market" : "limit",
          time_in_force: marketOpen ? "day" : "gtc",
        };
        if (!marketOpen && refPrice) orderBody.limit_price = Number((refPrice * 0.998).toFixed(2));

        const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
          method: "POST",
          headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
          body: JSON.stringify(orderBody)
        });

        if (orderRes.ok) {
          const order = await orderRes.json();
          let fillPrice = 0;
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const check = await alpacaGet(`/v2/orders/${order.id}`, ALPACA_KEY, ALPACA_SECRET);
            if (check?.status === "filled") { fillPrice = parseFloat(check.filled_avg_price); break; }
            if (check?.status === "cancelled" || check?.status === "rejected") break;
          }
          const pnl = fillPrice > 0 ? (fillPrice - parseFloat(posData.avg_entry_price)) * sellQty : 0;
          await supabase.from("trades").insert({
            symbol: sym, side: "SELL", qty: sellQty, price: fillPrice || price,
            total_value: (fillPrice || price) * sellQty, pnl,
            agent: "Omni-Brain", strategy: "AI Diversified",
            reasoning: trade.reasoning, status: fillPrice > 0 ? "executed" : "pending",
            alpaca_order_id: order.id,
          });
          executionResults.push({ symbol: sym, action: "SELL", qty: sellQty, fill: fillPrice, pnl, status: "EXECUTED" });
        } else {
          const err = await orderRes.text();
          executionResults.push({ symbol: sym, status: "FAILED", reason: err });
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // 7. SYNC PORTFOLIO TO SUPABASE
    // ═══════════════════════════════════════════════════
    const freshAcc = await alpacaGet("/v2/account", ALPACA_KEY, ALPACA_SECRET);
    const freshPos = await alpacaGet("/v2/positions", ALPACA_KEY, ALPACA_SECRET);

    if (freshAcc) {
      await supabase.from("portfolio_state").upsert({
        id: '63963cac-3336-44d5-b7b7-913a89beb74f',
        total_value: parseFloat(freshAcc.portfolio_value) || 0,
        cash: parseFloat(freshAcc.cash) || 0,
        buying_power: parseFloat(freshAcc.buying_power) || 0,
        equity: parseFloat(freshAcc.equity) || 0,
        positions: Array.isArray(freshPos) ? freshPos.map((p: any) => ({
          symbol: p.symbol, qty: parseFloat(p.qty), avg_entry: parseFloat(p.avg_entry_price),
          current_price: parseFloat(p.current_price), unrealized_pnl: parseFloat(p.unrealized_pl),
          unrealized_plpc: parseFloat(p.unrealized_plpc), market_value: parseFloat(p.market_value), side: p.side,
        })) : [],
        daily_pnl: parseFloat(freshAcc.equity) - parseFloat(freshAcc.last_equity),
        updated_at: new Date().toISOString()
      });
    }

    // ═══════════════════════════════════════════════════
    // 8. LOG EVERYTHING
    // ═══════════════════════════════════════════════════
    await supabase.from("agent_logs").insert({
      agent_name: "Swarm Orchestrator",
      log_type: "decision",
      message: `Cycle complete: ${executionResults.length} actions | Scanned ${scanSymbols.length} symbols | Mode: ${marketOpen ? "HYPER" : "PREP"} | Mindset: ${operatorMindset.toUpperCase()}`,
      reasoning: brain.thesis || brain.market_outlook || "",
      metadata: {
        executionResults,
        mindset: operatorMindset,
        brain_summary: { outlook: brain.market_outlook, health: brain.portfolio_health, thesis: brain.thesis }
      }
    });

    // ═══════════════════════════════════════════════════
    // 9. CONSOLIDATED DISCORD BRIEF (Rate Limited)
    // ═══════════════════════════════════════════════════
    if (shouldSendDiscord) {
      const executed = executionResults.filter(r => r.status === "EXECUTED");
      const skipped = executionResults.filter(r => r.status === "SKIPPED");
      const failed = executionResults.filter(r => r.status === "FAILED");

      const freshEquity = freshAcc ? parseFloat(freshAcc.equity) : equity;
      const freshCash = freshAcc ? parseFloat(freshAcc.cash) : cash;
      const freshBP = freshAcc ? parseFloat(freshAcc.buying_power) : buyingPower;
      const freshPosArr = Array.isArray(freshPos) ? freshPos : posArr;

      const executedBlock = executed.length > 0
        ? executed.map(e => `${e.action === "BUY" ? "🟢 BUY" : "🔴 SELL"} **${e.symbol}** x${e.qty} @ $${(e.fill || 0).toFixed(2)}${e.pnl ? ` (P&L: $${e.pnl.toFixed(2)})` : ""}`).join("\n")
        : "No trades executed";

      const skippedBlock = skipped.length > 0
        ? skipped.map(s => `⏭️ ${s.symbol}: ${s.reason}`).join("\n")
        : "";

      const topMoversBlock = (movers as any[]).slice(0, 8).map((m: any) =>
        `${m.changePct >= 0 ? "📈" : "📉"} **${m.sym}** ${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)}% ($${m.price.toFixed(2)})`
      ).join("\n");

      // Sector exposure for display
      const sectorBlock = totalExposure > 0
        ? Object.entries(sectorExposure)
          .sort((a, b) => b[1] - a[1])
          .map(([sec, val]) => `${sec}: ${((val / totalExposure) * 100).toFixed(0)}%`)
          .join(" | ")
        : "Diversified (no positions)";

      const aiTradesLog = trades.map((t: any) => `**${t.action} ${t.symbol}** (Conviction: ${t.conviction})\n*Reasoning:* ${t.reasoning}`).join("\n\n");

      const embeds = [
        {
          title: `📊 ACE_OS — Intelligence Brief`,
          description: [
            `**Mode:** ${marketOpen ? "🔥 DAY TRADING (Market Open)" : "🌙 PREP MODE (Market Closed)"}`,
            `**Mindset:** ${operatorMindset.toUpperCase()} (${mindsetProfile.promptLabel})`,
            `**Symbols Scanned:** ${scanSymbols.length}/${ALL_SYMBOLS.length}`,
            "",
            "━━━ **PORTFOLIO** ━━━",
            `💰 Equity: **$${freshEquity.toFixed(2)}** | BP: $${freshBP.toFixed(2)}`,
            `📊 Daily P&L: **${dailyPnl >= 0 ? "+" : ""}$${dailyPnl.toFixed(2)}** (${dailyPnlPct.toFixed(2)}%)`,
            `🏗️ Positions: ${freshPosArr.length}/${maxOpenPositions} | Sector Exposure: ${sectorBlock}`,
            "",
            "━━━ **TRADES THIS CYCLE** ━━━",
            executedBlock,
            skippedBlock ? `\n━━━ **SKIPPED** ━━━\n${skippedBlock}` : "",
            "",
            "━━━ **AI THESIS & REASONING** ━━━",
            `🧠 **Core Thesis:** ${brain.thesis || "Monitoring for setups."}`,
            "",
            aiTradesLog ? `**Trade Justifications:**\n${aiTradesLog}` : "*No trade justifications generated this cycle.*",
          ].filter(Boolean).join("\n"),
          color: dailyPnl >= 0 ? 0x00ff41 : 0xff4444,
          footer: { text: `ACE_OS Omni-Brain | Next brief in ~30 min` },
          timestamp: new Date().toISOString(),
        }
      ];

      await sendDiscordBrief(embeds);

      await supabase.from("agent_state").update({
        config: {
          ...(orchestratorState?.config || {}),
          last_discord_at: new Date().toISOString()
        }
      }).eq("agent_name", "Swarm Orchestrator");
    }

    return new Response(JSON.stringify({
      success: true,
      mode: marketOpen ? "HYPER" : "PREP",
      mindset: operatorMindset,
      scanned: scanSymbols.length,
      trades: executionResults,
      outlook: brain.market_outlook,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("Cycle Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    // Don't spam discord on errors — just log
    await supabase.from("agent_logs").insert({
      agent_name: "Swarm Orchestrator", log_type: "error", message: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
