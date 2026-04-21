import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, safeJSON } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // AI keys are read inside callAI

    await supabase.from("agent_state").update({ status: "learning", updated_at: new Date().toISOString() }).eq("agent_name", "Causal Replay");

    // Fetch recent executed trades
    const { data: recentTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "executed")
      .order("executed_at", { ascending: false })
      .limit(20);

    if (!recentTrades || recentTrades.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No trades to replay" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tradesToAnalyze = recentTrades.slice(0, 8);
    const tradesSummary = tradesToAnalyze.map((t) =>
      `${t.id.slice(0,8)} ${t.side} ${t.qty}${t.symbol}@${t.price} pnl=${t.pnl ?? "open"}`
    ).join("\n");

    const prompt = `Analyze trades. Return JSON: {"trade_analyses":[{"trade_id":"id","counterfactuals":[{"scenario":"s","estimated_outcome":"o","would_have_been_better":bool}]}],"patterns_to_prune":["p"],"improvement_suggestions":["s"],"overall_improvement_score":0-100}\n\nTrades:\n${tradesSummary}`;

    const rawText = await callAI(prompt, { maxTokens: 800, temperature: 0.2 });
    const replayResult = safeJSON<any>(rawText, {
      trade_analyses: [], patterns_to_prune: [], improvement_suggestions: [], overall_improvement_score: 0,
    });
    replayResult.trade_analyses ??= [];
    replayResult.patterns_to_prune ??= [];
    replayResult.improvement_suggestions ??= [];
    replayResult.overall_improvement_score ??= 0;
    // Store replay results
    for (const analysis of replayResult.trade_analyses) {
      await supabase.from("replay_results").insert({
        trade_id: analysis.trade_id,
        original_outcome: { trade: recentTrades.find((t) => t.id === analysis.trade_id) },
        counterfactual_outcomes: analysis.counterfactuals,
        improvement_score: replayResult.overall_improvement_score,
        patterns_pruned: replayResult.patterns_to_prune.length,
        lessons_learned: replayResult.improvement_suggestions.join("; "),
      });
    }

    await supabase.from("agent_logs").insert({
      agent_name: "Causal Replay",
      log_type: "learning",
      message: `Replayed ${recentTrades.length} trades. Found ${replayResult.patterns_to_prune.length} patterns to prune. Improvement score: ${replayResult.overall_improvement_score}%`,
      reasoning: replayResult.improvement_suggestions.join("\n"),
      metadata: {
        trades_replayed: recentTrades.length,
        patterns_pruned: replayResult.patterns_to_prune.length,
        improvement_score: replayResult.overall_improvement_score,
      },
    });

    await supabase.from("agent_state").update({
      metric_value: `${replayResult.overall_improvement_score}%`,
      metric_label: "improvement rate",
      last_action: `Replayed ${recentTrades.length} trades`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_name", "Causal Replay");

    return new Response(JSON.stringify({ success: true, replay: replayResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Causal Replay error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
