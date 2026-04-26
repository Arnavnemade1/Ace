import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type WatchlistCompany = {
  id: string;
  watchlist_id: string;
  ticker: string;
  company_name: string | null;
  sector: string | null;
  priority_tier: number;
};

type NewsArticle = {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string | null;
  sentiment_hint: number | null;
  symbols: unknown;
  url: string | null;
};

type MarketQuote = {
  symbol: string;
  price: number | null;
  change_percent: number | null;
  as_of: string;
  source: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(input: string | null | undefined) {
  return String(input || "").trim();
}

function asSymbolArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
    : [];
}

function pickArticle(company: WatchlistCompany, articles: NewsArticle[]) {
  const ticker = company.ticker.toUpperCase();
  const name = normalizeText(company.company_name).toLowerCase();

  return (
    articles.find((article) => {
      const symbols = asSymbolArray(article.symbols);
      const text = `${article.title} ${article.summary || ""}`.toLowerCase();
      return symbols.includes(ticker) || (name.length > 2 && text.includes(name.toLowerCase())) || text.includes(ticker.toLowerCase());
    }) || null
  );
}

function deriveSentiment(sentimentHint: number, changePercent: number) {
  if (sentimentHint <= -0.2 || changePercent <= -2.25) return "negative";
  if (sentimentHint >= 0.2 || changePercent >= 2.25) return "positive";
  return "neutral";
}

function deriveRisk(changePercent: number, sentimentHint: number) {
  if (sentimentHint <= -0.15 || changePercent <= -2) return "increase";
  if (sentimentHint >= 0.25 && changePercent >= 1.25) return "decrease";
  return "stable";
}

function deriveAction(convictionImpact: number, risk: string) {
  if (risk === "increase" && convictionImpact < -0.18) return { action: "reduce_exposure", magnitude: 0.25 };
  if (risk === "increase" && convictionImpact < -0.32) return { action: "exit_position", magnitude: 0.5 };
  if (risk === "decrease" && convictionImpact > 0.16) return { action: "increase_exposure", magnitude: 0.15 };
  return { action: "hold", magnitude: 0 };
}

function makeNarrativeSummary(company: WatchlistCompany, article: NewsArticle | null, quote: MarketQuote | null, sentiment: string, risk: string) {
  const change = Number(quote?.change_percent || 0);
  const headline = article?.title || `${company.ticker} market context update`;
  const quoteLine = quote
    ? `${company.ticker} moved ${change >= 0 ? "+" : ""}${change.toFixed(2)}% in the latest quote sample.`
    : `${company.ticker} has no recent quote sample in storage.`;

  return `${headline}. ${quoteLine} Surface-level FINS classified sentiment as ${sentiment} with risk ${risk}.`;
}

