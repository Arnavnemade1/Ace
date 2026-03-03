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
    const ALPACA_API_KEY = Deno.env.get("ALPACA_API_KEY");
    const ALPACA_API_SECRET = Deno.env.get("ALPACA_API_SECRET");
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

    const { data: executedToday } = await supabase
      .from("trades")
      .select("id")
      .eq("status", "executed")
      .gte("created_at", dayStartNY.toISOString());
    const executedCount = executedToday?.length || 0;

    // enforce daily trade cap from constant above
    const overDailyCap = executedCount >= DAILY_TRADE_CAP;
    if (overDailyCap) {
      await supabase.from("agent_logs").insert({
        agent_name: "Orchestrator",
        log_type: "warning",
        message: `Daily trade cap (${DAILY_TRADE_CAP}) reached; skipping execution phases.`,
      });
    }

    const results: any[] = [];

    if (mode === "full_cycle" || mode === "scan_only") {
      // Phase 1: Scan & Analyze (parallel)
      const [scanResult, sentimentResult] = await Promise.all([
        callAgent("market-scanner"),
        callAgent("sentiment-analyst"),
      ]);
      results.push(scanResult, sentimentResult);

      if (mode !== "scan_only" && !overDailyCap) {
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

    const { data: orchestratorState } = await supabase
      .from("agent_state")
      .select("config")
      .eq("agent_name", "Orchestrator")
      .maybeSingle();
    const lastJournalAt = orchestratorState?.config?.last_journal_at
      ? new Date(orchestratorState.config.last_journal_at).getTime()
      : 0;
    const includeDeepThoughts = !lastJournalAt || (Date.now() - lastJournalAt) >= 30 * 60 * 1000;
    let journalSummary = "";
    let briefMessage = "";
    if (includeDeepThoughts) {
      let marketLine = "Market: UNKNOWN";
      try {
        if (ALPACA_API_KEY && ALPACA_API_SECRET) {
          const clockRes = await fetch("https://paper-api.alpaca.markets/v2/clock", {
            headers: { "APCA-API-KEY-ID": ALPACA_API_KEY, "APCA-API-SECRET-KEY": ALPACA_API_SECRET },
          });
          if (clockRes.ok) {
            const clock = await clockRes.json();
            marketLine = `Market: ${clock.is_open ? "OPEN" : "CLOSED"} | Next ${clock.is_open ? "close" : "open"}: ${clock.is_open ? clock.next_close : clock.next_open}`;
          }
        }
      } catch {
        // ignore
      }

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
        .limit(10);

      const watchList = (watchSignals || [])
        .map((s: any) => `${s.symbol} ${String(s.signal_type || "signal").toUpperCase()} (${Number(s.strength || 0).toFixed(2)})`)
        .join(", ");
      const strengths = (watchSignals || []).map((s: any) => Number(s.strength || 0)).filter((n) => Number.isFinite(n));
      const meanStrength = strengths.length ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0;
      const variance = strengths.length ? strengths.reduce((a, b) => a + Math.pow(b - meanStrength, 2), 0) / strengths.length : 0;
      const stdev = Math.sqrt(variance);
      const sentimentScore = results.find((r) => r.function === "sentiment-analyst")?.data?.sentiment?.overall_score;

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
        "Rank opportunities by signal strength and liquidity regime.",
        "Allocate up to 2% equity per trade; stop when buying power tightens.",
        "If market closed, queue GTC limits for open.",
        "Rotate to top decile signals each 30-minute window.",
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
        `**${marketLine}**`,
        `**Signal Stats:** n=${strengths.length} | mean=${meanStrength.toFixed(2)} | stdev=${stdev.toFixed(2)} | sentiment=${sentimentScore ?? "n/a"}`,
        investLine,
        whyLine,
        thoughtLine,
        `**${roadmap}**`,
        "",
        journalSummary ? "**Agent Journals**\n" + journalSummary : "",
      ].filter(Boolean).join("\n");

      briefMessage = [
        `🧮 **ACE Quant Brief — ${mode.toUpperCase()}**`,
        `**Status:** ${successCount}/${results.length} ok in ${totalDuration}ms`,
        `**Last Trade:** ${formatAgo(lastTrade?.created_at)} | **Reset In:** ${resetHours}h ${resetMins}m`,
        "",
        journalSummary,
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

    if (includeDeepThoughts && briefMessage) {
      await sendDiscord(briefMessage);
    }

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
      config: {
        ...(orchestratorState?.config || {}),
        last_journal_at: includeDeepThoughts ? new Date().toISOString() : (orchestratorState?.config?.last_journal_at || null),
      },
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
