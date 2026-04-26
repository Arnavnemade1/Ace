# FINS v1 Build Spec

FINS (Financial Intelligence & Narrative Signal System) is a modular intelligence layer that continuously monitors corporate disclosures and earnings communications, converts them into structured signals, and hands those signals to a downstream trading policy.

This v1 spec is intentionally optimized for a constrained Supabase footprint. Supabase is treated as the control plane and historical signal store, not the warehouse for raw filings or transcript blobs.

## v1 goals

- Monitor a configurable watchlist of public companies.
- Detect new filing and transcript events without manual intervention.
- Normalize each event into a compact disclosure record.
- Run three independent agents:
  - Document Structuring Agent
  - Earnings Interpretation Agent
  - Risk Evolution Agent
- Persist compact, auditable, machine-consumable outputs.
- Feed a downstream decision engine with bounded action recommendations.
- Keep database growth small enough for the current Supabase free-tier constraints.

## Design constraints

- Do not store full raw filing text in Supabase Postgres.
- Do not store full transcript text in Supabase Postgres.
- Do not store full prompt/response traces unless debug mode is explicitly enabled.
- Keep all agent outputs compact, typed, and versioned.
- Preserve enough evidence to audit every signal and decision later.

## System architecture

### 1. Universe and scheduling layer

Responsibilities:
- manage watchlists and company metadata
- assign polling cadence by priority tier
- trigger both recurring sweeps and event-driven runs

Suggested cadence:
- daily baseline sweep for all watchlist names
- higher-frequency checks during earnings windows
- immediate follow-up job when a new filing or transcript is detected

### 2. Source monitoring layer

Responsibilities:
- check public filing and transcript sources
- detect new:
  - annual reports
  - quarterly reports
  - material event filings
  - earnings call transcripts
- emit idempotent disclosure events

Deduplication key:
- issuer identifier
- source type
- source document id or accession id
- event timestamp
- content hash

### 3. Ingestion and normalization pipeline

Responsibilities:
- fetch source document metadata
- parse source into canonical sections
- compute content hash
- store source URL and lightweight extraction metadata
- create normalized section summaries for agent use

Storage rule:
- raw source content lives outside Supabase Postgres
- Supabase stores only references, hashes, section summaries, and evidence spans

### 4. Agent orchestration layer

Responsibilities:
- fan out normalized events to independent agents
- persist each agent result separately
- retry failed jobs safely
- version agent outputs by model, prompt, and code version

### 5. Signal fusion layer

Responsibilities:
- combine agent outputs into one event-level intelligence object
- normalize direction, magnitude, and confidence
- weigh source importance
- write the canonical signal payload for downstream consumers

### 6. Decision integration layer

Responsibilities:
- consume fused intelligence signals
- merge them with portfolio context and policy limits
- generate bounded actions:
  - increase_exposure
  - reduce_exposure
  - exit_position
  - hold

Important:
- the decision engine should remain deterministic and policy-bounded
- the model layer should not place free-form trades directly

### 7. Transparency and audit layer

Responsibilities:
- store evidence excerpts and comparison summaries
- keep a clear line from disclosure to signal to decision
- support replay and human review

## Agent contracts

All agents receive the same base event envelope:

```json
{
  "event_id": "uuid",
  "ticker": "MSFT",
  "filing_type": "10-Q",
  "event_timestamp": "2026-04-25T21:00:00Z",
  "source_url": "https://...",
  "content_hash": "sha256:...",
  "sections": [
    {
      "section_key": "mda",
      "title": "Management's Discussion and Analysis",
      "summary": "Demand softened in enterprise devices...",
      "evidence": [
        {
          "snippet": "We saw elongated enterprise buying cycles in the quarter.",
          "char_start": 1299,
          "char_end": 1360
        }
      ]
    }
  ],
  "historical_baseline": {
    "prior_event_id": "uuid",
    "prior_sections": []
  }
}
```

### Document Structuring Agent

Output:

```json
{
  "agent_name": "document_structuring",
  "directional_sentiment": "neutral",
  "risk_adjustment": "stable",
  "confidence": 0.82,
  "section_classifications": [
    {
      "section_key": "risk_factors",
      "importance": 0.91,
      "labels": ["regulatory", "supply_chain"]
    }
  ],
  "evidence": [
    {
      "section_key": "risk_factors",
      "snippet": "New export restrictions may limit sales in certain geographies."
    }
  ]
}
```

Responsibilities:
- split large disclosures into semantically meaningful sections
- identify risk disclosures, management commentary, forward-looking statements, legal and regulatory issues
- emit section labels and importance scores

### Earnings Interpretation Agent

Output:

```json
{
  "agent_name": "earnings_interpretation",
  "directional_sentiment": "negative",
  "risk_adjustment": "increase",
  "confidence": 0.78,
  "tone_shift": "more_defensive",
  "narrative_consistency": "weakening",
  "evidence": [
    {
      "section_key": "prepared_remarks",
      "snippet": "We remain cautious on near-term demand visibility."
    }
  ]
}
```

Responsibilities:
- analyze prepared remarks and Q&A
- detect tone and framing changes
- compare management language against reported operating performance
- surface inconsistencies between narrative and metrics

### Risk Evolution Agent

Output:

