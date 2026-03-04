import { getDirectiveConfig, logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { BrainAgent, BrainContext } from './BrainAgent';
import { SECTORS, SOVEREIGN_PRIORITY_SECTORS } from '../universe';

export class StrategyEngine {
    private brain = new BrainAgent();

    private async getSituationalContext(symbol: string, currentPrice: number) {
        try {
            // 1. Get 52-Week Range
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 365);
            const bars = await alpaca.getBars(symbol, startDate.toISOString(), '1Day');

            let low = currentPrice;
            let high = currentPrice;

            if (bars.length > 0) {
                low = Math.min(...bars.map(b => b.LowPrice));
                high = Math.max(...bars.map(b => b.HighPrice));
            }

            const range = high - low;
            const percentOfRange = range > 0 ? (currentPrice - low) / range : 0.5;

            // 2. Identify Sector
            let sector = 'UNKNOWN';
            for (const [s, syms] of Object.entries(SECTORS)) {
                if (syms.includes(symbol)) {
                    sector = s;
                    break;
                }
            }

            const isSovereignPriority = SOVEREIGN_PRIORITY_SECTORS.includes(sector);

            return {
                range52Week: { low, high, percentOfRange },
                sector,
                isSovereignPriority
            };
        } catch (e) {
            return {
                range52Week: { low: currentPrice * 0.8, high: currentPrice * 1.2, percentOfRange: 0.5 },
                sector: 'UNKNOWN',
                isSovereignPriority: false
            };
        }
    }

    private async getTechnicals(symbol: string, currentPrice: number) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 45); // 45 days for solid SMA50
            const bars = await alpaca.getBars(symbol, startDate.toISOString(), '1Day');

            if (bars.length < 14) return { rsi: 50, sma50: currentPrice };

            const closes = bars.map(b => b.ClosePrice);

            // RSI Calculation
            const period = 14;
            let gains = 0, losses = 0;
            for (let i = closes.length - period; i < closes.length; i++) {
                const diff = closes[i] - (closes[i - 1] || closes[i]);
                if (diff >= 0) gains += diff;
                else losses -= diff;
            }
            const rs = (gains / period) / ((losses / period) || 1);
            const rsi = 100 - (100 / (1 + rs));

            // SMA50
            const sma50 = closes.reduce((a, b) => a + b, 0) / closes.length;

            return { rsi, sma50 };
        } catch (e) {
            return { rsi: 50, sma50: currentPrice };
        }
    }

    async evaluate(symbols: string[], pulse: any, activeSymbols: Set<string>, account: any, positions: any[]) {
        const signals: any[] = [];
        const BATCH_SIZE = 3; // Reduced batch size due to heavier historical fetching
        const directive = await getDirectiveConfig();
        const strategyBias = String(directive.strategy_bias || 'balanced');
        const tradingEnabled = directive.trading_enabled !== false;

        if (!tradingEnabled) {
            return [];
        }

        const minConviction = strategyBias === 'aggressive' ? 0.75 : strategyBias === 'conservative' ? 0.9 : 0.82;

        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (symbol) => {
                try {
                    if (activeSymbols.has(symbol)) return;

                    // 1. Get Real-time Context
                    const snapshot = await alpaca.getBars(symbol, new Date(Date.now() - 600000).toISOString(), '1Min', 1);
                    const currentPrice = snapshot[0]?.ClosePrice || 0;
                    if (currentPrice === 0) return;

                    const [technicals, situational] = await Promise.all([
                        this.getTechnicals(symbol, currentPrice),
                        this.getSituationalContext(symbol, currentPrice)
                    ]);

                    // 2. HeadContext news filtered for symbol
                    const newsHeadlines = pulse.newsHeadlines?.filter((h: string) => h.toLowerCase().includes(symbol.toLowerCase())) || pulse.newsHeadlines?.slice(0, 5) || [];

                    // 3. Deep Brain Synthesis
                    const context: BrainContext = {
                        symbol,
                        technicals: { ...technicals, currentPrice },
                        pulse: {
                            newsSentiment: pulse.newsSentiment,
                            macroSummary: pulse.macroSummary,
                            weatherRisk: pulse.weatherRisk
                        },
                        situational,
                        newsHeadlines,
                        portfolio: {
                            cash: account.cash,
                            equity: account.equity,
                            buyingPower: account.buying_power,
                            positions
                        }
                    };

                    const decision = await this.brain.synthesize(context);

                    if (decision.action !== 'HOLD' && decision.conviction >= minConviction) {
                        const signal = {
                            symbol,
                            signal_type: decision.action,
                            strength: parseFloat(decision.conviction.toFixed(3)),
                            source_agent: 'Omni-Brain (Sovereign Context)',
                            reasoning: decision.reasoning,
                            metadata: {
                                price_observed: currentPrice,
                                rsi: technicals.rsi,
                                sma50: technicals.sma50,
                                range_percent: situational.range52Week.percentOfRange,
                                is_priority: situational.isSovereignPriority,
                                sentiment: pulse.newsSentiment
                            }
                        };
                        signals.push(signal);
                    }
                } catch (e) {
                    console.error(`[Strategy] Brain synthesis failed for ${symbol}:`, e);
                }
            }));

            if (i + BATCH_SIZE < symbols.length) {
                await new Promise(res => setTimeout(res, 500));
            }
        }

        // --- INTERNAL MONOLOGUE LOGGING ---
        const topSignals = [...signals]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 5);

        for (const sig of topSignals) {
            await logAgentAction('Strategy Engine', 'decision',
                `[${sig.signal_type}] ${sig.symbol} | Range: ${(sig.metadata.range_percent * 100).toFixed(0)}% | Prio: ${sig.metadata.is_priority}`,
                sig.reasoning
            );
            await supabase.from('signals').insert(sig);
        }

        return signals;
    }
}
