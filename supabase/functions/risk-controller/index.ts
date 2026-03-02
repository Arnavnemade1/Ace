import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_POSITION_PCT = 0.05; // 5% max per position (mindful)
const MAX_DAILY_LOSS = 0.02; // 2% max daily loss
const MIN_BUYING_POWER = 1000;
const CASH_BUFFER_PCT = 0.25;
const MAX_OPEN_POSITIONS = 8;
const MAX_TRADES_PER_DAY = 5;
const LOSS_RECOVERY_PNL_PCT = -0.01;
const LOSS_RECOVERY_MAX_DRAWDOWN = 0.03;
const LOW_RISK_SYMBOLS = new Set(["SPY", "QQQ", "VTI", "IWM", "DIA", "TLT", "SHY", "USFR"]);

// conservative spending rules
const RESERVE_BP_PCT = 0.5;        // maintain at least 50% buying power
const MAX_DAILY_SPEND_PCT = 0.1;   // spend at most 10% of BP per day

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Risk Controller");

    // Fetch pending trades
    const { data: pendingTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!pendingTrades || pendingTrades.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending trades to review" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // load latest portfolio state to know current buying power
    const { data: latestPort } = await supabase
      .from('portfolio_state')
      .select('buying_power')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const buyingPower = parseFloat(latestPort?.buying_power || '0');
    const startOfDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    startOfDay.setHours(0, 0, 0, 0);

    const { data: executedBuys } = await supabase
      .from('trades')
      .select('total_value')
      .eq('side', 'BUY')
      .eq('status', 'executed')
      .gte('created_at', startOfDay.toISOString());
    const spentToday = (executedBuys || []).reduce((sum: number, t: any) => sum + (t.total_value || 0), 0);
    const dailyLimit = buyingPower * MAX_DAILY_SPEND_PCT;

    // check reserve requirement
    const pendingBuyTotal = pendingTrades
      .filter(t => t.side === 'BUY')
      .reduce((sum: number, t: any) => sum + (t.total_value || 0), 0);

    if (buyingPower - pendingBuyTotal < buyingPower * RESERVE_BP_PCT) {
      await supabase.from("agent_logs").insert({
        agent_name: "Risk Controller",
        log_type: "warning",
        message: `Rejecting ${pendingBuyTotal.toFixed(2)} of buys to preserve ${Math.round(RESERVE_BP_PCT * 100)}% reserve BP`,
      });
      return new Response(JSON.stringify({ success: true, approved: 0, rejected: pendingTrades.length, reason: "reserve" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (spentToday + pendingBuyTotal > dailyLimit) {
      await supabase.from("agent_logs").insert({
        agent_name: "Risk Controller",
        log_type: "warning",
        message: `Daily spend cap exceeded (${(spentToday + pendingBuyTotal).toFixed(2)} > ${dailyLimit.toFixed(2)}). Rejecting trades.`,
      });
      return new Response(JSON.stringify({ success: true, approved: 0, rejected: pendingTrades.length, reason: "daily_cap" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // if we reached this point, allow all pending trades (formerly bypass)
    await supabase.from("agent_logs").insert({
      agent_name: "Risk Controller",
      log_type: "info",
      message: `Risk check passed: ${pendingTrades.length} pending trades approved.`,
    });

    return new Response(JSON.stringify({ success: true, approved: pendingTrades.length, rejected: 0, reason: "approved" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Risk Controller error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
