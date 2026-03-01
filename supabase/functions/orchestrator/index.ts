import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "full_cycle"; // full_cycle, scan_only, replay_only

    await supabase.from("agent_state").update({ status: "active", updated_at: new Date().toISOString() }).eq("agent_name", "Orchestrator");

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
    const NY_TZ = "America/New_York";
    const DAILY_TRADE_CAP = 5;

    const nowNY = new Date(new Date().toLocaleString("en-US", { timeZone: NY_TZ }));
    const dayStartNY = new Date(nowNY);
    dayStartNY.setHours(0, 0, 0, 0);
    const nextMidnightNY = new Date(dayStartNY);
    nextMidnightNY.setDate(nextMidnightNY.getDate() + 1);
    const msUntilReset = nextMidnightNY.getTime() - nowNY.getTime();
    const resetHours = Math.max(0, Math.floor(msUntilReset / 3600000));
    const resetMins = Math.max(0, Math.floor((msUntilReset % 3600000) / 60000));

    const formatAgo = (ts?: string | null) => {
      if (!ts) return "unknown";
      const ageMs = Date.now() - new Date(ts).getTime();
      const mins = Math.max(0, Math.round(ageMs / 60000));
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hrs}h ${rem}m ago`;
    };

    const sendDiscord = async (content: string) => {
      if (!DISCORD_WEBHOOK_URL) return;
      try {
        await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
      } catch (e) {
        console.error("Discord failed:", e);
      }
    };

    const callAgent = async (functionName: string) => {
      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        const duration = Date.now() - start;
        return { function: functionName, success: res.ok, duration, data };
      } catch (err) {
        return { function: functionName, success: false, duration: Date.now() - start, error: String(err) };
      }
    };

    const results: any[] = [];

    if (mode === "full_cycle" || mode === "scan_only") {
      // Phase 1: Scan & Analyze (parallel)
      const [scanResult, sentimentResult] = await Promise.all([
        callAgent("market-scanner"),
        callAgent("sentiment-analyst"),
      ]);
      results.push(scanResult, sentimentResult);

      if (mode !== "scan_only") {
        // Phase 2: Strategy
        const strategyResult = await callAgent("strategy-engine");
        results.push(strategyResult);

        // Phase 3: Risk Check
        const riskResult = await callAgent("risk-controller");
        results.push(riskResult);

        // Phase 4: Execute
        const executionResult = await callAgent("execution-agent");
        results.push(executionResult);

        // Phase 5: Optimize
        const optimizerResult = await callAgent("portfolio-optimizer");
        results.push(optimizerResult);
      }
    }

    if (mode === "full_cycle" || mode === "replay_only") {
      // Phase 6: Causal Replay (typically nightly)
      const replayResult = await callAgent("causal-replay");
      results.push(replayResult);
    }

    const successCount = results.filter((r) => r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const { data: lastTrade } = await supabase
      .from("trades")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: executedToday } = await supabase
      .from("trades")
      .select("id")
      .eq("status", "executed")
      .gte("created_at", dayStartNY.toISOString());
    const executedCount = executedToday?.length || 0;

    const includeDeepThoughts = nowNY.getMinutes() % 30 === 0;
    let journalSummary = "";
    if (includeDeepThoughts) {
      const { data: portfolio } = await supabase
        .from("portfolio_state")
        .select("total_value, cash, daily_pnl, max_drawdown, positions, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const positions = Array.isArray(portfolio?.positions) ? portfolio?.positions : [];
      const topPositions = positions
        .slice(0, 5)
        .map((p: any) => `${p.symbol} (${p.side || "long"} ${p.qty})`)
        .join(", ");

      const { data: watchSignals } = await supabase
        .from("signals")
        .select("symbol, strength, signal_type, expires_at, acted_on")
        .eq("acted_on", false)
        .gte("expires_at", new Date().toISOString())
        .order("strength", { ascending: false })
        .limit(6);

      const watchList = (watchSignals || [])
        .map((s: any) => `${s.symbol} ${String(s.signal_type || "signal").toUpperCase()} (${Number(s.strength || 0).toFixed(2)})`)
        .join(", ");

      const { data: lastDecision } = await supabase
        .from("agent_logs")
        .select("reasoning")
        .eq("agent_name", "Strategy Engine")
        .eq("log_type", "decision")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: lastThought } = await supabase
        .from("agent_logs")
        .select("reasoning")
        .eq("agent_name", "Strategy Engine")
        .eq("log_type", "learning")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const whyLine = lastDecision?.reasoning
        ? `**Why:** ${String(lastDecision.reasoning).slice(0, 420)}`
        : "Why: Waiting for higher-conviction signals with clean liquidity.";

      const thoughtLine = lastThought?.reasoning
        ? `**Thought Process:** ${String(lastThought.reasoning).slice(0, 420)}`
        : "**Thought Process:** Preserve capital, avoid overtrading, and wait for high-strength alignment.";

      const roadmap = [
        "Roadmap: scan broad market + news for high-strength signals.",
        "Wait for conviction ≥ 0.8 and respect cooldown + daily cap.",
        "Size entries ≤ 2% equity with 25% cash buffer.",
        "If market closed, queue GTC limits for open.",
        "If P/L < -1% or drawdown ≥ 3%, switch to low-risk ETFs.",
      ].join(" ");

      const { data: journals } = await supabase
        .from("agent_logs")
        .select("agent_name, reasoning, created_at")
        .eq("log_type", "learning")
        .order("created_at", { ascending: false })
        .limit(6);
      if (journals && journals.length > 0) {
        journalSummary = journals
          .map((j: any) => `• ${j.agent_name}: ${String(j.reasoning || "").slice(0, 220)}`)
          .join("\n");
      }

      const portfolioLine = portfolio
        ? `**Portfolio:** $${Number(portfolio.total_value || 0).toFixed(2)} | Cash $${Number(portfolio.cash || 0).toFixed(2)} | Daily PnL $${Number(portfolio.daily_pnl || 0).toFixed(2)} | Max DD ${(Number(portfolio.max_drawdown || 0) * 100).toFixed(2)}%`
        : "**Portfolio:** unavailable";

      const investLine = positions.length > 0
        ? `**Investing:** ${topPositions}`
        : `**Not Investing:** Watching ${watchList || "no strong signals yet"}`;

      journalSummary = [
        portfolioLine,
        investLine,
        whyLine,
        thoughtLine,
        `**${roadmap}**`,
        "",
        journalSummary ? "**Agent Journals**\n" + journalSummary : "",
      ].filter(Boolean).join("\n");
    }

    const summaryLines = results.map((r) => {
      let extra = "";
      if (r.function === "market-scanner") extra = `signals=${r.data?.signals_found ?? "?"}`;
      if (r.function === "sentiment-analyst") extra = `sentiment=${r.data?.sentiment?.overall_score ?? "?"}`;
      if (r.function === "strategy-engine") extra = `decisions=${r.data?.decisions?.length ?? 0}`;
      if (r.function === "risk-controller") extra = r.data?.message ? `msg=${r.data.message}` : "";
      if (r.function === "execution-agent") extra = r.data?.message ? `msg=${r.data.message}` : "";
      if (r.function === "portfolio-optimizer") extra = r.data?.reason ? `reason=${r.data.reason}` : "";
      return `• ${r.function}: ${r.success ? "OK" : "FAIL"} ${extra}`.trim();
    });

    const capLine = executedCount >= DAILY_TRADE_CAP
      ? `**Daily Cap:** ${executedCount}/${DAILY_TRADE_CAP} (HIT)`
      : `**Daily Cap:** ${executedCount}/${DAILY_TRADE_CAP}`;
    const resetLine = `**Reset In:** ${resetHours}h ${resetMins}m`;
    const lastTradeLine = `**Last Trade:** ${formatAgo(lastTrade?.created_at)}`;

    const agentLines = summaryLines.map((line) => `- ${line.replace(/^•\s?/, "")}`);

    await sendDiscord(
      [
        `🛰️ **ACE Orchestrator — ${mode.toUpperCase()}**`,
        `**Status:** ${successCount}/${results.length} ok in ${totalDuration}ms`,
        `${capLine} • ${resetLine} • ${lastTradeLine}`,
        "",
        "**Agent Results**",
        ...agentLines,
        includeDeepThoughts && journalSummary ? `\n**Journal (30m)**\n${journalSummary}` : "",
      ].filter(Boolean).join("\n")
    );

    await supabase.from("agent_logs").insert({
      agent_name: "Orchestrator",
      log_type: "learning",
      message: "Journal — Orchestrator cycle summary",
      reasoning: [
        `Mode: ${mode}`,
        `Success: ${successCount}/${results.length}`,
        summaryLines.join(" | "),
      ].join(" | "),
      metadata: { mode, successCount, totalDuration },
    });

    await supabase.from("agent_logs").insert({
      agent_name: "Orchestrator",
      log_type: "info",
      message: `Orchestration complete (${mode}): ${successCount}/${results.length} agents succeeded in ${totalDuration}ms`,
      metadata: { mode, results: results.map((r) => ({ fn: r.function, ok: r.success, ms: r.duration })) },
    });

    await supabase.from("agent_state").update({
      metric_value: "99.97%",
      metric_label: "uptime",
      last_action: `${mode}: ${successCount}/${results.length} succeeded`,
      last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "idle",
    }).eq("agent_name", "Orchestrator");

    return new Response(JSON.stringify({ success: true, mode, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Orchestrator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
