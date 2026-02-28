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

        // Fetch all snapshots in parallel
        const snapshots = await Promise.all(symbols.map(s => this.getSnapshot(s)));

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const snap = snapshots[i];

            const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? null;
            const prevClose = snap?.prevDailyBar?.c ?? price;
            const volume = snap?.dailyBar?.v ?? 0;

            if (!price) continue;

            const priceChangePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
            const volumeStrength = volume > 1_000_000 ? 0.15 : (volume > 200_000 ? 0.08 : 0.0);

            // --- BRAIN UPGRADE: MULTI-FACTOR CONVICTION ---
            const techAlpha = Math.abs(priceChangePct) / 2.5; // Slight sensitivity boost
            const sentimentDelta = (pulse.newsSentiment - 0.5);
            const sentimentImpulse = sentimentDelta * 0.5; // Up to 0.25 impact
            const trafficImpulse = (pulse.trafficDensity - 0.5) * 0.15;
            const weatherRiskFactor = pulse.weatherRisk > 0.2 ? -0.15 : 0.05; // Bonus for clear weather

            let strength = Math.min(techAlpha + volumeStrength + Math.abs(sentimentImpulse) + Math.abs(trafficImpulse) + weatherRiskFactor, 1.0);

            // --- CRITICAL POSITION GUARD ---
            // If already in portfolio, drop strength to 0 to prevent "buying the same thing"
            if (activeSymbols.has(symbol)) {
                strength = 0.0;
            }

            // Directional alignment
            const isBuy = (priceChangePct > 0.02 || sentimentDelta > 0.1) && pulse.newsSentiment >= 0.5;
            const isSell = (priceChangePct < -0.02 || sentimentDelta < -0.1) && pulse.newsSentiment <= 0.5;

            // Threshold: Act if strength > 0.35 (more proactive than previous 0.5)
            if (strength >= 0.35 && (isBuy || isSell)) {
                // --- BETTER REASONING ENGINE ---
                const sentimentText = pulse.newsSentiment > 0.6 ? 'bullish market consensus' : (pulse.newsSentiment < 0.4 ? 'bearish macro pressure' : 'neutral market posture');
                const techText = Math.abs(priceChangePct) > 2 ? 'high technical volatility' : 'steady price action';
                const weatherText = pulse.weatherRisk > 0.2 ? 'with logistics caution' : 'clear operational window';

                const reasoning = `Synthesized ${sentimentText} with ${techText}. Technical Δ${priceChangePct.toFixed(2)}% | Conviction: ${(strength * 100).toFixed(0)}% | ${weatherText}.`;

                const signal = {
                    symbol,
                    signal_type: isBuy ? 'BUY' : 'SELL',
                    strength: parseFloat(strength.toFixed(3)),
                    source_agent: 'Strategy Engine',
                    reasoning,
                    metadata: {
                        price_observed: price,
                        price_change_pct: priceChangePct,
                        volume,
                        macro_sentiment: pulse.newsSentiment,
                        weather_risk: pulse.weatherRisk,
                        traffic_index: pulse.trafficDensity
                    }
                };
                signals.push(signal);
            }
        }

        // --- INTERNAL MONOLOGUE LOGGING ---
        const topSignals = [...signals]
            .filter(s => s.strength >= 0.7) // Log significant thoughts
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Strategy Engine', 'decision',
                `[${sig.signal_type}] ${sig.symbol} Reasoning: ${sig.reasoning}`
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
