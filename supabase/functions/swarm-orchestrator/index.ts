import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- CONFIG & SECRETS ---
const GET_SECRET = (key: string) => Deno.env.get(key) || "";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(GET_SECRET("SUPABASE_URL"), GET_SECRET("SUPABASE_SERVICE_ROLE_KEY"));
    const LOVABLE_API_KEY = GET_SECRET("LOVABLE_API_KEY");
    const ALPACA_KEY = GET_SECRET("ALPACA_API_KEY");
    const ALPACA_SECRET = GET_SECRET("ALPACA_API_SECRET");
    const ALPACA_URL = "https://paper-api.alpaca.markets";

    try {
        console.log("--- ACE_OS Serverless Cycle Triggered ---");

        if (!ALPACA_KEY || !ALPACA_SECRET) {
            throw new Error("Missing Alpaca API credentials.");
        }

        // 1. FETCH CONTEXT (News, Portfolio, Technicals)
        const [accRes, posRes, ordersRes] = await Promise.all([
            fetch(`${ALPACA_URL}/v2/account`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/positions`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/orders?status=open`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } })
        ]);

        if (!accRes.ok) {
            const errText = await accRes.text();
            console.error("Alpaca Account Fetch Failed:", errText);
            throw new Error(`Alpaca Auth/API Error: ${accRes.status}`);
        }

        const account = await accRes.json();
        const positions = await posRes.json();
        const openOrders = await ordersRes.json();

        console.log(`Context Fetched. Equity: ${account.equity}`);

        // 2. OMNI-PULSE: Fetch News
        const NEWSDATA_KEY = GET_SECRET("NEWSDATA_KEY");
        let newsHeadlines: string[] = [];
        if (NEWSDATA_KEY) {
            try {
                const newsRes = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=finance OR market OR economy&language=en`);
                if (newsRes.ok) {
                    const newsData = await newsRes.json();
                    newsHeadlines = (newsData.results || []).slice(0, 10).map((n: any) => n.title);
                }
            } catch (e) {
                console.error("News fetch failed", e);
            }
        }

        // 3. BRAIN SYNTHESIS: Call Lovable AI Gateway
        const currentHoldings = Array.isArray(positions) ? positions.map((p: any) => p.symbol) : [];
        const watchlist = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "BTC/USD", "ETH/USD"];
        const symbolToEvaluate = watchlist[Math.floor(Math.random() * watchlist.length)];

        console.log(`Evaluating ${symbolToEvaluate} with Omni-Brain...`);

        if (!LOVABLE_API_KEY) {
            console.warn("LOVABLE_API_KEY missing. Skipping AI synthesis.");
            return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 401 });
        }

        const brainPrompt = {
            model: "google/gemini-3-flash-preview",
            messages: [
                { role: "system", content: "You are the ACE_OS Omni-Brain. Review market context and portfolio. Decide: BUY, SELL, or HOLD for the provided symbol. Return JSON with 'action' (BUY/SELL/HOLD) and 'reasoning' (string)." },
                { role: "user", content: `SYMBOL: ${symbolToEvaluate}\nPortfolio: $${account.equity} equity, $${account.buying_power} cash. Current Holdings: ${currentHoldings.join(", ")}\nNews: ${newsHeadlines.join(" | ")}\n\nDecision? (JSON)` }
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
        console.log(`Omni-Brain Decision for ${symbolToEvaluate}: ${decision.action}`);

        // 4. RISK & EXECUTION
        let tradeResult = "Decision: HOLD/REJECT";
        if (decision.action === "BUY" && !currentHoldings.includes(symbolToEvaluate)) {
            const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
                method: "POST",
                headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol: symbolToEvaluate.replace("/", ""),
                    qty: 1,
                    side: "buy",
                    type: "market",
                    time_in_force: "gtc"
                })
            });
            if (orderRes.ok) {
                tradeResult = `EXECUTED BUY: ${symbolToEvaluate} x1`;
            } else {
                const errText = await orderRes.text();
                tradeResult = `ORDER FAILED: ${errText}`;
            }
        }

        // 5. SYNC BACK TO SUPABASE
        console.log("Syncing cycle data to Supabase...");
        await Promise.all([
            supabase.from("agent_logs").insert({
                agent_name: "Swarm Orchestrator (Serverless)",
                log_type: "decision",
                message: `Omni-Brain Analysis: ${symbolToEvaluate} -> ${decision.action}`,
                reasoning: decision.reasoning,
                metadata: { decision, tradeResult, symbol: symbolToEvaluate }
            }),
            supabase.from("portfolio_state").upsert({
                id: '63963cac-3336-44d5-b7b7-913a89beb74f',
                total_value: parseFloat(account.portfolio_value) || 0,
                cash: parseFloat(account.cash) || 0,
                buying_power: parseFloat(account.buying_power) || 0,
                equity: parseFloat(account.equity) || 0,
                positions: positions,
                updated_at: new Date().toISOString()
            })
        ]);

        return new Response(JSON.stringify({ success: true, symbol: symbolToEvaluate, decision, tradeResult }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: unknown) {
        console.error("Cycle Error:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
