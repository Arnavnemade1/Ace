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

        // 1. FETCH CONTEXT (News, Portfolio, Technicals)
        const [accRes, posRes, ordersRes] = await Promise.all([
            fetch(`${ALPACA_URL}/v2/account`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/positions`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } }),
            fetch(`${ALPACA_URL}/v2/orders?status=open`, { headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET } })
        ]);

        const account = await accRes.json();
        const positions = await posRes.json();
        const openOrders = await ordersRes.json();

        // 2. OMNI-PULSE: Fetch News (via NewsData.io or similar if keys are present)
        // For this migration, we'll use a standard financial news fetch in-situ
        const NEWSDATA_KEY = GET_SECRET("NEWSDATA_KEY");
        let newsHeadlines: string[] = [];
        try {
            const newsRes = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=finance OR market OR economy&language=en`);
            const newsData = await newsRes.json();
            newsHeadlines = (newsData.results || []).slice(0, 10).map((n: any) => n.title);
        } catch (e) { console.error("News fetch failed", e); }

        // 3. BRAIN SYNTHESIS: Call Lovable AI Gateway
        const currentHoldings = positions.map((p: any) => p.symbol);
        const watchlist = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "BTC/USD", "ETH/USD"]; // Simplified Core Universe for migration proof

        // Evaluate one key sample symbol for the serverless proof-of-concept
        const symbolToEvaluate = watchlist[Math.floor(Math.random() * watchlist.length)];

        const brainPrompt = {
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are the ACE_OS Omni-Brain. Review market context and portfolio. Decide: BUY, SELL, or HOLD for the provided symbol. Be professional. Reject garbage." },
                { role: "user", content: `SYMBOL: ${symbolToEvaluate}\nPortfolio: $${account.equity} equity, $${account.buying_power} cash. Current Holdings: ${currentHoldings.join(", ")}\nNews: ${newsHeadlines.join(" | ")}\n\nDecision? (JSON)` }
            ],
            response_format: { type: "json_object" }
        };

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(brainPrompt)
        });

        const aiData = await aiRes.json();
        const decision = JSON.parse(aiData.choices[0].message.content);

        // 4. RISK & EXECUTION
        let tradeResult = "Decision: HOLD/REJECT";
        if (decision.action === "BUY" && !currentHoldings.includes(symbolToEvaluate)) {
            // Calculate qty (max 5% of equity)
            const qty = 1; // Simplified for proof
            const orderRes = await fetch(`${ALPACA_URL}/v2/orders`, {
                method: "POST",
                headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol: symbolToEvaluate.replace("/", ""),
                    qty,
                    side: "buy",
                    type: "market",
                    time_in_force: "gtc"
                })
            });
            tradeResult = `EXECUTED BUY: ${symbolToEvaluate} x${qty}`;
        }

        // 5. SYNC BACK TO SUPABASE
        await Promise.all([
            supabase.from("agent_logs").insert({
                agent_name: "Swarm Orchestrator (Serverless)",
                log_type: "decision",
                message: `Omni-Brain Analysis: ${symbolToEvaluate}`,
                reasoning: decision.reasoning,
                metadata: { decision, tradeResult }
            }),
            supabase.from("portfolio_state").upsert({
                id: '63963cac-3336-44d5-b7b7-913a89beb74f',
                total_value: parseFloat(account.portfolio_value),
                cash: parseFloat(account.cash),
                buying_power: parseFloat(account.buying_power),
                equity: parseFloat(account.equity),
                positions: positions,
                updated_at: new Date().toISOString()
            })
        ]);

        return new Response(JSON.stringify({ success: true, symbol: symbolToEvaluate, decision, tradeResult }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Cycle Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
