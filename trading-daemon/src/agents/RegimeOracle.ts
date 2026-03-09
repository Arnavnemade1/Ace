import { alpaca } from '../alpaca';
import { logAgentAction, supabase } from '../supabase';
import { DynamicPersona } from './PersonaManager';
import { aiBridge } from '../utils/AIBridge';

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
    private readonly TARGET_TEAM_SIZE = 3;
    private readonly genericNamePattern = /(momentum|intraday|day trader|trader|chaser|sniper|scalper|harvester|hunter|bot|agent\s*\d*|alpha seeker|quant bot)/i;

    /**
     * Brainstorms the ideal swarm configuration based on the current regime and pulse.
     */
    async brainstormSwarm(pulse: any): Promise<DynamicPersona[]> {
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
6. Forbidden name styles: "Momentum Chaser", "Intraday Trader", "Scalper", "Agent 1", or similar templates.

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

            const response = await aiBridge.request(userPrompt, {
                systemPrompt,
                responseMimeType: 'application/json',
                maxTokens: 1024
            });

            if (!response.success) {
                throw new Error(response.error);
            }

            const parsed = JSON.parse(response.text);
            const rawAgents = Array.isArray(parsed)
                ? parsed
                : (parsed?.agents || parsed?.team || parsed?.subagents || []);

            return this.normalizeCrew(rawAgents, regime, pulse);

        } catch (e: any) {
            console.error('[RegimeOracle] Swarm Brainstorm failed:', e.message);
            return this.buildSyntheticCrew(this.currentRegime || {
                regime_type: 'low-vol-trend',
                confidence: 0.5,
                macro_factors: { spy_volatililty: 0.1, market_correlation: 0.5, sentiment_velocity: 0.1 }
            }, pulse);
        }
    }

    private normalizeCrew(rawAgents: any[], regime: RegimeState, pulse: any): DynamicPersona[] {
        const seenNames = new Set<string>();
        const normalized: DynamicPersona[] = [];

        const source = Array.isArray(rawAgents) ? rawAgents : [];
        for (let i = 0; i < source.length && normalized.length < this.TARGET_TEAM_SIZE; i++) {
            const candidate = source[i] || {};
            const synthetic = this.synthesizeAgent(normalized.length + 1, regime, pulse, seenNames);
            const name = this.makeUniqueName(candidate.name, seenNames, normalized.length + 1, synthetic.name);
            const specialization = this.cleanLine(candidate.specialization, synthetic.specialization);

            const usefulTask = this.ensureUsefulTask(
                this.cleanLine(candidate.task, ''),
                synthetic.task
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

        const syntheticFallback = this.buildSyntheticCrew(regime, pulse, seenNames);
        for (const fb of syntheticFallback) {
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
        const isGeneric = this.genericNamePattern.test(cleaned) || cleaned.split(' ').length < 2;
        const base = !cleaned || isGeneric ? fallback : cleaned;

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
        const hasMeasurableOutput = /(\d+|%|deliverable|success|metric|threshold|score|risk\/reward|rr|var)/.test(normalized);
        const genericTask = /(trade stocks|find opportunities|monitor market|do analysis|watchlist only|make money)/.test(normalized);

        if (task.length >= 36 && hasActionVerb && hasTradingTarget && hasMeasurableOutput && !genericTask) {
            return task;
        }

        return fallback;
    }

    private buildSyntheticCrew(regime: RegimeState, pulse: any, seenNames?: Set<string>): DynamicPersona[] {
        const localSeen = seenNames || new Set<string>();
        const crew: DynamicPersona[] = [];
        for (let i = 1; i <= this.TARGET_TEAM_SIZE; i++) {
            const unit = this.synthesizeAgent(i, regime, pulse, localSeen);
            crew.push(unit);
            localSeen.add(unit.name.toLowerCase());
        }
        return crew;
    }

    private synthesizeAgent(index: number, regime: RegimeState, pulse: any, seenNames: Set<string>): DynamicPersona {
        const regimeSeed = `${regime.regime_type}-${index}-${Math.round((pulse?.newsSentiment || 0.5) * 100)}`;
        const themesByRegime: Record<MarketRegimeType, string[]> = {
            'high-vol-reversion': ['Vol', 'Mean', 'Gamma', 'Shock', 'Tail'],
            'low-vol-trend': ['Trend', 'Flow', 'Carry', 'Drift', 'Signal'],
            'quiet-accumulation': ['Accum', 'Delta', 'Layer', 'Gradual', 'Base'],
            'crisis-transition': ['Stress', 'Break', 'Pivot', 'Regime', 'Flux'],
            'commodity-supercycle': ['Macro', 'Barrel', 'Curve', 'Energy', 'Basis'],
        };
        const nouns = ['Atlas', 'Relay', 'Vector', 'Forge', 'Sentinel', 'Map', 'Kernel', 'Circuit', 'Protocol'];
        const themes = themesByRegime[regime.regime_type] || themesByRegime['low-vol-trend'];

        const left = themes[this.hash(regimeSeed) % themes.length];
        const right = nouns[this.hash(`${regimeSeed}-n`) % nouns.length];
        const rawName = `${left} ${right}`;
        const name = this.makeUniqueName(rawName, seenNames, index, `Adaptive Unit ${index}`);

        const specializations = [
            'Cross-sectional dislocation scoring',
            'Liquidity-aware execution planning',
            'Drawdown-constrained position sizing',
            'News-sentiment shock integration',
            'Correlation and sector exposure control',
            'Intracycle risk/reward normalization'
        ];
        const specialization = specializations[this.hash(`${regimeSeed}-s`) % specializations.length];

        const topN = 8 + (this.hash(`${regimeSeed}-k`) % 8);
        const rr = (1.8 + (this.hash(`${regimeSeed}-r`) % 8) * 0.1).toFixed(1);
        const handoffTargets = ['Risk Lead', 'Execution Lead', 'Orchestrator'];
        const handoff = handoffTargets[this.hash(`${regimeSeed}-h`) % handoffTargets.length];
        const mission = `Rank top ${topN} symbols aligned to ${regime.regime_type} using sentiment velocity and volatility filters; propose entry, stop, and invalidation levels. Deliverable: prioritized action board with sizing caps. Success: >=3 setups with risk/reward >= ${rr} and no sector concentration breach. Handoff: ${handoff}.`;

        return { name, specialization, task: mission };
    }

    private hash(input: string): number {
        let h = 0;
        for (let i = 0; i < input.length; i++) {
            h = (h << 5) - h + input.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
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