async function ensureWatchlistSeed(supabase: ReturnType<typeof createClient>) {
  const { data: companies, error } = await supabase
    .from("fins_watchlist_companies")
    .select("id")
    .limit(1);

  if (error) throw error;
  return companies && companies.length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const seeded = await ensureWatchlistSeed(supabase);
    if (!seeded) {
      return new Response(
        JSON.stringify({ success: false, message: "FINS watchlist is empty. Seed the watchlist first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [{ data: companies, error: companiesError }, { data: articles, error: articlesError }, { data: quotes, error: quotesError }] =
      await Promise.all([
        supabase
          .from("fins_watchlist_companies")
          .select("id, watchlist_id, ticker, company_name, sector, priority_tier")
          .order("priority_tier", { ascending: true })
          .limit(12),
        supabase
          .from("news_articles")
          .select("id, title, summary, source, published_at, sentiment_hint, symbols, url")
          .order("published_at", { ascending: false })
          .limit(180),
        supabase
          .from("market_quotes")
          .select("symbol, price, change_percent, as_of, source")
          .order("as_of", { ascending: false })
          .limit(320),
      ]);

    if (companiesError) throw companiesError;
    if (articlesError) throw articlesError;
    if (quotesError) throw quotesError;

    const quoteMap = new Map<string, MarketQuote>();
    for (const quote of (quotes || []) as MarketQuote[]) {
      const symbol = quote.symbol.toUpperCase();
      if (!quoteMap.has(symbol)) quoteMap.set(symbol, quote);
    }

    let processed = 0;
    const decisions: Array<{ ticker: string; action: string; sentiment: string; risk: string }> = [];

    for (const company of (companies || []) as WatchlistCompany[]) {
      const article = pickArticle(company, (articles || []) as NewsArticle[]);
      const quote = quoteMap.get(company.ticker.toUpperCase()) || null;
      const sentimentHint = Number(article?.sentiment_hint || 0);
      const quoteChange = Number(quote?.change_percent || 0);
      const sentiment = deriveSentiment(sentimentHint, quoteChange);
      const riskAdjustment = deriveRisk(quoteChange, sentimentHint);
      const confidence = clamp(0.45 + (article ? 0.22 : 0) + (quote ? 0.18 : 0) + (Math.abs(sentimentHint) > 0.2 ? 0.08 : 0), 0.42, 0.91);
      const convictionImpact = clamp(sentimentHint * 0.45 + quoteChange / 18, -0.65, 0.65);
      const summary = makeNarrativeSummary(company, article, quote, sentiment, riskAdjustment);
      const sourceType = article ? "surface_news" : "surface_market";
      const sourceDocumentId = article?.id || `${company.ticker}-${quote?.as_of || new Date().toISOString()}`;
      const eventTimestamp = article?.published_at || quote?.as_of || new Date().toISOString();

      const { data: event, error: eventError } = await supabase
        .from("fins_disclosure_events")
        .upsert(
          {
            watchlist_company_id: company.id,
            ticker: company.ticker,
            filing_type: article ? "Surface Brief" : "Market Snapshot",
            source_type: sourceType,
            source_name: article?.source || quote?.source || "Surface Sync",
            source_document_id: sourceDocumentId,
            source_url: article?.url || null,
            raw_artifact_uri: null,
            content_hash: null,
            event_timestamp: eventTimestamp,
            period_end: null,
            title: article?.title || `${company.ticker} market snapshot`,
            status: "analyzed",
            extraction_status: "ready",
            metadata: {
              mode: "surface_sync",
              priority_tier: company.priority_tier,
              quote_change_percent: quoteChange,
              sentiment_hint: sentimentHint,
            },
          },
          { onConflict: "ticker,source_type,source_document_id" }
        )
        .select("*")
        .single();

      if (eventError) throw eventError;

      await supabase.from("fins_section_summaries").upsert(
        {
          disclosure_event_id: event.id,
          section_key: "surface_context",
          section_type: article ? "management_commentary" : "market_context",
          title: article?.title || `${company.ticker} surface context`,
          summary,
          importance: clamp(0.58 + Math.abs(convictionImpact) * 0.25, 0.58, 0.94),
          evidence_snippets: article
            ? [article.title, article.summary].filter(Boolean)
            : [`${company.ticker} latest price ${quote?.price ?? "n/a"}`, `${company.ticker} change ${quoteChange.toFixed(2)}%`],
          metadata: {
            generated_by: "fins-surface-sync",
          },
        },
        { onConflict: "disclosure_event_id,section_key" }
      );

      const agentPayloads = [
        {
          agent_name: "document_structuring",
          signal_summary: article
            ? "Classified a live market/news proxy event into a compact filing-like surface context."
            : "Structured quote movement into a market-context section for downstream interpretation.",
          signal_payload: {
            labels: [article ? "news_context" : "market_context", company.sector || "coverage"],
            importance: clamp(0.55 + Math.abs(quoteChange) / 10, 0.55, 0.9),
          },
        },
        {
          agent_name: "earnings_interpretation",
          signal_summary: `Tone proxy is ${sentiment} based on recent news and price response.`,
          signal_payload: {
            tone_shift: sentiment === "negative" ? "more_defensive" : sentiment === "positive" ? "more_constructive" : "stable",
            narrative_consistency: sentiment === "negative" && quoteChange < 0 ? "weakening" : "steady",
          },
        },
        {
          agent_name: "risk_evolution",
          signal_summary: `Surface risk is ${riskAdjustment} with quote change ${quoteChange.toFixed(2)}%.`,
          signal_payload: {
            risk_delta: Number(Math.abs(convictionImpact).toFixed(2)),
            dimensions: [
              { name: "market_reaction", delta: Number(Math.abs(quoteChange / 10).toFixed(2)) },
              { name: "news_tone", delta: Number(Math.abs(sentimentHint).toFixed(2)) },
            ],
          },
        },
      ];

      for (const agent of agentPayloads) {
        const { data: existingRun } = await supabase
          .from("fins_agent_runs")
          .select("id")
          .eq("disclosure_event_id", event.id)
          .eq("agent_name", agent.agent_name)
          .maybeSingle();

        const runPayload = {
          disclosure_event_id: event.id,
          agent_name: agent.agent_name,
          agent_version: "surface-v1",
          model_name: "heuristic",
          prompt_version: "surface-v1",
          status: "completed",
          latency_ms: 80,
          input_tokens: null,
          output_tokens: null,
          error_message: null,
          metadata: { generated_by: "fins-surface-sync" },
          updated_at: new Date().toISOString(),
        };

        const runId = existingRun?.id
          ? (
              await supabase
                .from("fins_agent_runs")
                .update(runPayload)
                .eq("id", existingRun.id)
                .select("id")
                .single()
            ).data?.id
          : (
              await supabase
                .from("fins_agent_runs")
                .insert(runPayload)
                .select("id")
                .single()
            ).data?.id;

        const { data: existingSignal } = await supabase
          .from("fins_agent_signals")
          .select("id")
          .eq("disclosure_event_id", event.id)
          .eq("agent_name", agent.agent_name)
          .maybeSingle();

        if (existingSignal?.id) {
          await supabase
            .from("fins_agent_signals")
            .update({
              agent_run_id: runId || null,
              directional_sentiment: sentiment,
              risk_adjustment: riskAdjustment,
              confidence,
              signal_summary: agent.signal_summary,
              signal_payload: agent.signal_payload,
            })
            .eq("id", existingSignal.id);
        } else {
          await supabase.from("fins_agent_signals").insert({
            disclosure_event_id: event.id,
            agent_run_id: runId || null,
            agent_name: agent.agent_name,
            directional_sentiment: sentiment,
            risk_adjustment: riskAdjustment,
            confidence,
            signal_summary: agent.signal_summary,
            signal_payload: agent.signal_payload,
          });
        }
      }

      const { data: fusedSignal, error: fusedError } = await supabase
        .from("fins_fused_signals")
        .upsert(
          {
            disclosure_event_id: event.id,
            ticker: company.ticker,
            directional_sentiment: sentiment,
            risk_adjustment: riskAdjustment,
            conviction_impact: Number(convictionImpact.toFixed(3)),
            confidence: Number(confidence.toFixed(3)),
            causal_summary: summary,
            comparative_context: {
              vs_prior_period:
                sentiment === "negative"
                  ? "surface_deterioration"
                  : sentiment === "positive"
                    ? "surface_improvement"
                    : "surface_stable",
            },
            signal_payload: {
              generated_by: "fins-surface-sync",
              sentiment_hint: sentimentHint,
              quote_change_percent: quoteChange,
            },
          },
          { onConflict: "disclosure_event_id" }
        )
        .select("*")
        .single();

      if (fusedError) throw fusedError;

      const action = deriveAction(convictionImpact, riskAdjustment);
      const { data: existingDecision } = await supabase
        .from("fins_decision_records")
        .select("id")
        .eq("disclosure_event_id", event.id)
        .maybeSingle();

      const decisionPayload = {
        disclosure_event_id: event.id,
        fused_signal_id: fusedSignal.id,
        ticker: company.ticker,
        action: action.action,
        magnitude: action.magnitude,
        conviction_before: Number((0.5 - convictionImpact / 2).toFixed(3)),
        conviction_after: Number((0.5 + convictionImpact / 2).toFixed(3)),
        causal_explanation: {
          primary_driver: summary,
          supporting_signals: [
            `sentiment:${sentiment}`,
            `risk:${riskAdjustment}`,
            `quote_change:${quoteChange.toFixed(2)}%`,
          ],
        },
        policy_name: "surface-fins-policy",
        policy_version: "v1",
      };

      if (existingDecision?.id) {
        await supabase.from("fins_decision_records").update(decisionPayload).eq("id", existingDecision.id);
      } else {
        await supabase.from("fins_decision_records").insert(decisionPayload);
      }

      const evidenceSnippet = article?.summary || article?.title || `${company.ticker} quote change ${quoteChange.toFixed(2)}%`;
      const { data: existingEvidence } = await supabase
        .from("fins_signal_evidence")
        .select("id")
        .eq("disclosure_event_id", event.id)
        .eq("snippet", evidenceSnippet)
        .maybeSingle();

      if (!existingEvidence?.id) {
        await supabase.from("fins_signal_evidence").insert({
          disclosure_event_id: event.id,
          agent_signal_id: null,
          fused_signal_id: fusedSignal.id,
          section_key: "surface_context",
          snippet: evidenceSnippet,
          source_pointer: {
            source_type: sourceType,
            url: article?.url || null,
            published_at: article?.published_at || quote?.as_of || null,
          },
        });
      }

      const meaningfulShift = action.action !== "hold" || riskAdjustment === "increase";
      if (meaningfulShift) {
        const { data: existingAlert } = await supabase
          .from("fins_alerts")
          .select("id")
          .eq("disclosure_event_id", event.id)
          .maybeSingle();

        const alertPayload = {
          disclosure_event_id: event.id,
          fused_signal_id: fusedSignal.id,
          ticker: company.ticker,
          severity: riskAdjustment === "increase" ? "warning" : "info",
          alert_type: "surface_shift",
          message: `${company.ticker}: ${summary}`,
          payload: {
            action: action.action,
            magnitude: action.magnitude,
          },
        };

        if (existingAlert?.id) {
          await supabase.from("fins_alerts").update(alertPayload).eq("id", existingAlert.id);
        } else {
          await supabase.from("fins_alerts").insert(alertPayload);
        }
      }

      decisions.push({ ticker: company.ticker, action: action.action, sentiment, risk: riskAdjustment });
      processed += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "surface_sync",
        processed,
        decisions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("FINS surface sync failed", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
