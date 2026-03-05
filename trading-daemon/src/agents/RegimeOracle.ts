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

            const systemPrompt = `You are the ACE_OS Swarm Orchestrator (v2026).
Your task is to analyze the current Market Regime and Macro Pulse to define a specialized crew of 3 autonomous trading subagents.
Each subagent needs a unique Name, a specific tactical Task, and a Technical Specialization.

Rules:
1. DO NOT use generic names like "MomentumChaser". Be creative and technical (e.g., "Theta-Grip", "Gamma-Scout", "Tail-Risk-Hunter").
2. Tasks must be actionable (e.g., "Scour 500 symbols for RSI-14 oversold entries on Sovereign Priority assets").
3. Specializations must be technical (e.g., "Implied Volatility Arbitrage", "Geopolitical Alpha Synthesis").

Output JSON format exactly:
[
  { "name": "Name", "task": "Task", "specialization": "Specialization" },
  ... (3 total)
]`;

            const userPrompt = `
CURRENT REGIME: ${regime.regime_type} (Confidence: ${regime.confidence})
MACRO FACTORS: Volatility: ${regime.macro_factors.spy_volatililty.toFixed(2)}, Sentiment Velocity: ${regime.macro_factors.sentiment_velocity.toFixed(2)}
GLOBAL PULSE: ${pulse.macroSummary}
NEWS SENTIMENT: ${(pulse.newsSentiment * 100).toFixed(0)}% Bullish.

Define the optimal 3-agent crew for this specific moment.`;

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

            // Handle both { agents: [...] } and directly [...]
            return Array.isArray(parsed) ? parsed : (parsed.agents || []);

        } catch (e: any) {
            console.error('[RegimeOracle] Swarm Brainstorm failed:', e.message);
            return [];
        }
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
