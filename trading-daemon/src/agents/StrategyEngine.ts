import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { BrainAgent, BrainContext } from './BrainAgent';

export class StrategyEngine {
    private brain = new BrainAgent();

    /**
     * Technical Analysis: RSI14 and SMA50
     */
    private async getTechnicals(symbol: string, currentPrice: number) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            const bars = await alpaca.getBars(symbol, startDate.toISOString());

            if (bars.length < 14) return { rsi: 50, sma50: currentPrice };

            const closes = bars.map(b => b.ClosePrice);

            // RSI Calculation
            let gains = 0, losses = 0;
            for (let i = closes.length - 14; i < closes.length; i++) {
                const diff = closes[i] - (closes[i - 1] || closes[i]);
                if (diff >= 0) gains += diff;
                else losses -= diff;
            }
            const rs = gains / (losses || 1);
            const rsi = 100 - (100 / (1 + rs));

            // SMA50 (or Max available)
            const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50);

            return { rsi, sma50 };
        } catch (e) {
            return { rsi: 50, sma50: currentPrice };
        }
    }

    async evaluate(symbols: string[], pulse: any, activeSymbols: Set<string>, account: any, positions: any[]) {
        const signals: any[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (symbol) => {
                try {
                    if (activeSymbols.has(symbol)) return;

                    // 1. Get Real-time Context
                    const snapshot = await alpaca.getBars(symbol, new Date(Date.now() - 600000).toISOString(), '1Min', 1);
                    const currentPrice = snapshot[0]?.ClosePrice || 0;
                    if (currentPrice === 0) return;

                    const technicals = await this.getTechnicals(symbol, currentPrice);

                    // 2. Fetch specific news for this symbol if available (or use global pulse)
                    const newsHeadlines = pulse.newsHeadlines?.filter((h: string) => h.includes(symbol)) || pulse.newsHeadlines?.slice(0, 5) || [];

                    // 3. Deep Brain Synthesis
                    const context: BrainContext = {
                        symbol,
                        technicals: { ...technicals, currentPrice },
                        pulse: {
                            newsSentiment: pulse.newsSentiment,
                            macroSummary: pulse.macroSummary,
                            weatherRisk: pulse.weatherRisk
                        },
                        newsHeadlines,
                        portfolio: {
                            cash: account.cash,
                            equity: account.equity,
                            buyingPower: account.buying_power,
                            positions
                        }
                    };

                    const decision = await this.brain.synthesize(context);

                    if (decision.action !== 'HOLD' && decision.conviction > 0.4) {
                        const signal = {
                            symbol,
                            signal_type: decision.action,
                            strength: parseFloat(decision.conviction.toFixed(3)),
                            source_agent: 'Omni-Brain (Hyper-LLM)',
                            reasoning: decision.reasoning,
                            metadata: {
                                price_observed: currentPrice,
                                rsi: technicals.rsi,
                                sma50: technicals.sma50,
                                sentiment: pulse.newsSentiment,
                                news_context: newsHeadlines.length > 0 ? newsHeadlines[0] : 'General Macro'
                            }
                        };
                        signals.push(signal);
                    }
                } catch (e) {
                    console.error(`[Strategy] Brain synthesis failed for ${symbol}:`, e);
                }
            }));

            if (i + BATCH_SIZE < symbols.length) {
                await new Promise(res => setTimeout(res, 200));
            }
        }

        // --- INTERNAL MONOLOGUE LOGGING ---
        const topSignals = [...signals]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Strategy Engine', 'decision',
                `[Omni-Brain: ${sig.signal_type}] ${sig.symbol} | Conviction: ${(sig.strength * 100).toFixed(0)}%`,
                sig.reasoning
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
