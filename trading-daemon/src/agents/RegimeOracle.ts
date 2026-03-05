import { alpaca } from '../alpaca';
import { logAgentAction, supabase } from '../supabase';
import axios from 'axios';
import { DynamicPersona } from './PersonaManager';

export type MarketRegimeType =
    | 'high-vol-reversion'
    | 'low-vol-trend'
    | 'quiet-accumulation'
    | 'crisis-transition'
    | 'commodity-supercycle';

export interface RegimeState {
    regime_type: MarketRegimeType;
    confidence: number;
    macro_factors: {
        spy_volatililty: number;
        market_correlation: number;
        sentiment_velocity: number;
    };
}

export class RegimeOracle {
    private currentRegime: RegimeState | null = null;
    private apiKey = process.env.LOVABLE_API_KEY;
    private baseUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    private readonly TARGET_TEAM_SIZE = 3;

    /**
     * Brainstorms the ideal swarm configuration based on the current regime and pulse.
     */
    async brainstormSwarm(pulse: any): Promise<DynamicPersona[]> {
        if (!this.apiKey) return [];

        try {
            const regime = this.currentRegime || {
                regime_type: 'low-vol-trend' as MarketRegimeType,
                confidence: 0.5,
                macro_factors: { spy_volatililty: 0.1, market_correlation: 0.5, sentiment_velocity: 0.1 }
            };

            const systemPrompt = `You are the ACE_OS Orchestrator Captain (v2026).
Build a tactical team of exactly ${this.TARGET_TEAM_SIZE} autonomous subagents for the current market state.

Critical constraints:
1. There are NO pre-existing subagent types. Invent any role you need.
2. Every subagent name must be unique and non-generic.
3. Every assignment must be useful: include a concrete deliverable and measurable success metric.
4. Team coordination matters: each subagent must state who they hand off to in the team.
5. Use concise but technical language.

Return valid JSON ONLY in this shape:
{
  "agents": [
    {
      "name": "Unique codename",
      "task": "Actionable tactical mission",
      "specialization": "Technical edge",
      "deliverable": "What they produce this cycle",
      "success_metric": "How success is measured",
      "handoff_to": "Name of another agent or Orchestrator"
    }
  ]
}`;

            const userPrompt = `
CURRENT REGIME: ${regime.regime_type} (Confidence: ${regime.confidence})
MACRO FACTORS: Volatility: ${regime.macro_factors.spy_volatililty.toFixed(2)}, Sentiment Velocity: ${regime.macro_factors.sentiment_velocity.toFixed(2)}
GLOBAL PULSE: ${pulse.macroSummary}
NEWS SENTIMENT: ${(pulse.newsSentiment * 100).toFixed(0)}% Bullish.

Define the optimal team roster for this exact cycle.`;

            const response = await axios.post(this.baseUrl, {
                model: 'google/gemini-2.5-flash',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' }
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                timeout: 8000
            });

            const result = response.data.choices[0].message.content;
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            const rawAgents = Array.isArray(parsed)
                ? parsed
                : (parsed?.agents || parsed?.team || parsed?.subagents || []);

            return this.normalizeCrew(rawAgents, regime);

        } catch (e: any) {
            console.error('[RegimeOracle] Swarm Brainstorm failed:', e.message);
            return this.getFallbackCrew(this.currentRegime?.regime_type || 'low-vol-trend');
        }
    }

    private normalizeCrew(rawAgents: any[], regime: RegimeState): DynamicPersona[] {
        const seenNames = new Set<string>();
        const fallback = this.getFallbackCrew(regime.regime_type);
        const normalized: DynamicPersona[] = [];

        const source = Array.isArray(rawAgents) ? rawAgents : [];
        for (let i = 0; i < source.length && normalized.length < this.TARGET_TEAM_SIZE; i++) {
            const candidate = source[i] || {};
            const fallbackAgent = fallback[normalized.length];
            const name = this.makeUniqueName(candidate.name, seenNames, normalized.length + 1, fallbackAgent.name);
            const specialization = this.cleanLine(candidate.specialization, fallbackAgent.specialization);

            const usefulTask = this.ensureUsefulTask(
                this.cleanLine(candidate.task, ''),
                fallbackAgent.task
            );
            const deliverable = this.cleanLine(candidate.deliverable, `ranked watchlist + action notes for ${name}`);
            const successMetric = this.cleanLine(candidate.success_metric, '>=2 high-conviction opportunities with quantified risk');
            const handoffTo = this.cleanLine(candidate.handoff_to, 'Orchestrator');

            normalized.push({
                name,
                specialization,
                task: `${usefulTask} Deliverable: ${deliverable}. Success: ${successMetric}. Handoff: ${handoffTo}.`
            });
        }

        for (const fb of fallback) {
            if (normalized.length >= this.TARGET_TEAM_SIZE) break;
            const fallbackName = this.makeUniqueName(fb.name, seenNames, normalized.length + 1, `Adaptive Unit ${normalized.length + 1}`);
            normalized.push({ ...fb, name: fallbackName });
        }

        return normalized;
    }

