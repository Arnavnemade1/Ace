import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GET_SECRET = (key: string) => Deno.env.get(key) || "";
const NY_TZ = "America/New_York";
const MIN_MINUTES_BETWEEN_TRADES = 10;
const MIN_BUYING_POWER = 1000;
const CASH_BUFFER_PCT = 0.2;
const MAX_ALLOCATION_PCT = 0.02;

function isMarketOpen(): boolean {
    const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: NY_TZ }));
    const day = nowNY.getDay();
    if (day === 0 || day === 6) return false;
    const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(GET_SECRET("SUPABASE_URL"), GET_SECRET("SUPABASE_SERVICE_ROLE_KEY"));
    const LOVABLE_API_KEY = GET_SECRET("LOVABLE_API_KEY");
    const ALPACA_KEY = GET_SECRET("ALPACA_API_KEY");
    const ALPACA_SECRET = GET_SECRET("ALPACA_API_SECRET");
    const DISCORD_WEBHOOK_URL = GET_SECRET("DISCORD_WEBHOOK_URL");
    const ALPACA_URL = "https://paper-api.alpaca.markets";

    const sendDiscord = async (content: string, embeds?: any[]) => {
        if (!DISCORD_WEBHOOK_URL) return;
        try {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, embeds }),
            });
        } catch (e) { console.error("Discord failed:", e); }
    };

    try {
        console.log("--- ACE_OS Serverless Cycle Triggered ---");

        if (!ALPACA_KEY || !ALPACA_SECRET) throw new Error("Missing Alpaca API credentials.");

        const { data: lastTrade } = await supabase
            .from("trades")
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (lastTrade?.created_at) {
            const ageMs = Date.now() - new Date(lastTrade.created_at).getTime();
            if (ageMs < MIN_MINUTES_BETWEEN_TRADES * 60 * 1000) {
                await supabase.from("agent_logs").insert({
                    agent_name: "Swarm Orchestrator",
                    log_type: "info",
                    message: `Cooldown active (${Math.round(ageMs / 60000)}m ago). Skipping cycle.`,
                });
                return new Response(JSON.stringify({ success: true, message: "Cooldown active" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        // 1. FETCH CONTEXT
        const [accRes, posRes, ordersRes] = await Promise.all([
            fetch(`${ALPACA_URL}/v2/account`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/positions`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/orders?status=open`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } })
        ]);

        if (!accRes.ok) {
            const errText = await accRes.text();
            throw new Error(`Alpaca Auth/API Error: ${accRes.status} — ${errText}`);
        }

        const account = await accRes.json();
        const positions = await posRes.json();
        const openOrders = await ordersRes.json();
        const currentHoldings = Array.isArray(positions) ? positions.map((p: any) => p.symbol) : [];
        const openOrderSymbols = new Set(Array.isArray(openOrders) ? openOrders.map((o: any) => o.symbol) : []);
        const equity = parseFloat(account.equity || "0");
        const cash = parseFloat(account.cash || "0");
        const buyingPower = parseFloat(account.buying_power || "0");
        const minCashBuffer = equity * CASH_BUFFER_PCT;
        const maxAllocation = equity * MAX_ALLOCATION_PCT;

        if (buyingPower < MIN_BUYING_POWER) {
            await supabase.from("agent_logs").insert({
                agent_name: "Swarm Orchestrator",
                log_type: "info",
                message: `Buying power below $${MIN_BUYING_POWER}. Skipping cycle.`,
            });
            return new Response(JSON.stringify({ success: true, message: "Insufficient buying power" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`Equity: $${account.equity}, Positions: ${currentHoldings.length}, Cash: $${account.cash}`);

        // 2. FETCH REAL MARKET DATA for decision-making
        const watchlist = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "SPY", "QQQ", "AMD"];
        const snapshotsRes = await fetch(
            `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${watchlist.join(",")}`,
            { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }
        );
        let snapshots: Record<string, any> = {};
        if (snapshotsRes.ok) snapshots = await snapshotsRes.json();

        // Build rich market context
        const marketContext = watchlist.map(sym => {
            const snap = snapshots[sym];
            if (!snap) return `${sym}: NO DATA`;
            const price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
            const dayChange = snap.dailyBar ? ((snap.dailyBar.c - snap.dailyBar.o) / snap.dailyBar.o * 100).toFixed(2) : "N/A";
            const vol = snap.dailyBar?.v || 0;
            const held = currentHoldings.includes(sym);
            const posData = Array.isArray(positions) ? positions.find((p: any) => p.symbol === sym) : null;
            const pnl = posData ? `$${parseFloat(posData.unrealized_pl).toFixed(2)}` : "not held";
            return `${sym}: $${price} (${dayChange}%), Vol:${vol}, Held:${held}, P&L:${pnl}`;
        }).join("\n");

        // 3. FETCH NEWS
        const NEWSDATA_KEY = GET_SECRET("NEWSDATA_KEY");
        let newsHeadlines: string[] = [];
        if (NEWSDATA_KEY) {
            try {
                const newsRes = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=finance OR market OR economy&language=en`);
                if (newsRes.ok) {
                    const newsData = await newsRes.json();
                    newsHeadlines = (newsData.results || []).slice(0, 15).map((n: any) => n.title);
                }
            } catch (e) { console.error("News fetch failed", e); }
        }

        // 4. BRAIN SYNTHESIS — selective, data-driven
        if (!LOVABLE_API_KEY) {
            console.warn("LOVABLE_API_KEY missing.");
            return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 401 });
        }

        const brainPrompt = {
            model: "google/gemini-3-flash-preview",
            messages: [
                {
                    role: "system",
                    content: `You are the Omni-Brain of ACE_OS, an autonomous paper trading system. 
You make REAL trades on Alpaca Paper. Your goal: MAXIMIZE RETURNS through smart, data-driven decisions.

RULES:
- Be selective. If conviction < 0.8, return HOLD.
- Only ONE trade maximum per cycle.
- Do NOT trade symbols with open orders.
- If market is closed, only place LIMIT orders (no market orders).
- Analyze the REAL market data, prices, volumes, and day changes provided.
- Consider news sentiment when making decisions.
- Max 15% of equity per position for risk management.
- You can BUY stocks you don't hold, SELL stocks you do hold, or HOLD.
- Consider momentum, mean reversion, breakouts, and sector rotation.
- If a stock is down significantly and fundamentals are strong → consider BUY.
- If a stock is up big with weakening momentum → consider taking profit (SELL).

Return JSON: {"action": "BUY"|"SELL"|"HOLD", "symbol": "TICKER", "qty": number, "reasoning": "string", "conviction": 0.0-1.0}
- For BUY: pick the best opportunity from the watchlist
- For SELL: pick a position to exit if appropriate  
- qty should be meaningful (1-10 shares based on price and portfolio size)
- If multiple opportunities, pick the STRONGEST signal`
                },
                {
                    role: "user",
                    content: `PORTFOLIO: $${account.equity} equity, $${account.cash} cash, $${account.buying_power} buying power
POSITIONS: ${currentHoldings.length > 0 ? currentHoldings.join(", ") : "NONE"}
OPEN ORDERS: ${Array.isArray(openOrders) ? openOrders.length : 0}
MARKET OPEN: ${isMarketOpen() ? "YES" : "NO"}

REAL-TIME MARKET DATA:
${marketContext}

NEWS HEADLINES:
${newsHeadlines.length > 0 ? newsHeadlines.map(h => `• ${h}`).join("\n") : "No recent news"}

Analyze and make your trading decision. Be aggressive but smart.`
                }
            ],
            response_format: { type: "json_object" }
        };

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(brainPrompt)
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error("AI Gateway Failed:", errText);
            throw new Error(`AI Gateway Error: ${aiRes.status}`);
        }

        const aiData = await aiRes.json();
        const aiContent = aiData.choices?.[0]?.message?.content;
        if (!aiContent) throw new Error("Empty AI response content.");

        const decision = JSON.parse(aiContent);
        const symbol = decision.symbol || watchlist[0];
        const qty = Math.max(1, Math.min(decision.qty || 1, 20));
        console.log(`Omni-Brain Decision: ${decision.action} ${qty} ${symbol} (conviction: ${decision.conviction})`);

        // 5. EXECUTE TRADE
        let tradeResult = `Decision: ${decision.action} — ${decision.reasoning}`;
        let tradeExecuted = false;
        const marketOpen = isMarketOpen();
        const snap = snapshots[symbol];
        const bid = snap?.latestQuote?.bp;
        const ask = snap?.latestQuote?.ap;
        const lastTrade = snap?.latestTrade?.p || snap?.dailyBar?.c;
        const refPrice = decision.action === "BUY" ? (ask || lastTrade) : (bid || lastTrade);

        if (decision.conviction < 0.8) {
            decision.action = "HOLD";
            tradeResult = `HOLD (low conviction) — ${decision.reasoning}`;
        }
        if (openOrderSymbols.has(symbol)) {
            decision.action = "HOLD";
            tradeResult = `HOLD (open order exists for ${symbol})`;
        }
        if (decision.action === "BUY" && cash < minCashBuffer) {
            decision.action = "HOLD";
            tradeResult = `HOLD (cash buffer: $${cash.toFixed(2)} < $${minCashBuffer.toFixed(2)})`;
        }
        if (decision.action === "BUY" && refPrice) {
            const maxQty = Math.max(1, Math.floor(maxAllocation / refPrice));
            decision.qty = Math.min(qty, maxQty);
        }

        const effectiveQty = Math.max(1, Math.min(decision.qty || qty, 20));

        if (decision.action === "BUY" && parseFloat(account.buying_power) > 100) {
            if (!marketOpen && !refPrice) {
                tradeResult = "ORDER SKIPPED: No live quote for limit pricing.";
            } else {
            const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
                method: "POST",
                headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol: symbol.replace("/", ""),
                    qty: String(effectiveQty),
                    side: "buy",
                    type: marketOpen ? "market" : "limit",
                    time_in_force: marketOpen ? "day" : "gtc",
                    limit_price: marketOpen ? undefined : Number(((refPrice || 0) * 1.001).toFixed(2))
                })
            });
            if (orderRes.ok) {
                const orderData = await orderRes.json();
                tradeResult = `EXECUTED BUY: ${effectiveQty} ${symbol}`;
                tradeExecuted = true;

                // Wait for fill
                let fillPrice = 0;
                for (let i = 0; i < 8; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    const checkRes = await fetch(`${ALPACA_URL}/v2/orders/${orderData.id}`, {
                        headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
                    });
                    if (checkRes.ok) {
                        const check = await checkRes.json();
                        if (check.status === "filled") { fillPrice = parseFloat(check.filled_avg_price); break; }
                    }
                }

                // Record trade
                await supabase.from("trades").insert({
                    symbol, side: "BUY", qty: effectiveQty, price: fillPrice, total_value: fillPrice * effectiveQty,
                    agent: "Omni-Brain", strategy: "AI Synthesis",
                    reasoning: decision.reasoning, status: "executed",
                    alpaca_order_id: orderData.id,
                });

                await sendDiscord("", [{
                    title: `🟢 BUY EXECUTED — ${symbol}`,
                    description: `**Qty:** ${effectiveQty}\n**Fill:** $${fillPrice.toFixed(2)}\n**Total:** $${(fillPrice * effectiveQty).toFixed(2)}\n**Conviction:** ${(decision.conviction * 100).toFixed(0)}%\n**Reasoning:** ${decision.reasoning}`,
                    color: 0x00ff41,
                    footer: { text: "ACE_OS Omni-Brain" },
                    timestamp: new Date().toISOString(),
                }]);
            } else {
                const errText = await orderRes.text();
                tradeResult = `ORDER FAILED: ${errText}`;
                await sendDiscord(`❌ BUY ORDER FAILED for ${symbol}: ${errText}`);
            }
            }
        } else if (decision.action === "SELL" && currentHoldings.includes(symbol)) {
            const posData = positions.find((p: any) => p.symbol === symbol);
            const sellQty = Math.min(effectiveQty, parseInt(posData?.qty || "0"));
            if (sellQty > 0) {
                if (!marketOpen && !refPrice) {
                    tradeResult = "ORDER SKIPPED: No live quote for limit pricing.";
                } else {
                const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
                    method: "POST",
                    headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        symbol: symbol.replace("/", ""),
                        qty: String(sellQty),
                        side: "sell",
                        type: marketOpen ? "market" : "limit",
                        time_in_force: marketOpen ? "day" : "gtc",
                        limit_price: marketOpen ? undefined : Number(((refPrice || 0) * 0.999).toFixed(2))
                    })
                });
                if (orderRes.ok) {
                    const orderData = await orderRes.json();
                    tradeResult = `EXECUTED SELL: ${sellQty} ${symbol}`;
                    tradeExecuted = true;

                    let fillPrice = 0;
                    for (let i = 0; i < 8; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const checkRes = await fetch(`${ALPACA_URL}/v2/orders/${orderData.id}`, {
                            headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
                        });
                        if (checkRes.ok) {
                            const check = await checkRes.json();
                            if (check.status === "filled") { fillPrice = parseFloat(check.filled_avg_price); break; }
                        }
                    }

                    await supabase.from("trades").insert({
                        symbol, side: "SELL", qty: sellQty, price: fillPrice, total_value: fillPrice * sellQty,
                        agent: "Omni-Brain", strategy: "AI Synthesis",
                        reasoning: decision.reasoning, status: "executed",
                        alpaca_order_id: orderData.id,
                    });

                    await sendDiscord("", [{
                        title: `🔴 SELL EXECUTED — ${symbol}`,
                        description: `**Qty:** ${sellQty}\n**Fill:** $${fillPrice.toFixed(2)}\n**Reasoning:** ${decision.reasoning}`,
                        color: 0xff4444,
                        footer: { text: "ACE_OS Omni-Brain" },
                        timestamp: new Date().toISOString(),
                    }]);
                } else {
                    const errText = await orderRes.text();
                    tradeResult = `SELL FAILED: ${errText}`;
                }
                }
            }
        } else if (decision.action === "HOLD") {
            await sendDiscord("", [{
                title: `⏸️ HOLD — ${symbol}`,
                description: `**Reasoning:** ${decision.reasoning}\n**Conviction:** ${(decision.conviction * 100).toFixed(0)}%`,
                color: 0xffaa00,
                footer: { text: "ACE_OS Omni-Brain" },
                timestamp: new Date().toISOString(),
            }]);
        }

        // 6. SYNC PORTFOLIO TO SUPABASE
        const freshAccRes = await fetch(`${ALPACA_URL}/v2/account`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } });
        const freshPosRes = await fetch(`${ALPACA_URL}/v2/positions`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } });

        if (freshAccRes.ok) {
            const freshAcc = await freshAccRes.json();
            const freshPos = freshPosRes.ok ? await freshPosRes.json() : [];

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

        await supabase.from("agent_logs").insert({
            agent_name: "Swarm Orchestrator",
            log_type: "decision",
            message: `${decision.action} ${effectiveQty} ${symbol} — ${tradeResult}`,
            reasoning: decision.reasoning,
            metadata: { decision, tradeResult, symbol, tradeExecuted }
        });

        return new Response(JSON.stringify({ success: true, symbol, decision, tradeResult }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: unknown) {
        console.error("Cycle Error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
        await sendDiscord(`🚨 **ACE_OS ERROR:** ${msg}`);
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
