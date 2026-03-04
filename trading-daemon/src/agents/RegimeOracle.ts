import { alpaca } from '../alpaca';
import { logAgentAction, supabase } from '../supabase';

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

    /**
     * Determines the current market regime based on volatility, trend, and sentiment.
     */
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