    private makeUniqueName(rawName: any, seenNames: Set<string>, index: number, fallback: string): string {
        const cleaned = this.cleanLine(rawName, fallback)
            .replace(/[^a-zA-Z0-9\- ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const base = cleaned || `Adaptive Unit ${index}`;

        let candidate = base;
        let suffix = 2;
        while (seenNames.has(candidate.toLowerCase())) {
            candidate = `${base} ${suffix}`;
            suffix++;
        }

        seenNames.add(candidate.toLowerCase());
        return candidate;
    }

    private cleanLine(value: any, fallback: string): string {
        const line = String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
        return line || fallback;
    }

    private ensureUsefulTask(task: string, fallback: string): string {
        const normalized = task.toLowerCase();
        const hasActionVerb = /(scan|monitor|rank|hedge|rebalance|detect|execute|validate|triage|screen|model|optimize|track|stress|compare|prioritize|route)/.test(normalized);
        const hasTradingTarget = /(symbol|position|sector|risk|volatility|sentiment|spread|entry|exit|liquidity|correlation|drawdown|order)/.test(normalized);

        if (task.length >= 36 && hasActionVerb && hasTradingTarget) {
            return task;
        }

        return fallback;
    }

    private getFallbackCrew(regimeType: MarketRegimeType): DynamicPersona[] {
        return [
            {
                name: 'Pulse Cartographer',
                specialization: 'Cross-asset momentum mapping',
                task: `Scan sovereign-priority symbols and rank top 12 momentum dislocations for ${regimeType}. Deliverable: ranked setup board with entry/exit bands. Success: >=3 setups with risk/reward >= 2.0. Handoff: Risk Sentinel.`
            },
            {
                name: 'Risk Sentinel',
                specialization: 'Drawdown and exposure control',
                task: 'Stress-test each candidate setup against sector concentration, stop distance, and account VaR. Deliverable: go/no-go gate with sizing bounds. Success: every approved setup fits cash buffer and max sector exposure rules. Handoff: Execution Relay.'
            },
            {
                name: 'Execution Relay',
                specialization: 'Liquidity-aware execution routing',
                task: 'Convert approved setups into execution-ready orders with timing, order type, and slippage controls. Deliverable: final order queue with priorities. Success: zero rule violations and all orders mapped to valid market conditions. Handoff: Orchestrator.'
            }
        ];
    }

    async estimateRegime(pulse: any): Promise<RegimeState> {
        try {
            // 1. Fetch SPY as a baseline for broad market volatility
            const startStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const bars = await alpaca.getBars('SPY', startStr, '1Day', 250);

            // Calculate basic historical volatility (proxy)
            let volSum = 0;
            for (let i = 1; i < bars.length; i++) {
                const ret = (bars[i].ClosePrice - bars[i - 1].ClosePrice) / bars[i - 1].ClosePrice;
                volSum += Math.abs(ret);
            }
            const avgVol = bars.length > 1 ? volSum / (bars.length - 1) : 0;
            const annualizedVol = avgVol * Math.sqrt(252); // Approximate

            // 2. Classify Regime
            let regimeType: MarketRegimeType = 'low-vol-trend';
            let confidence = 0.6;

            const sentimentShift = Math.abs(pulse.newsSentiment - 0.5);

            if (annualizedVol > 0.25) {
                regimeType = 'high-vol-reversion';
                confidence = Math.min(0.9, 0.5 + annualizedVol);
            } else if (annualizedVol < 0.12 && sentimentShift < 0.2) {
                regimeType = 'quiet-accumulation';
                confidence = 0.7;
            } else if (sentimentShift > 0.4 && annualizedVol > 0.15) {
                regimeType = 'crisis-transition';
                confidence = 0.8;
            } else if (pulse.weatherRisk > 0.6 || pulse.macroSummary.toLowerCase().includes('oil')) {
                regimeType = 'commodity-supercycle';
                confidence = 0.75;
            }

            const state: RegimeState = {
                regime_type: regimeType,
                confidence,
                macro_factors: {
                    spy_volatililty: annualizedVol,
                    market_correlation: 0.5, // Placeholder for future cross-asset correlation
                    sentiment_velocity: sentimentShift
                }
            };

            // Detect shift
            if (this.currentRegime && this.currentRegime.regime_type !== state.regime_type) {
                await logAgentAction('RegimeOracle', 'decision',
                    `🚨 REGIME SHIFT DETECTED: ${this.currentRegime.regime_type} -> ${state.regime_type}`,
                    `Vol: ${(annualizedVol * 100).toFixed(2)}%, SentShift: ${sentimentShift.toFixed(2)}`
                );
            }

            this.currentRegime = state;

            // Log to database
            await supabase.from('market_regimes').insert({
                regime_type: state.regime_type,
                confidence: state.confidence,
                macro_factors: state.macro_factors
            });

            return state;

        } catch (error: any) {
            console.error('[RegimeOracle] Failed to estimate regime:', error.message);
            // Default safe regime
            return this.currentRegime || {
                regime_type: 'low-vol-trend',
                confidence: 0.5,
                macro_factors: { spy_volatililty: 0, market_correlation: 0, sentiment_velocity: 0 }
            };
        }
    }

    getCurrentRegime(): RegimeState | null {
        return this.currentRegime;
    }
}