```json
{
  "agent_name": "risk_evolution",
  "directional_sentiment": "negative",
  "risk_adjustment": "increase",
  "confidence": 0.85,
  "risk_delta": 0.34,
  "risk_dimensions": [
    { "name": "regulatory", "delta": 0.52 },
    { "name": "liquidity", "delta": 0.14 }
  ],
  "evidence": [
    {
      "section_key": "risk_factors",
      "snippet": "Compliance costs are expected to rise materially."
    }
  ]
}
```

Responsibilities:
- compare current and prior risk disclosures
- detect new, expanded, or removed risks
- emit quantified risk deltas

## Fused event output

Each disclosure event should end with one canonical intelligence object:

```json
{
  "event_id": "uuid",
  "ticker": "MSFT",
  "directional_sentiment": "negative",
  "risk_adjustment": "increase",
  "conviction_impact": -0.41,
  "confidence": 0.81,
  "causal_summary": "Management tone weakened while regulatory risk language expanded versus the prior quarter.",
  "comparative_context": {
    "vs_prior_period": "material_deterioration",
    "vs_trailing_4_events": "lowest_narrative_consistency"
  },
  "supporting_evidence": [
    "We remain cautious on near-term demand visibility.",
    "New export restrictions may limit sales in certain geographies."
  ]
}
```

## Downstream decision object

The trading system receives a bounded decision payload:

```json
{
  "event_id": "uuid",
  "ticker": "MSFT",
  "action": "reduce_exposure",
  "magnitude": 0.25,
  "updated_conviction": 0.43,
  "causal_explanation": {
    "primary_driver": "rising regulatory risk and weaker management tone",
    "supporting_signals": [
      "risk_delta +0.34",
      "negative tone shift",
      "weaker narrative consistency"
    ]
  }
}
```

## Supabase data model

Supabase stores compact structured data only.

### `fins_watchlists`
- watchlist metadata
- name, description, status, schedule config

### `fins_watchlist_companies`
- company membership in watchlists
- ticker, issuer identifiers, priority tier

### `fins_disclosure_events`
- one row per detected filing/transcript event
- stores source metadata, hashes, extraction status, and pointers to off-platform raw artifacts

### `fins_section_summaries`
- compact section-level summaries
- no full-text body storage
- only normalized labels, summary text, and a few evidence snippets

### `fins_agent_runs`
- one row per agent execution
- status, latency, model version, prompt version, input/output token counts

### `fins_agent_signals`
- typed outputs from each agent
- sentiment, risk change, confidence, delta scores, summary payload

### `fins_signal_evidence`
- evidence snippets attached to agent signals or fused event signals
- snippet text should be short and bounded

### `fins_fused_signals`
- canonical event-level intelligence record

### `fins_decision_records`
- downstream action recommendations and execution-facing payloads

### `fins_alerts`
- materiality-triggered alert rows for downstream consumers and UI

### `fins_ingestion_jobs`
- idempotent monitoring and ingestion job tracking

## Storage rules for quota protection

### What goes in Supabase
- issuer metadata
- event metadata
- hashes and source URLs
- compact section summaries
- structured signals
- short evidence snippets
- decisions and alerts

### What stays out of Supabase Postgres
- full SEC filing text
- full earnings transcript text
- raw HTML or PDF blobs
- large embeddings for every paragraph
- verbose LLM traces

### Suggested off-platform raw artifact strategy
- store raw text and files on local disk during development
- optionally move to object storage later
- keep only `raw_artifact_uri` and `content_hash` in Postgres

## Retention and pruning policy

- keep all event metadata and final signals
- keep only compact evidence snippets for long-term audit
- expire debug payloads after 7 days
- expire completed ingestion job rows after 30 to 60 days if needed
- keep only the latest normalized section summaries if historical duplication becomes too expensive

## Worker flow

1. Monitoring worker polls sources for each active watchlist company.
2. New source items are deduplicated into `fins_disclosure_events`.
3. Ingestion worker fetches raw artifact, computes hash, and stores off-platform raw pointer.
4. Normalizer writes compact `fins_section_summaries`.
5. Agent orchestrator creates `fins_agent_runs`.
6. Each agent writes structured outputs to `fins_agent_signals`.
7. Fusion step writes one row to `fins_fused_signals`.
8. Decision engine writes one row to `fins_decision_records`.
9. Alerting step writes one row to `fins_alerts` if thresholds are crossed.

## Recommended implementation order

### Phase 1: storage-thin foundation
- create core Supabase tables
- add indexes and idempotency constraints
- implement watchlist and disclosure-event ingestion
- persist compact section summaries only

### Phase 2: agent outputs
- ship Document Structuring Agent
- ship Earnings Interpretation Agent
- ship Risk Evolution Agent
- standardize output schema and confidence scoring

### Phase 3: fusion and action layer
- implement fused signal generation
- implement deterministic decision policy
- add alert generation and audit views

### Phase 4: scale and refinement
- add transcript provider integration
- add richer baseline comparison windows
- add selective object storage for raw artifacts
- backtest signal-to-decision performance

## Success criteria for v1

- a new filing can be detected and processed end-to-end with no manual action
- each event produces a compact structured intelligence report
- each intelligence report can be traced back to evidence snippets
- the trading system receives a bounded action payload
- Supabase storage growth remains dominated by structured metadata, not raw text
