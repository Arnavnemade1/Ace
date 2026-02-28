import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';

export class StrategyEngine {
    // Neural weights for analyst consensus
    private analystWeights = {
        quant: 0.50,   // Technical Indicators (RSI, SMA)
        macro: 0.35,   // Sentiment & Macro Pulse
        risk: 0.15     // Volatility & Exposure
    };

    /**
     * Internal Quant Analyst: Technical Impulse (RSI14, SMA50)
     */
    private async analyzeQuant(symbol: string, currentPrice: number): Promise<{ score: number; reasoning: string }> {
        try {
            // Fetch 60 days of history for indicators
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 60);
            const bars = await alpaca.getBars(symbol, startDate.toISOString());

            if (bars.length < 20) return { score: 0, reasoning: 'Insufficient data for technical validation.' };

            const closes = bars.map(b => b.ClosePrice);

            // 1. RSI (14) Calculation
            let gains = 0, losses = 0;
            for (let i = closes.length - 14; i < closes.length; i++) {
                const diff = closes[i] - closes[i - 1];
                if (diff >= 0) gains += diff;
                else losses -= diff;
            }
            const rs = gains / (losses || 1);
            const rsi = 100 - (100 / (1 + rs));

            // 2. SMA (50) Calculation
            const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50);

            // Logic:
            // Bullish: Price > SMA50 AND RSI < 60 (not overbought)
            // Bearish: Price < SMA50 OR RSI > 75 (exhausted)
            let score = 0;
            let reasoning = '';

            if (currentPrice > sma50 && rsi < 65) {
                score = (rsi < 35) ? 0.9 : 0.6; // Oversold + Trend = Primary BUY
                reasoning = `RSI(${rsi.toFixed(1)}) indicating oversold territory within a healthy SMA50 trend.`;
            } else if (currentPrice < sma50 || rsi > 75) {
                score = (rsi > 80) ? -0.9 : -0.5; // Overbought = Primary SELL
                reasoning = `Trend exhaustion detected: RSI(${rsi.toFixed(1)}) overbought or below SMA50 support.`;
            } else {
                score = 0.1;
                reasoning = 'Consolidating relative to long-term averages.';
            }

            return { score, reasoning };
        } catch (e) {
            return { score: 0, reasoning: 'Quant timeout or API restriction.' };
        }
    }

    async evaluate(symbols: string[], pulse: any, activeSymbols: Set<string>) {
        const signals: any[] = [];

        // Throttle the massive universe to batches to avoid Alpaca rate limits on Bars
        const BATCH_SIZE = 5;
        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (symbol) => {
                try {
                    // 0. Skip if already held
                    if (activeSymbols.has(symbol)) return;

                    // 1. Base Market Check
                    const snapshot = await alpaca.getBars(symbol, new Date(Date.now() - 86400000).toISOString(), '1Min', 1);
                    const currentPrice = snapshot[0]?.ClosePrice || 0;
                    if (currentPrice === 0) return;

                    // 2. Parallel Analyst Review
                    const [quant, macroScore] = await Promise.all([
                        this.analyzeQuant(symbol, currentPrice),
                        (pulse.newsSentiment - 0.5) * 2 // Macro Analyst Impulse (-1 to 1)
                    ]);

                    const macroReasoning = pulse.macroSummary.split('|')[0].trim();
                    const riskBias = pulse.weatherRisk > 0.3 ? -0.2 : 0.1;

                    // 3. Neural Consensus Synthesis
                    const consensus = (
                        (quant.score * this.analystWeights.quant) +
                        (macroScore * this.analystWeights.macro) +
                        (riskBias * this.analystWeights.risk)
                    );

                    const strength = Math.abs(consensus);

                    if (strength > 0.4) {
                        const type = consensus > 0 ? 'BUY' : 'SELL';

                        // Narrative Generation
                        const story = `Neural Consensus [${type}]: Quant Analyst reports ${quant.reasoning}. Macro Analyst aligns with ${macroReasoning}. Global risk bias is ${riskBias > 0 ? 'nominal' : 'cautionary'}. Conviction: ${(strength * 100).toFixed(0)}%.`;

                        const signal = {
                            symbol,
                            signal_type: type,
                            strength: parseFloat(strength.toFixed(3)),
                            source_agent: 'Neural Hyper-Engine',
                            reasoning: story,
                            metadata: {
                                price_observed: currentPrice,
                                quant_score: quant.score,
                                macro_score: macroScore,
                                rsi_context: quant.reasoning,
                                risk_bias: riskBias
                            }
                        };
                        signals.push(signal);
                    }
                } catch (e) {
                    console.error(`[Strategy] Failed to evaluate ${symbol}:`, e);
                }
            }));

            // Small cooldown between batches to stay under Alpaca rate limits
            if (i + BATCH_SIZE < symbols.length) {
                await new Promise(res => setTimeout(res, 100));
            }
        }

        // --- INTERNAL MONOLOGUE LOGGING ---
        const topSignals = [...signals]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Strategy Engine', 'decision',
                `[${sig.signal_type}] ${sig.symbol} | Conviction: ${(sig.strength * 100).toFixed(0)}%`,
                sig.reasoning
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
