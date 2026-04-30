import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SEC_USER_AGENT = "AceTrading admin@acetrading.io";
const RELEVANT_FORMS = new Set([
  "10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A",
  "S-1", "S-1/A", "DEF 14A", "DEFA14A",
  "4", "SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A",
  "20-F", "6-K",
]);
const MAX_FILINGS_PER_COMPANY = 12;
const LOOKBACK_DAYS = 90;

type WatchlistCompany = {
  id: string;
  watchlist_id: string;
  ticker: string;
  company_name: string | null;
  cik: string | null;
  sector: string | null;
  priority_tier: number;
};

type EdgarFiling = {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  fileNumber: string;
  filmNumber: string;
  items: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFilingUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const accessionClean = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accessionClean}/${primaryDocument}`;
}

function buildIndexUrl(cik: string, accessionNumber: string): string {
  const accessionClean = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accessionClean}/`;
}

function classifyFilingSentiment(form: string, items: string): {
  sentiment: "positive" | "neutral" | "negative";
  risk: "increase" | "decrease" | "stable";
  confidence: number;
  summary: string;
} {
  const formUpper = form.toUpperCase();

  // 8-K item codes can indicate material events
  if (formUpper.startsWith("8-K")) {
    const itemsList = items.toLowerCase();
    // Item 2.01 = acquisition/disposition, 1.01 = material agreement
    if (itemsList.includes("2.01") || itemsList.includes("1.01")) {
      return {
        sentiment: "neutral",
        risk: "increase",
        confidence: 0.72,
        summary: `Material event disclosed via ${form}. Item codes: ${items || "not specified"}. Requires review for strategic impact.`,
      };
    }
    // Item 2.02 = results of operations (earnings)
    if (itemsList.includes("2.02")) {
      return {
        sentiment: "neutral",
        risk: "stable",
        confidence: 0.78,
        summary: `Earnings/results disclosed via ${form}. Item 2.02 indicates financial results release.`,
      };
    }
    // Item 5.02 = departure of directors/officers
    if (itemsList.includes("5.02")) {
      return {
        sentiment: "neutral",
        risk: "increase",
        confidence: 0.68,
        summary: `Leadership change disclosed via ${form}. Item 5.02 indicates officer/director departure.`,
      };
    }
    // Item 7.01 or 8.01 = regulation FD disclosure
    if (itemsList.includes("7.01") || itemsList.includes("8.01")) {
      return {
        sentiment: "neutral",
        risk: "stable",
        confidence: 0.65,
        summary: `Regulation FD disclosure via ${form}. Informational filing for public dissemination.`,
      };
    }
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.62,
      summary: `Current report (${form}) filed. Contains material event disclosure requiring further analysis.`,
    };
  }

  // Annual reports
  if (formUpper.startsWith("10-K")) {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.82,
      summary: `Annual report (${form}) filed with comprehensive financial statements, risk factors, and management discussion.`,
    };
  }

  // Quarterly reports
  if (formUpper.startsWith("10-Q")) {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.78,
      summary: `Quarterly report (${form}) filed with interim financial statements and management commentary.`,
    };
  }

  // Proxy statements
  if (formUpper.includes("DEF 14A") || formUpper.includes("DEFA14A")) {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.60,
      summary: `Proxy statement (${form}) filed. Contains executive compensation, board proposals, and shareholder voting items.`,
    };
  }

  // Insider trading (Form 4)
  if (formUpper === "4") {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.58,
      summary: `Insider transaction (Form 4) reported. Requires analysis of buy/sell direction and volume.`,
    };
  }

  // Registration statements
  if (formUpper.startsWith("S-1")) {
    return {
      sentiment: "neutral",
      risk: "increase",
      confidence: 0.70,
      summary: `Registration statement (${form}) filed. May indicate IPO, secondary offering, or capital raise activity.`,
    };
  }

  // Beneficial ownership
  if (formUpper.includes("SC 13")) {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.65,
      summary: `Beneficial ownership report (${form}) filed. Indicates significant stake acquisition or change.`,
    };
  }

  // Foreign private issuer reports
  if (formUpper === "20-F" || formUpper === "6-K") {
    return {
      sentiment: "neutral",
      risk: "stable",
      confidence: 0.72,
      summary: `Foreign issuer report (${form}) filed with financial disclosure and operational updates.`,
    };
  }

  return {
    sentiment: "neutral",
    risk: "stable",
    confidence: 0.55,
    summary: `SEC filing (${form}) detected. Automated classification pending manual review.`,
  };
}

function deriveAction(risk: string, confidence: number): { action: string; magnitude: number } {
  if (risk === "increase" && confidence > 0.7) return { action: "reduce_exposure", magnitude: 0.15 };
  if (risk === "increase") return { action: "hold", magnitude: 0 };
  if (risk === "decrease" && confidence > 0.75) return { action: "increase_exposure", magnitude: 0.10 };
  return { action: "hold", magnitude: 0 };
}

