import { logAgentAction, supabase } from '../supabase';

export class StrategyEngine {
    async evaluate(marketData: any[], macroIntel: any) {
        await logAgentAction('Strategy Engine', 'info', 'Evaluating strategies on new market data and intel.');

        const signals = [];

        for (const data of marketData) {
            // Mock logic: randomly decide to BUY or SELL
            const isBuy = Math.random() > 0.5;
            const strength = Math.random();

            if (strength > 0.7) {
                const signal = {
                    symbol: data.symbol,
                    signal_type: isBuy ? 'BUY' : 'SELL',
                    strength: parseFloat(strength.toFixed(2)),
                    source_agent: 'Strategy Engine',
                    metadata: { price_observed: data.price, macro_sentiment: macroIntel.sentiment }
                };

                signals.push(signal);

                await logAgentAction('Strategy Engine', 'decision', `Emitted ${signal.signal_type} signal for ${signal.symbol} with strength ${signal.strength}`);

                // Log signal to Supabase
                await supabase.from('signals').insert(signal);
            }
        }

        return signals;
    }
}
