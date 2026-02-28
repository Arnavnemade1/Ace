import axios from 'axios';
import { logAgentAction, supabase } from '../supabase';

const ALPACA_BASE = 'https://data.alpaca.markets/v2';
const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET_KEY;  // matches .env

const alpacaHeaders = {
    'APCA-API-KEY-ID': ALPACA_KEY || '',
    'APCA-API-SECRET-KEY': ALPACA_SECRET || '',
};

export class StrategyEngine {
    // Neural weights (dynamic)
    private neuralWeights = {
        macro: 0.45,
        tech: 0.35,
        volatility: 0.20
    };

    // Fetch real Alpaca snapshot for a symbol (includes price, daily change, volume)
    private async getSnapshot(symbol: string): Promise<any | null> {
        try {
            const { data } = await axios.get(`${ALPACA_BASE}/stocks/${symbol}/snapshot`, {
                headers: alpacaHeaders
            });
            return data;
        } catch {
            return null;
        }
    }

    async evaluate(symbols: string[], pulse: any, activeSymbols: Set<string>) {
        const signals: any[] = [];
        const snapshots = await Promise.all(symbols.map(s => this.getSnapshot(s)));

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const snap = snapshots[i];

            const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? null;
            const prevClose = snap?.prevDailyBar?.c ?? price;
            const volume = snap?.dailyBar?.v ?? 0;

            if (!price) continue;

            const priceChangePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

            // --- NEURAL SYNTHESIZER ---
            // Instead of static Math, we synthesize 'Neural Impulses'
            const macroImpulse = (pulse.newsSentiment - 0.5) * 2; // -1 to 1
            const techImpulse = Math.min(Math.max(priceChangePct / 2.0, -1), 1);
            const volatilityImpulse = pulse.weatherRisk > 0.3 ? -0.5 : 0.2; // Weather as a logistics volatility proxy

            // Calculated Conviction (Narrative Weighting)
            const convictionScore = (
                (macroImpulse * this.neuralWeights.macro) +
                (techImpulse * this.neuralWeights.tech) +
                (volatilityImpulse * this.neuralWeights.volatility)
            );

            const strength = Math.abs(convictionScore);

            // --- CRITICAL POSITION GUARD ---
            // If already in portfolio or pending, drop strength to 0.0 to force variety.
            if (activeSymbols.has(symbol)) {
                continue;
            }

            // Autonomous Decision Logic
            const isBuy = convictionScore > 0.15;
            const isSell = convictionScore < -0.15;

            if (strength >= 0.25 && (isBuy || isSell)) {
                // Narrative Reasoning Generation
                const sentimentNarrative = pulse.macroSummary.split('|')[0].trim();
                const techContext = priceChangePct > 0 ? 'bullish technical breakout' : 'bearish rejection';
                const volumeContext = volume > 1000000 ? 'with high institutional liquidity' : 'on retail-heavy volume';

                const reasoning = `Neural Synthesis: Detected ${techContext} aligned with ${sentimentNarrative} ${volumeContext}. Conviction: ${(strength * 100).toFixed(0)}%. Autonomous action advised.`;

                const signal = {
                    symbol,
                    signal_type: isBuy ? 'BUY' : 'SELL',
                    strength: parseFloat(strength.toFixed(3)),
                    source_agent: 'Neural Strategy Engine',
                    reasoning,
                    metadata: {
                        price_observed: price,
                        neural_impulse: convictionScore,
                        macro_bias: macroImpulse,
                        tech_bias: techImpulse,
                        volatility_bias: volatilityImpulse
                    }
                };
                signals.push(signal);
            }
        }

        // --- INTERNAL MONOLOGUE LOGGING ---
        const topSignals = [...signals]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Neural Strategy', 'decision',
                `[${sig.signal_type}] ${sig.symbol} | Neural Conviction: ${(sig.strength * 100).toFixed(0)}% | Story: ${sig.reasoning}`
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
