import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FinsWatchlistRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FinsWatchlistCompanyRow = {
  id: string;
  watchlist_id: string;
  ticker: string;
  company_name: string | null;
  sector: string | null;
  priority_tier: number;
  exchange: string | null;
  cik: string | null;
  metadata: Record<string, unknown> | null;
};

export type FinsDisclosureEventRow = {
  id: string;
  watchlist_company_id: string;
  ticker: string;
  filing_type: string;
  source_type: string;
  source_name: string;
  source_document_id: string;
  source_url: string | null;
  raw_artifact_uri: string | null;
  content_hash: string | null;
  event_timestamp: string;
  period_end: string | null;
  title: string | null;
  status: string;
  extraction_status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type FinsFusedSignalRow = {
  id: string;
  disclosure_event_id: string;
  ticker: string;
  directional_sentiment: "positive" | "neutral" | "negative";
  risk_adjustment: "increase" | "decrease" | "stable";
  conviction_impact: number | null;
  confidence: number;
  causal_summary: string | null;
  comparative_context: Record<string, unknown> | null;
  signal_payload: Record<string, unknown> | null;
  created_at: string;
};

export type FinsDecisionRow = {
  id: string;
  disclosure_event_id: string;
  fused_signal_id: string | null;
  ticker: string;
  action: "increase_exposure" | "reduce_exposure" | "exit_position" | "hold";
  magnitude: number;
  conviction_before: number | null;
  conviction_after: number | null;
  causal_explanation: Record<string, unknown> | null;
  policy_name: string | null;
  policy_version: string | null;
  created_at: string;
};

export type FinsEvidenceRow = {
  id: string;
  disclosure_event_id: string;
  agent_signal_id: string | null;
  fused_signal_id: string | null;
  section_key: string | null;
  snippet: string;
  source_pointer: Record<string, unknown> | null;
  created_at: string;
};

export type FinsAlertRow = {
  id: string;
  disclosure_event_id: string;
  fused_signal_id: string | null;
  ticker: string;
  severity: "info" | "warning" | "critical";
  alert_type: string;
  message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type MarketQuoteRow = {
  symbol: string;
  price: number | null;
  change_percent: number | null;
  source: string;
  as_of: string;
};

export type NewsArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string | null;
  sentiment_hint: number | null;
  symbols: unknown;
  url: string | null;
};

export type FinsDataPayload = {
  watchlists: FinsWatchlistRow[];
  companies: FinsWatchlistCompanyRow[];
  disclosureEvents: FinsDisclosureEventRow[];
  fusedSignals: FinsFusedSignalRow[];
  decisions: FinsDecisionRow[];
  evidence: FinsEvidenceRow[];
  alerts: FinsAlertRow[];
  quotes: MarketQuoteRow[];
  news: NewsArticleRow[];
};

async function maybeThrow(error: unknown) {
  if (error) throw error;
}

export function useFinsData() {
  return useQuery({
    queryKey: ["fins-dashboard"],
    staleTime: 60_000,
    queryFn: async (): Promise<FinsDataPayload> => {
      const client = supabase as unknown as typeof supabase & {
        from: (relation: string) => ReturnType<typeof supabase.from>;
      };

      const [
        watchlistsRes,
        companiesRes,
        disclosureEventsRes,
        fusedSignalsRes,
        decisionsRes,
        evidenceRes,
        alertsRes,
        quotesRes,
        newsRes,
      ] = await Promise.all([
        client.from("fins_watchlists").select("*").eq("status", "active").order("updated_at", { ascending: false }).limit(4),
        client.from("fins_watchlist_companies").select("*").order("priority_tier", { ascending: true }).order("ticker", { ascending: true }).limit(24),
        client.from("fins_disclosure_events").select("*").order("event_timestamp", { ascending: false }).limit(60),
        client.from("fins_fused_signals").select("*").order("created_at", { ascending: false }).limit(60),
        client.from("fins_decision_records").select("*").order("created_at", { ascending: false }).limit(60),
        client.from("fins_signal_evidence").select("*").order("created_at", { ascending: false }).limit(100),
        client.from("fins_alerts").select("*").order("created_at", { ascending: false }).limit(20),
        client.from("market_quotes").select("symbol, price, change_percent, source, as_of").order("as_of", { ascending: false }).limit(120),
        client.from("news_articles").select("id, title, summary, source, published_at, sentiment_hint, symbols, url").order("published_at", { ascending: false }).limit(24),
      ]);

      if (newsRes.error) {
        console.error("[FINS] News fetch failed:", newsRes.error);
      }

      await Promise.all([
        maybeThrow(watchlistsRes.error),
        maybeThrow(companiesRes.error),
        maybeThrow(disclosureEventsRes.error),
        maybeThrow(fusedSignalsRes.error),
        maybeThrow(decisionsRes.error),
        maybeThrow(evidenceRes.error),
        maybeThrow(alertsRes.error),
        maybeThrow(quotesRes.error),
      ]);

      return {
        watchlists: (watchlistsRes.data ?? []) as FinsWatchlistRow[],
        companies: (companiesRes.data ?? []) as FinsWatchlistCompanyRow[],
        disclosureEvents: (disclosureEventsRes.data ?? []) as FinsDisclosureEventRow[],
        fusedSignals: (fusedSignalsRes.data ?? []) as FinsFusedSignalRow[],
        decisions: (decisionsRes.data ?? []) as FinsDecisionRow[],
        evidence: (evidenceRes.data ?? []) as FinsEvidenceRow[],
        alerts: (alertsRes.data ?? []) as FinsAlertRow[],
        quotes: (quotesRes.data ?? []) as MarketQuoteRow[],
        news: (newsRes.data ?? []) as NewsArticleRow[],
      };
    },
  });
}
