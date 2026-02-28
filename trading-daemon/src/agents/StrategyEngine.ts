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

    async evaluate(symbols: string[], macroIntel: any) {
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
            const volumeStrength = volume > 2_000_000 ? 0.2 : (volume > 500_000 ? 0.1 : 0.0);

            // --- REFINED MOMENTUM LOGIC ---
            // Base strength is pure volatility + volume + sentiment
            const sentimentScore = ((macroIntel.newsSentiment || 0.5) - 0.5);
            const volatilityAlpha = Math.abs(priceChangePct) / 3;

            // Dynamic strength: 0.0 to 1.0
            let strength = Math.min(volatilityAlpha + volumeStrength + Math.abs(sentimentScore), 1.0);

            // Fix: Directional bias (Don't just count absolute volatility)
            const isBuy = priceChangePct >= 0.05 && (macroIntel.newsSentiment >= 0.5);
            const isSell = priceChangePct <= -0.05 && (macroIntel.newsSentiment <= 0.5);

            // Threshold: Only act if strength is significant (> 0.4)
            // Monologue: Only log High Conviction (> 0.85)
            if (strength >= 0.4 && (isBuy || isSell)) {
                const signal = {
                    symbol,
                    signal_type: isBuy ? 'BUY' : 'SELL',
                    strength: parseFloat(strength.toFixed(3)),
                    source_agent: 'Strategy Engine',
                    reasoning: `${symbol} @ $${price.toFixed(2)} (${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}% daily). Momentum: ${volatilityAlpha.toFixed(3)}. Sentiment: ${sentimentScore.toFixed(2)}.`,
                    metadata: {
                        price_observed: price,
                        price_change_pct: priceChangePct,
                        volume,
                        macro_sentiment: macroIntel.newsSentiment
                    }
                };
                signals.push(signal);
            }
        }

        // --- MONOLOGUE FILTER ---
        // Only log the Top 5 High-Conviction signals to Supabase to prevent UI flooding
        const topSignals = [...signals]
            .filter(s => s.strength >= 0.85) // High Conviction Only
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Strategy Engine', 'decision',
                `[${sig.signal_type}] ${sig.symbol} | Conviction: ${sig.strength} | Δ${sig.metadata.price_change_pct.toFixed(2)}%`
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
