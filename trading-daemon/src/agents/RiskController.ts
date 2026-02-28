import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';

export class RiskController {
    private positionLimit = 5000; // max $5k per trade

    async executeSignals(signals: any[]) {
        if (signals.length === 0) return;

        await logAgentAction('Risk Controller', 'info', `Reviewing ${signals.length} high-conviction signals.`);

        for (const signal of signals) {
            if (signal.strength < 0.8) continue; // High threshold for execution

            const qty = 1; // Simplify to 1 share for testing

            try {
                await logAgentAction('Risk Controller', 'trade', `Approving ${signal.signal_type} for ${signal.symbol}. Sending to Alpaca...`);

                const order = await alpaca.createOrder({
                    symbol: signal.symbol,
                    qty: qty,
                    side: signal.signal_type.toLowerCase(),
                    type: 'market',
                    time_in_force: 'day',
                });

                // Log trade
                await supabase.from('trades').insert({
                    symbol: signal.symbol,
                    side: signal.signal_type,
                    qty: qty,
                    price: signal.metadata.price_observed || 0,
                    total_value: (signal.metadata.price_observed || 0) * qty,
                    agent: 'Risk Controller',
                    strategy: 'Momentum Scalp',
                    status: 'executed',
                    alpaca_order_id: order.id
                });

                // Mark signal as acted
                await supabase.from('signals').update({ acted_on: true }).eq('symbol', signal.symbol).eq('signal_type', signal.signal_type);

            } catch (err: any) {
                await logAgentAction('Risk Controller', 'error', `Failed to execute ${signal.symbol}: ${err.message}`);
            }
        }
    }
}
