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
    await supabase.from("agent_logs").insert({
      agent_name: "Risk Controller",
      log_type: "info",
      message: `Risk bypass enabled: ${pendingTrades.length} pending trades passed through to execution.`,
    });

    return new Response(JSON.stringify({ success: true, approved: pendingTrades.length, rejected: 0, reason: "bypass" }), {
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
