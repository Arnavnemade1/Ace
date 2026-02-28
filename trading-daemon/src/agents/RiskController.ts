import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { DiscordDispatcher } from './DiscordDispatcher';

export class RiskController {
    private positionLimit = 5000; // max $5k per trade
    private strengthThreshold = 0.65; // execute at 0.65+ (not 0.8)

    /**
     * Returns true if US markets are currently in regular trading hours (9:30-16:00 ET)
     */
    isMarketOpen(): boolean {
        const now = new Date();
        // Convert to Eastern Time
        const etOffset = -5 * 60; // UTC-5 (EST); daylight savings handled approximately
        const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
        const etMinutes = ((utcMinutes + etOffset) % 1440 + 1440) % 1440; // wrap negative
        const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) return false; // weekend
        return etMinutes >= 9 * 60 + 30 && etMinutes < 16 * 60; // 9:30 AM – 4:00 PM
    }

    async executeSignals(signals: any[], isMarketOpen: boolean) {
        if (signals.length === 0) return [];

        await logAgentAction('Risk Controller', 'info', `Reviewing ${signals.length} high-conviction signals. Market ${isMarketOpen ? 'OPEN ✅' : 'CLOSED 🌙'}`);

        const executed: any[] = [];
        const queued: any[] = [];

        for (const signal of signals) {
            if (signal.strength < this.strengthThreshold) continue;

            const price = signal.metadata?.price_observed || 0;
            const qty = price > 0 ? Math.max(1, Math.floor(this.positionLimit / price)) : 1;

            if (isMarketOpen) {
                // ── LIVE EXECUTION ──
                try {
                    await logAgentAction('Risk Controller', 'trade',
                        `EXECUTING ${signal.signal_type} ${signal.symbol} x${qty} @ ~$${price.toFixed(2)}`
                    );

                    await DiscordDispatcher.postTradeAlert(
                        signal.symbol,
                        signal.signal_type.toUpperCase() as 'BUY' | 'SELL',
                        qty,
                        price,
                        signal.reasoning || 'Momentum threshold met'
                    );

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side: signal.signal_type.toLowerCase(),
                        type: 'market',
                        time_in_force: 'day',
                    });

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price,
                        total_value: price * qty,
                        agent: 'Risk Controller',
                        strategy: 'Momentum Scalp',
                        status: 'executed',
                        alpaca_order_id: order.id
                    });

                    executed.push({ ...signal, qty, order_id: order.id });
                } catch (err: any) {
                    await logAgentAction('Risk Controller', 'error', `Failed to execute ${signal.symbol}: ${err.message}`);
                }

            } else {
                // ── OVERNIGHT QUEUE: submit GTC limit order that fires at open ──
                try {
                    await logAgentAction('Risk Controller', 'info',
                        `🌙 QUEUING ${signal.signal_type} ${signal.symbol} x${qty} @ $${price.toFixed(2)} (GTC — executes at market open)`
                    );

                    const limitPrice = signal.signal_type === 'BUY'
                        ? parseFloat((price * 1.002).toFixed(2))   // buy slightly above last price
                        : parseFloat((price * 0.998).toFixed(2));  // sell slightly below

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side: signal.signal_type.toLowerCase(),
                        type: 'limit',
                        limit_price: limitPrice,
                        time_in_force: 'gtc', // Good-Till-Cancelled — fires when market opens
                    });

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price: limitPrice,
                        total_value: limitPrice * qty,
                        agent: 'Risk Controller',
                        strategy: 'Overnight GTC Queue',
                        status: 'queued',
                        alpaca_order_id: order.id
                    });

                    queued.push({ ...signal, qty, limit_price: limitPrice, order_id: order.id });
                } catch (err: any) {
                    await logAgentAction('Risk Controller', 'error', `Failed to queue overnight ${signal.symbol}: ${err.message}`);
                }
            }

            await supabase.from('signals').update({ acted_on: true }).eq('symbol', signal.symbol).eq('signal_type', signal.signal_type);
        }

        return { executed, queued };
    }
}