async function fetchEdgarSubmissions(cik: string): Promise<EdgarFiling[]> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    console.error(`EDGAR fetch failed for CIK ${cik}: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  const recent = data?.filings?.recent;
  if (!recent) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const filings: EdgarFiling[] = [];
  const count = recent.accessionNumber?.length || 0;

  for (let i = 0; i < count && filings.length < MAX_FILINGS_PER_COMPANY; i++) {
    const form = recent.form?.[i] || "";
    const filingDate = recent.filingDate?.[i] || "";

    if (!RELEVANT_FORMS.has(form)) continue;
    if (filingDate < cutoffStr) continue;

    filings.push({
      accessionNumber: recent.accessionNumber[i],
      filingDate,
      reportDate: recent.reportDate?.[i] || filingDate,
      form,
      primaryDocument: recent.primaryDocument?.[i] || "",
      primaryDocDescription: recent.primaryDocDescription?.[i] || "",
      fileNumber: recent.fileNumber?.[i] || "",
      filmNumber: recent.filmNumber?.[i] || "",
      items: recent.items?.[i] || "",
    });
  }

  return filings;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get companies with CIK numbers
    const { data: companies, error: companiesError } = await supabase
      .from("fins_watchlist_companies")
      .select("id, watchlist_id, ticker, company_name, cik, sector, priority_tier")
      .not("cik", "is", null)
      .order("priority_tier", { ascending: true });

    if (companiesError) throw companiesError;
    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No companies with CIK numbers found." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;
    let totalNewFilings = 0;
    const results: Array<{ ticker: string; filings_found: number; new_filings: number }> = [];

    for (const company of companies as WatchlistCompany[]) {
      if (!company.cik) continue;

      // Rate limit: SEC allows 10 req/sec, we'll be conservative
      await sleep(250);

      const filings = await fetchEdgarSubmissions(company.cik);
      let newFilings = 0;

      for (const filing of filings) {
        const sourceDocumentId = filing.accessionNumber;
        const sourceUrl = filing.primaryDocument
          ? buildFilingUrl(company.cik, filing.accessionNumber, filing.primaryDocument)
          : buildIndexUrl(company.cik, filing.accessionNumber);

        const classification = classifyFilingSentiment(filing.form, filing.items);

        // Upsert disclosure event
        const { data: event, error: eventError } = await supabase
          .from("fins_disclosure_events")
          .upsert(
            {
              watchlist_company_id: company.id,
              ticker: company.ticker,
              filing_type: filing.form,
              source_type: "sec_edgar",
              source_name: "SEC EDGAR",
              source_document_id: sourceDocumentId,
              source_url: sourceUrl,
              raw_artifact_uri: null,
              content_hash: null,
              event_timestamp: `${filing.filingDate}T16:00:00Z`,
              period_end: filing.reportDate || null,
              title: `${company.ticker} ${filing.form} — ${filing.primaryDocDescription || filing.form}`,
              status: "analyzed",
              extraction_status: "ready",
              metadata: {
                mode: "sec_edgar_ingest",
                form_type: filing.form,
                accession_number: filing.accessionNumber,
                file_number: filing.fileNumber,
                items: filing.items,
                primary_document: filing.primaryDocument,
                priority_tier: company.priority_tier,
              },
            },
            { onConflict: "ticker,source_type,source_document_id" }
          )
          .select("*")
          .single();

        if (eventError) {
          console.error(`Event upsert failed for ${company.ticker} ${filing.accessionNumber}:`, eventError);
          continue;
        }

        newFilings++;

        // Upsert section summary
        await supabase.from("fins_section_summaries").upsert(
          {
            disclosure_event_id: event.id,
            section_key: "sec_filing_context",
            section_type: filing.form.startsWith("10-") ? "financial_statements" : "regulatory_disclosure",
            title: `${company.ticker} ${filing.form} filing analysis`,
            summary: classification.summary,
            importance: clamp(0.65 + (filing.form.startsWith("10-K") ? 0.20 : filing.form.startsWith("8-K") ? 0.15 : 0.10), 0.65, 0.95),
            evidence_snippets: [
              `Form: ${filing.form}`,
              `Filed: ${filing.filingDate}`,
              `Report Period: ${filing.reportDate || "N/A"}`,
              filing.items ? `Items: ${filing.items}` : null,
              filing.primaryDocDescription || null,
            ].filter(Boolean),
            metadata: {
              generated_by: "fins-sec-ingestor",
              accession_number: filing.accessionNumber,
            },
          },
          { onConflict: "disclosure_event_id,section_key" }
        );

        // Agent runs and signals
        const agentPayloads = [
          {
            agent_name: "document_structuring",
            signal_summary: `Classified SEC ${filing.form} filing into structured disclosure event for ${company.ticker}.`,
            signal_payload: {
              labels: ["sec_filing", filing.form.toLowerCase().replace(/[^a-z0-9]/g, "_"), company.sector || "coverage"],
              importance: clamp(0.70 + (filing.form.startsWith("10-K") ? 0.15 : 0.05), 0.70, 0.95),
            },
          },
          {
            agent_name: "earnings_interpretation",
            signal_summary: `SEC ${filing.form} interpreted. ${classification.summary}`,
            signal_payload: {
              tone_shift: classification.risk === "increase" ? "more_defensive" : "stable",
              narrative_consistency: "sec_filing_baseline",
              form_type: filing.form,
            },
          },
          {
            agent_name: "risk_evolution",
            signal_summary: `Risk assessment from ${filing.form}: ${classification.risk}. Confidence: ${classification.confidence.toFixed(2)}.`,
            signal_payload: {
              risk_delta: classification.risk === "increase" ? 0.15 : classification.risk === "decrease" ? -0.10 : 0,
              dimensions: [
                { name: "regulatory_disclosure", delta: classification.risk === "increase" ? 0.20 : 0.05 },
                { name: "filing_materiality", delta: filing.form.startsWith("8-K") ? 0.15 : 0.05 },
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
            agent_version: "sec-ingest-v1",
            model_name: "heuristic",
            prompt_version: "sec-ingest-v1",
            status: "completed",
            latency_ms: 50,
            input_tokens: null,
            output_tokens: null,
            error_message: null,
            metadata: { generated_by: "fins-sec-ingestor" },
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
                directional_sentiment: classification.sentiment,
                risk_adjustment: classification.risk,
                confidence: classification.confidence,
                signal_summary: agent.signal_summary,
                signal_payload: agent.signal_payload,
              })
              .eq("id", existingSignal.id);
          } else {
            await supabase.from("fins_agent_signals").insert({
              disclosure_event_id: event.id,
              agent_run_id: runId || null,
              agent_name: agent.agent_name,
              directional_sentiment: classification.sentiment,
              risk_adjustment: classification.risk,
              confidence: classification.confidence,
              signal_summary: agent.signal_summary,
              signal_payload: agent.signal_payload,
            });
          }
        }

        // Fused signal
        const convictionImpact = classification.risk === "increase" ? -0.12 : classification.risk === "decrease" ? 0.10 : 0;

        const { data: fusedSignal, error: fusedError } = await supabase
          .from("fins_fused_signals")
          .upsert(
            {
              disclosure_event_id: event.id,
              ticker: company.ticker,
              directional_sentiment: classification.sentiment,
              risk_adjustment: classification.risk,
              conviction_impact: Number(convictionImpact.toFixed(3)),
              confidence: Number(classification.confidence.toFixed(3)),
              causal_summary: classification.summary,
              comparative_context: {
                primary_finding: classification.summary,
                impact_reasoning: `SEC ${filing.form} filing detected for ${company.ticker}. ${classification.risk === "increase" ? "Elevated risk profile." : "Baseline risk assessment."}`,
                vs_prior_period: classification.risk === "increase" ? "risk_elevated" : "baseline",
              },
              signal_payload: {
                generated_by: "fins-sec-ingestor",
                form_type: filing.form,
                items: filing.items,
                filing_date: filing.filingDate,
              },
            },
            { onConflict: "disclosure_event_id" }
          )
          .select("*")
          .single();

        if (fusedError) {
          console.error(`Fused signal error for ${company.ticker}:`, fusedError);
          continue;
        }

        // Decision record
        const action = deriveAction(classification.risk, classification.confidence);
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
            primary_driver: classification.summary,
            supporting_signals: [
              `form:${filing.form}`,
              `risk:${classification.risk}`,
              `confidence:${classification.confidence.toFixed(2)}`,
              `filed:${filing.filingDate}`,
            ],
          },
          policy_name: "sec-edgar-fins-policy",
          policy_version: "v1",
        };

        if (existingDecision?.id) {
          await supabase.from("fins_decision_records").update(decisionPayload).eq("id", existingDecision.id);
        } else {
          await supabase.from("fins_decision_records").insert(decisionPayload);
        }

        // Evidence
        const evidenceSnippet = `${filing.form} filed ${filing.filingDate}: ${filing.primaryDocDescription || filing.form}`;
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
            section_key: "sec_filing_context",
            snippet: evidenceSnippet,
            source_pointer: {
              source_type: "sec_edgar",
              url: sourceUrl,
              filing_date: filing.filingDate,
              accession_number: filing.accessionNumber,
              form_type: filing.form,
            },
          });
        }
      }

      results.push({
        ticker: company.ticker,
        filings_found: filings.length,
        new_filings: newFilings,
      });

      totalProcessed++;
      totalNewFilings += newFilings;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "sec_edgar_ingest",
        companies_processed: totalProcessed,
        total_new_filings: totalNewFilings,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("FINS SEC ingestor failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
