import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AI helper: Gemini primary → Lovable AI fallback (JSON mode)
async function callAIJson(prompt: string, geminiKey: string, lovableKey: string, maxTokens = 2048): Promise<string> {
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) return t;
      } else {
        console.log(`Gemini ${r.status}, falling back to Lovable AI`);
      }
    } catch (e) {
      console.log("Gemini error, falling back:", (e as Error).message);
    }
  }
  if (lovableKey) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) throw new Error(`Lovable AI fallback failed: ${r.status}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "{}";
  }
  throw new Error("No AI keys available");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI keys configured");

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

    // Fetch signals that led to these trades
    const { data: relatedSignals } = await supabase
      .from("signals")
      .select("*")
      .eq("acted_on", true)
      .order("created_at", { ascending: false })
      .limit(50);

    const tradesSummary = recentTrades.map((t) =>
      `${t.side} ${t.qty} ${t.symbol} @ $${t.price} | Strategy: ${t.strategy} | P&L: ${t.pnl !== null ? `$${t.pnl}` : "open"} | Reasoning: ${t.reasoning}`
    ).join("\n");

    // AI counterfactual analysis via Gemini direct
    const systemPrompt = `You are the Causal Replay agent. You perform nightly counterfactual analysis on the day's trades. For each trade, ask:
- What if we had waited 30 minutes?
- What if we had sized 50% larger or smaller?
- What if we had used a different signal threshold?
- What if we had set a tighter/wider stop loss?

Identify patterns: which strategies consistently underperform? Which signal types lead to the best trades? What timing patterns emerge?

Provide concrete, actionable improvement suggestions.

Respond ONLY with a JSON object with this exact structure:
{
  "trade_analyses": [{"trade_id": "string", "counterfactuals": [{"scenario": "string", "estimated_outcome": "string", "would_have_been_better": true/false}]}],
  "patterns_identified": ["string"],
  "patterns_to_prune": ["string"],
  "improvement_suggestions": ["string"],
  "overall_improvement_score": 0-100
}`;

    const userPrompt = `Replay these trades:\n${tradesSummary}\n\nRelated signals: ${JSON.stringify(relatedSignals?.slice(0, 10))}`;

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
      }),
    });

    if (!aiResponse.ok) throw new Error(`Gemini API error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let replayResult = { trade_analyses: [], patterns_identified: [], patterns_to_prune: [], improvement_suggestions: [], overall_improvement_score: 0 } as any;

    try {
      replayResult = JSON.parse(rawText);
    } catch { /* use defaults */ }
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
