import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { DiscordDispatcher } from './DiscordDispatcher';

export class RiskController {
    private positionLimit = 5000;     // max USD per trade
    private strengthThreshold = 0.65; // minimum signal strength to act

    /** Returns true if NYSE regular trading hours (9:30-16:00 ET, weekdays) */
    isMarketOpen(): boolean {
        const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = nowNY.getDay();
        if (day === 0 || day === 6) return false; // weekend
        const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
        return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
    }

    async executeSignals(signals: any[], isMarketOpen: boolean): Promise<{ executed: any[]; queued: any[] }> {
        const executed: any[] = [];
        const queued: any[] = [];

        if (signals.length === 0) return { executed, queued };

        // Filter to strong enough signals only
        const viable = signals.filter(s => s.strength >= this.strengthThreshold);
        await logAgentAction('Risk Controller', 'info',
            `${viable.length}/${signals.length} signals meet strength threshold (>=${this.strengthThreshold}). Market: ${isMarketOpen ? 'OPEN' : 'CLOSED'}`
        );

        if (viable.length === 0) {
            await logAgentAction('Risk Controller', 'info', 'No signals cleared the strength threshold. Holding.');
            return { executed, queued };
        }

        for (const signal of viable) {
            const price = signal.metadata?.price_observed || 0;
            if (price <= 0) {
                await logAgentAction('Risk Controller', 'error', `Skipping ${signal.symbol} — no valid price attached.`);
                continue;
            }

            const qty = Math.max(1, Math.floor(this.positionLimit / price));
            const side = signal.signal_type.toLowerCase() as 'buy' | 'sell';

            try {
                if (isMarketOpen) {
                    // ─── LIVE MARKET ORDER ───
                    await logAgentAction('Risk Controller', 'trade',
                        `SUBMITTING MARKET ORDER — ${signal.signal_type} ${signal.symbol} x${qty} @ ~$${price.toFixed(2)}`
                    );

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side,
                        type: 'market',
                        time_in_force: 'day',
                    });

                    const filled = { ...signal, qty, order_id: order.id, limit_price: price };
                    executed.push(filled);

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price,
                        total_value: price * qty,
                        agent: 'Risk Controller',
                        strategy: 'Momentum Scalp',
                        status: 'executed',
                        alpaca_order_id: order.id,
                    });

                    await DiscordDispatcher.postTradeAlert(
                        signal.symbol,
                        signal.signal_type.toUpperCase() as 'BUY' | 'SELL',
                        qty,
                        price,
                        signal.reasoning || 'Momentum threshold met.'
                    );

                    await logAgentAction('Risk Controller', 'trade',
                        `ORDER CONFIRMED — ${signal.symbol} x${qty} | Alpaca order id: ${order.id}`
                    );

                } else {
                    // ─── MARKET CLOSED — GTC LIMIT ORDER ───
                    const limitPrice = side === 'buy'
                        ? parseFloat((price * 1.002).toFixed(2))
                        : parseFloat((price * 0.998).toFixed(2));

                    await logAgentAction('Risk Controller', 'info',
                        `MARKET CLOSED — Submitting GTC limit order: ${signal.signal_type} ${signal.symbol} x${qty} @ $${limitPrice} (fires at open)`
                    );

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side,
                        type: 'limit',
                        limit_price: limitPrice,
                        time_in_force: 'gtc',
                    });

                    const q = { ...signal, qty, limit_price: limitPrice, order_id: order.id };
                    queued.push(q);

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price: limitPrice,
                        total_value: limitPrice * qty,
                        agent: 'Risk Controller',
                        strategy: 'Overnight GTC',
                        status: 'queued',
                        alpaca_order_id: order.id,
                    });

                    await DiscordDispatcher.postQueueAlert(
                        signal.symbol,
                        signal.signal_type.toUpperCase() as 'BUY' | 'SELL',
                        qty,
                        limitPrice,
                        signal.reasoning || 'Momentum threshold met — queued for market open.'
                    );

                    await logAgentAction('Risk Controller', 'trade',
                        `GTC ORDER CONFIRMED — ${signal.symbol} x${qty} limit $${limitPrice} | Alpaca order id: ${order.id}`
                    );
                }

                // Mark signal as acted upon
                await supabase.from('signals')
                    .update({ acted_on: true })
                    .eq('symbol', signal.symbol)
                    .eq('signal_type', signal.signal_type);

            } catch (err: any) {
                const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                await logAgentAction('Risk Controller', 'error',
                    `ALPACA ORDER FAILED — ${signal.symbol}: ${detail}`
                );
            }
        }

        return { executed, queued };
    }
}
