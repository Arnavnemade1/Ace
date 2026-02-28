import axios from 'axios';
import { logAgentAction, supabase } from '../supabase';

const ALPACA_BASE = 'https://data.alpaca.markets/v2';
const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;

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
        await logAgentAction('Strategy Engine', 'info', `Evaluating strategies on ${symbols.length} symbols with live macro intel.`);

        const signals: any[] = [];

        // Fetch all snapshots in parallel
        const snapshots = await Promise.all(symbols.map(s => this.getSnapshot(s)));

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const snap = snapshots[i];

            // Fallback price if Alpaca snapshot unavailable
            const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? null;
            const prevClose = snap?.prevDailyBar?.c ?? price;
            const volume = snap?.dailyBar?.v ?? 0;

            if (!price) continue;

            const priceChangePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
            const volumeStrength = volume > 1_000_000 ? 0.15 : 0.05; // bonus for high volume

            // ── MOMENTUM SIGNAL ──
            // Buy if price up >0.3% with good volume + positive macro sentiment
            // Sell if price down >0.3% + negative macro sentiment
            const sentimentBonus = ((macroIntel.newsSentiment || 0.5) - 0.5) * 0.3;
            const momentumScore = Math.abs(priceChangePct) / 2 + volumeStrength + sentimentBonus;
            const strength = Math.min(parseFloat((0.55 + momentumScore + Math.random() * 0.1).toFixed(3)), 1.0);
            const isBuy = priceChangePct >= 0 && macroIntel.newsSentiment >= 0.45;

            if (strength >= 0.65) {
                const signal = {
                    symbol,
                    signal_type: isBuy ? 'BUY' : 'SELL',
                    strength,
                    source_agent: 'Strategy Engine',
                    reasoning: `${symbol} @ $${price.toFixed(2)} (${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}% daily). Volume: ${volume.toLocaleString()}. News sentiment: ${(macroIntel.newsSentiment || 0.5).toFixed(2)}. Momentum score: ${momentumScore.toFixed(3)}.`,
                    metadata: {
                        price_observed: price,
                        price_change_pct: priceChangePct,
                        volume,
                        macro_sentiment: macroIntel.newsSentiment,
                        prev_close: prevClose,
                    }
                };

                signals.push(signal);
                await logAgentAction('Strategy Engine', 'decision',
                    `[${signal.signal_type}] ${symbol} @ $${price.toFixed(2)} | strength ${strength} | Δ${priceChangePct.toFixed(2)}%`
                );

                await supabase.from('signals').insert(signal);
            }
        }

        return signals;
    }
}
