import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  ArrowUpRight,
  Building2,
  CircleAlert,
  FileText,
  Gauge,
  Radar,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useFinsData } from "@/hooks/useFinsData";

type WatchlistCompany = {
  ticker: string;
  name: string;
  sector: string;
  conviction: number;
  sentiment: "positive" | "neutral" | "negative";
  risk: "increase" | "stable" | "decrease";
  nextCatalyst: string;
};

type FilingEvent = {
  ticker: string;
  company: string;
  filingType: string;
  timestamp: string;
  status: string;
  summary: string;
  action: string;
};

type SignalCard = {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "negative";
  detail: string;
};

type AuditTrail = {
  ticker: string;
  filing: string;
  excerpt: string;
  change: string;
  impact: string;
};

const fallbackWatchlist: WatchlistCompany[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    sector: "Semis",
    conviction: 82,
    sentiment: "positive",
    risk: "stable",
    nextCatalyst: "Earnings call in 12d",
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    sector: "Platform",
    conviction: 71,
    sentiment: "neutral",
    risk: "decrease",
    nextCatalyst: "10-Q monitored",
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    sector: "Mobility",
    conviction: 38,
    sentiment: "negative",
    risk: "increase",
    nextCatalyst: "8-K watch active",
  },
  {
    ticker: "XOM",
    name: "Exxon Mobil",
    sector: "Energy",
    conviction: 64,
    sentiment: "positive",
    risk: "stable",
    nextCatalyst: "Transcript pending refresh",
  },
];

const fallbackFilingEvents: FilingEvent[] = [
  {
    ticker: "TSLA",
    company: "Tesla",
    filingType: "8-K",
    timestamp: "6m ago",
    status: "Material change detected",
    summary: "Management language turned more defensive around margin durability and near-term delivery pacing.",
    action: "Reduce exposure 25 bps",
  },
  {
    ticker: "MSFT",
    company: "Microsoft",
    filingType: "10-Q",
    timestamp: "51m ago",
    status: "Normalized and fused",
    summary: "Risk disclosures remained controlled while cloud demand commentary stayed constructive versus the prior quarter.",
    action: "Hold / conviction +4",
  },
  {
    ticker: "XOM",
    company: "Exxon Mobil",
    filingType: "Transcript",
    timestamp: "2h ago",
    status: "Interpretation complete",
    summary: "Tone improved on capital discipline and project cadence, with no meaningful escalation in disclosed operating risk.",
    action: "Increase exposure 15 bps",
  },
];

const fallbackSignalCards: SignalCard[] = [
  {
    label: "Directional Sentiment",
    value: "Negative Drift",
    tone: "negative",
    detail: "Narrative tone weakened across 2 of the last 3 material events.",
  },
  {
    label: "Risk Evolution",
    value: "+0.34 Delta",
    tone: "negative",
    detail: "Regulatory and margin-risk language expanded against prior disclosures.",
  },
  {
    label: "Decision Confidence",
    value: "0.81",
    tone: "positive",
    detail: "High agreement between structuring, tone, and risk agents.",
  },
  {
    label: "Action Bias",
    value: "De-risking",
    tone: "neutral",
    detail: "Sizing policy is shifting capital toward higher-quality narrative setups.",
  },
];

const fallbackAuditTrail: AuditTrail[] = [
  {
    ticker: "TSLA",
    filing: "Q1 shareholder deck",
    excerpt: "We remain cautious on near-term demand visibility and are pacing production accordingly.",
    change: "New cautionary framing versus prior quarter optimism.",
    impact: "Earnings Interpretation Agent downgraded tone and pushed conviction lower.",
  },
  {
    ticker: "MSFT",
    filing: "10-Q risk factors",
    excerpt: "We continue to monitor regulatory developments with no material change to current operations.",
    change: "Regulatory language softened compared with last filing.",
    impact: "Risk Evolution Agent marked regulatory pressure as stable-to-improving.",
  },
  {
    ticker: "XOM",
    filing: "Prepared remarks",
    excerpt: "Project execution remains on schedule and capital returns continue within our framework.",
    change: "Execution commentary improved with fewer hedges and tighter guidance framing.",
    impact: "Fusion layer increased action bias toward adding measured exposure.",
  },
];

const sectionClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)]";

const toneStyles: Record<SignalCard["tone"], string> = {
  positive: "text-emerald-300 border-emerald-400/20 bg-emerald-500/10",
  neutral: "text-cyan-200 border-cyan-400/20 bg-cyan-500/10",
  negative: "text-amber-200 border-amber-400/20 bg-amber-500/10",
};

const sentimentStyles: Record<WatchlistCompany["sentiment"], string> = {
  positive: "text-emerald-300",
  neutral: "text-cyan-200",
  negative: "text-amber-200",
};

const riskStyles: Record<WatchlistCompany["risk"], string> = {
  increase: "text-amber-200",
  stable: "text-white/70",
  decrease: "text-emerald-300",
};

function timeAgo(value: string | null | undefined) {
  if (!value) return "pending";
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const Fins = () => {
  const { data, isLoading, error } = useFinsData();

  const derived = useMemo(() => {
    if (!data) {
      return {
        watchlist: fallbackWatchlist,
        filingEvents: fallbackFilingEvents,
        signalCards: fallbackSignalCards,
        auditTrail: fallbackAuditTrail,
        headlineCounts: {
          watchlistCount: "24 names",
          eventCount: "312",
          alertCount: "8 active",
          confidence: "0.79",
        },
        decisionBias: {
          title: "Reduce 0.18x",
          body: "Weakening executive tone and broadening regulatory language are pressuring exposure in the lower-conviction sleeve.",
        },
      };
    }

    const companyMap = new Map(data.companies.map((company) => [company.id, company]));
    const decisionMap = new Map(data.decisions.map((decision) => [decision.disclosure_event_id, decision]));
    const evidenceByEvent = new Map<string, string[]>();

    for (const row of data.evidence) {
      const snippets = evidenceByEvent.get(row.disclosure_event_id) ?? [];
      if (snippets.length < 2) snippets.push(row.snippet);
      evidenceByEvent.set(row.disclosure_event_id, snippets);
    }

    const watchlist =
      data.companies.length > 0
        ? data.companies.slice(0, 6).map((company, index) => {
            const signal = data.fusedSignals.find((item) => item.ticker === company.ticker);
            const convictionRaw =
              signal?.conviction_impact !== null && signal?.conviction_impact !== undefined
                ? 50 + signal.conviction_impact * 100
                : 72 - company.priority_tier * 8 + Math.max(0, 12 - index * 2);

            return {
              ticker: company.ticker,
              name: company.company_name ?? company.ticker,
              sector: company.sector ?? "Coverage",
              conviction: Math.max(18, Math.min(96, Math.round(convictionRaw))),
              sentiment: signal?.directional_sentiment ?? "neutral",
              risk: signal?.risk_adjustment ?? "stable",
              nextCatalyst: signal ? `Last fused ${timeAgo(signal.created_at)}` : "Awaiting first filing event",
            } as WatchlistCompany;
          })
        : fallbackWatchlist;

    const filingEvents =
      data.disclosureEvents.length > 0
        ? data.disclosureEvents.slice(0, 6).map((event) => {
            const company = companyMap.get(event.watchlist_company_id);
            const signal = data.fusedSignals.find((item) => item.disclosure_event_id === event.id);
            const decision = decisionMap.get(event.id);
            return {
              ticker: event.ticker,
              company: company?.company_name ?? event.ticker,
              filingType: event.filing_type,
              timestamp: timeAgo(event.event_timestamp),
              status: `${event.status.replaceAll("_", " ")} / ${event.extraction_status.replaceAll("_", " ")}`,
              summary:
                signal?.causal_summary ??
                event.title ??
                `New ${event.filing_type} detected from ${event.source_name}. FINS is tracking for structured interpretation.`,
              action: decision
                ? `${decision.action.replaceAll("_", " ")} ${decision.magnitude ? `${Math.round(decision.magnitude * 100)} bps` : ""}`.trim()
                : "Awaiting policy decision",
            } as FilingEvent;
          })
        : fallbackFilingEvents;

    const avgConfidence =
      data.fusedSignals.length > 0
        ? (data.fusedSignals.reduce((sum, item) => sum + Number(item.confidence ?? 0), 0) / data.fusedSignals.length).toFixed(2)
        : "0.79";

    const sentimentCounts = data.fusedSignals.reduce(
      (acc, item) => {
        acc[item.directional_sentiment] += 1;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 }
    );

    const dominantSentiment =
      sentimentCounts.negative >= sentimentCounts.positive && sentimentCounts.negative >= sentimentCounts.neutral
        ? "Negative Drift"
        : sentimentCounts.positive >= sentimentCounts.neutral
          ? "Positive Momentum"
          : "Neutral Balance";

    const aggregateConvictionImpact = data.fusedSignals.reduce((sum, item) => sum + Number(item.conviction_impact ?? 0), 0);
    const avgRiskDelta =
      data.fusedSignals.length > 0
        ? Math.abs(aggregateConvictionImpact / data.fusedSignals.length).toFixed(2)
        : "0.34";

    const signalCards =
      data.fusedSignals.length > 0
        ? [
            {
              label: "Directional Sentiment",
              value: dominantSentiment,
              tone: sentimentCounts.negative > sentimentCounts.positive ? "negative" : sentimentCounts.positive > 0 ? "positive" : "neutral",
              detail: `${data.fusedSignals.length} fused signals currently in the comparison window.`,
            },
            {
              label: "Risk Evolution",
              value: `${aggregateConvictionImpact >= 0 ? "+" : "-"}${avgRiskDelta} Delta`,
              tone: aggregateConvictionImpact < 0 ? "negative" : aggregateConvictionImpact > 0 ? "positive" : "neutral",
              detail: "Blended from current conviction impact across the latest filing events.",
            },
            {
              label: "Decision Confidence",
              value: avgConfidence,
              tone: Number(avgConfidence) >= 0.75 ? "positive" : "neutral",
              detail: "Mean fused confidence across the active event set.",
            },
            {
              label: "Action Bias",
              value:
                data.decisions[0]?.action.replaceAll("_", " ") ??
                (aggregateConvictionImpact < 0 ? "De-risking" : "Selective add"),
              tone: "neutral",
              detail: `${data.alerts.length} alert${data.alerts.length === 1 ? "" : "s"} currently in the system.`,
            },
          ]
        : fallbackSignalCards;

    const auditTrail =
      data.disclosureEvents.length > 0
        ? data.disclosureEvents.slice(0, 3).map((event) => {
            const company = companyMap.get(event.watchlist_company_id);
            const signal = data.fusedSignals.find((item) => item.disclosure_event_id === event.id);
            const evidence = evidenceByEvent.get(event.id)?.[0];
            return {
              ticker: event.ticker,
              filing: event.title ?? `${event.filing_type} / ${event.source_name}`,
              excerpt: evidence ?? "Evidence will populate here as the ingestion and agent layers attach supporting snippets.",
              change:
                (signal?.comparative_context?.vs_prior_period as string | undefined)?.replaceAll("_", " ") ??
                `${company?.company_name ?? event.ticker} event registered and normalized for historical comparison.`,
              impact:
                signal?.causal_summary ??
                "No fused decision has been written yet, so this event is currently informing baseline memory only.",
            } as AuditTrail;
          })
        : fallbackAuditTrail;

    const decisionBias =
      data.decisions.length > 0
        ? {
            title: `${data.decisions[0].action.replaceAll("_", " ")} ${Math.round(Number(data.decisions[0].magnitude ?? 0) * 100)} bps`,
            body:
              (data.decisions[0].causal_explanation?.primary_driver as string | undefined) ??
              "Latest fused event has been routed into the decision engine with a bounded action payload.",
          }
        : {
            title: data.alerts.length > 0 ? "Active review" : "Hold baseline",
            body:
              data.alerts[0]?.message ??
              "The decision layer is standing by for the next material filing or transcript event.",
          };

    return {
      watchlist,
      filingEvents,
      signalCards,
      auditTrail,
      headlineCounts: {
        watchlistCount: `${data.companies.length || watchlist.length} names`,
        eventCount: `${data.disclosureEvents.length} events`,
        alertCount: `${data.alerts.length} active`,
        confidence: avgConfidence,
      },
      decisionBias,
    };
  }, [data]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#061114] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(31,188,156,0.22),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#071114_0%,_#041012_48%,_#03090a_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      </div>

      <main className="relative px-6 pb-24 pt-32 md:px-10">
        <section className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]"
          >
            <div className={`${sectionClass} overflow-hidden p-8 md:p-10`}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-white/60">
                    <ScanSearch className="h-3.5 w-3.5" />
                    Filing Intelligence
                  </div>
                  <div className="max-w-3xl space-y-4">
                    <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
                      FINS turns filings into trade-grade intelligence.
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-white/62 md:text-lg">
                      A continuous operating surface for disclosure monitoring, earnings interpretation, risk evolution, and
                      policy-bounded capital allocation.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-right">
                    <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Control Plane</div>
                    <div className="text-3xl font-semibold text-white">Live</div>
                    <div className="text-sm text-white/45">Built with data from zerve</div>
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-4">
                {[
                  { label: "Watchlist", value: derived.headlineCounts.watchlistCount, icon: Building2 },
                  { label: "Monitored Events", value: derived.headlineCounts.eventCount, icon: FileText },
                  { label: "Decision Alerts", value: derived.headlineCounts.alertCount, icon: CircleAlert },
                  { label: "Avg Confidence", value: derived.headlineCounts.confidence, icon: Gauge },
                ].map((item, index) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">{item.label}</div>
                      <item.icon className="h-4 w-4 text-white/45" />
                    </div>
                    <div className="mt-4 text-2xl font-semibold text-white">{item.value}</div>
                    <div className="mt-2 text-sm text-white/40">
                      {index === 0 && "Priority-tier sweeps and event-driven follow-up"}
                      {index === 1 && "Structured from filings, transcripts, and material events"}
                      {index === 2 && "Thresholded by fused narrative and risk shifts"}
                      {index === 3 && "Agent agreement after historical comparison"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${sectionClass} p-8`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Decision Pulse</div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Current system posture</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  Policy bounded
                </div>
              </div>

              <div className="mt-8 space-y-5">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/55">Aggregate action bias</div>
                    <TrendingDown className="h-4 w-4 text-amber-200" />
                  </div>
                  <div className="mt-3 text-4xl font-semibold text-white">{derived.decisionBias.title}</div>
                  <div className="mt-2 text-sm leading-6 text-white/45">
                    {derived.decisionBias.body}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {derived.signalCards.map((card) => (
                    <div key={card.label} className={`rounded-2xl border p-4 ${toneStyles[card.tone]}`}>
                      <div className="text-[11px] uppercase tracking-[0.24em]">{card.label}</div>
                      <div className="mt-3 text-2xl font-semibold">{card.value}</div>
                      <div className="mt-2 text-sm leading-6 text-current/75">{card.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.25fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className={`${sectionClass} p-8`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Coverage</div>
                <h2 className="mt-3 text-2xl font-semibold">Watchlist conviction map</h2>
              </div>
              <Radar className="h-5 w-5 text-cyan-200" />
            </div>

              <div className="mt-8 space-y-4">
              {derived.watchlist.map((company) => (
                <div key={company.ticker} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-white">{company.ticker}</span>
                        <span className="text-sm text-white/35">{company.name}</span>
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.24em] text-white/30">{company.sector}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Conviction</div>
                      <div className="text-xl font-semibold text-white">{company.conviction}</div>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#22d3ee_55%,#f59e0b_100%)]"
                      style={{ width: `${company.conviction}%` }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className={`font-medium ${sentimentStyles[company.sentiment]}`}>
                      Sentiment {company.sentiment}
                    </div>
                    <div className={`font-medium ${riskStyles[company.risk]}`}>Risk {company.risk}</div>
                    <div className="text-white/42">{company.nextCatalyst}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.75, delay: 0.05 }}
            className={`${sectionClass} p-8`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Event Flow</div>
                <h2 className="mt-3 text-2xl font-semibold">Recent disclosure events</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                Continuous ingest
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {derived.filingEvents.map((event) => (
                <div key={`${event.ticker}-${event.timestamp}`} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-white">{event.ticker}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-white/50">
                          {event.filingType}
                        </span>
                        <span className="text-sm text-white/35">{event.company}</span>
                      </div>
                      <div className="mt-2 text-sm text-cyan-200">{event.status}</div>
                    </div>
                    <div className="text-sm text-white/35">{event.timestamp}</div>
                  </div>

                  <p className="mt-4 max-w-3xl text-sm leading-7 text-white/58">{event.summary}</p>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Decision output</div>
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
                      {event.action}
                      <ArrowUpRight className="h-4 w-4 text-white/45" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="mx-auto mt-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className={`${sectionClass} p-8`}
          >
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Agent Layer</div>
                <h2 className="mt-3 text-2xl font-semibold">Three-model interpretation stack</h2>
                <div className="mt-6 space-y-4">
                  {[
                    {
                      title: "Document Structuring Agent",
                      body: "Segments disclosures into risk factors, management commentary, legal exposure, and forward-looking statements.",
                      icon: FileText,
                    },
                    {
                      title: "Earnings Interpretation Agent",
                      body: "Measures tone shifts, framing changes, and narrative inconsistencies against reported performance.",
                      icon: TrendingUp,
                    },
                    {
                      title: "Risk Evolution Agent",
                      body: "Tracks newly introduced, expanded, or softened risk language across reporting periods.",
                      icon: ShieldAlert,
                    },
                  ].map((agent) => (
                    <div key={agent.title} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <agent.icon className="h-5 w-5 text-white/75" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-white">{agent.title}</div>
                          <p className="mt-2 text-sm leading-7 text-white/52">{agent.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">Audit Trail</div>
                  <div className="text-sm text-white/35">Disclosure to action lineage</div>
                </div>

                <div className="mt-6 space-y-4">
                  {derived.auditTrail.map((item) => (
                    <div key={`${item.ticker}-${item.filing}`} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-lg font-semibold text-white">{item.ticker}</div>
                        <div className="text-sm text-white/35">{item.filing}</div>
                      </div>
                      <blockquote className="mt-4 border-l border-cyan-300/30 pl-4 text-sm leading-7 text-white/64">
                        {item.excerpt}
                      </blockquote>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Detected Change</div>
                          <div className="mt-2 text-sm leading-7 text-white/55">{item.change}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Decision Effect</div>
                          <div className="mt-2 text-sm leading-7 text-white/55">{item.impact}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto mt-8 max-w-7xl">
          <div className="grid gap-6 md:grid-cols-[1fr_0.8fr]">
            <div className={`${sectionClass} p-6`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">System Notes</div>
                  <h3 className="mt-2 text-xl font-semibold text-white">Pipeline state</h3>
                </div>
                <Sparkles className="h-5 w-5 text-cyan-200" />
              </div>
              <div className="mt-4 text-sm leading-7 text-white/55">
                {isLoading && "Loading live FINS data from Supabase."}
                {!isLoading && !error && "The page is wired to live fins_* tables and automatically falls back to market context while the filing pipeline is still warming up."}
                {error && "FINS data fetch hit an error. The page is still rendering with safe fallback intelligence so the surface remains usable."}
              </div>
            </div>
            <div className={`${sectionClass} p-6`}>
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Current Status</div>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <div className={`h-2.5 w-2.5 rounded-full ${error ? "bg-amber-300" : "bg-emerald-300"}`} />
                <span className="text-white/70">{error ? "Fallback mode active" : "Supabase live sync active"}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Fins;
