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

    private recentlyPushed = new Set<string>();

    async executeSignals(signals: any[], isMarketOpen: boolean, currentPositions: any[] = [], openOrders: any[] = []): Promise<{ executed: any[]; queued: any[] }> {
        const executed: any[] = [];
        const queued: any[] = [];

        if (signals.length === 0) return { executed, queued };

        // 1. Filter to strong enough signals only
        const viable = signals.filter(s => s.strength >= this.strengthThreshold);

        // 2. Ironclad Position Guard (Blocks duplicates, orders, and recent pushes)
        const posSymbols = new Set(currentPositions.map(p => p.symbol));
        const orderSymbols = new Set(openOrders.map(o => o.symbol));

        const finalViable = viable.filter(s => {
            if (s.signal_type === 'BUY') {
                const held = posSymbols.has(s.symbol) || orderSymbols.has(s.symbol) || this.recentlyPushed.has(s.symbol);
                if (held) {
                    console.log(`[Risk Guard] Blocking duplicate BUY for ${s.symbol}. Position exists or order in flight.`);
                    return false;
                }
            }
            return true;
        });

        // 3. Exposure Cap: Don't allow more than 10 active positions
        if (currentPositions.length >= 10 && finalViable.some(s => s.signal_type === 'BUY')) {
            await logAgentAction('Risk Controller', 'info', `Exposure Cap Reached (${currentPositions.length}/10). Skipping new BUY signals.`);
            return { executed, queued };
        }

        if (finalViable.length === 0) {
            this.recentlyPushed.clear(); // Reset cache if nothing is viable
            return { executed, queued };
        }

        const modeMsg = isMarketOpen ? 'LIVE MARKET TRADING' : 'MARKET CLOSED - PRE-ORDER MODE (GTC)';
        await logAgentAction('Risk Controller', 'info', `Operational Mode: ${modeMsg}`);

        for (const signal of finalViable) {
            const price = signal.metadata?.price_observed || 0;
            if (price <= 0) continue;

            const qty = Math.max(1, Math.floor(this.positionLimit / price));
            const side = signal.signal_type.toLowerCase() as 'buy' | 'sell';

            try {
                if (isMarketOpen) {
                    // --- LIVE TRADING ---
                    await logAgentAction('Risk Controller', 'trade',
                        `EXECUTING ${signal.signal_type} ${signal.symbol} | Reasoning: ${signal.reasoning}`
                    );

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side,
                        type: 'market',
                        time_in_force: 'day',
                    });

                    executed.push({ ...signal, qty, order_id: order.id, limit_price: price });
                    this.recentlyPushed.add(signal.symbol);

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price,
                        total_value: price * qty,
                        agent: 'Risk Controller',
                        strategy: 'Intelligence Execution',
                        status: 'executed',
                        alpaca_order_id: order.id,
                    });

                    await DiscordDispatcher.postTradeAlert(signal.symbol, signal.signal_type.toUpperCase() as 'BUY' | 'SELL', qty, price, signal.reasoning);
                } else {
                    // --- PRE-ORDER MODE ---
                    const limitPrice = side === 'buy' ? parseFloat((price * 1.005).toFixed(2)) : parseFloat((price * 0.995).toFixed(2));

                    await logAgentAction('Risk Controller', 'info',
                        `PRE-ORDERING ${signal.symbol} x${qty} @ $${limitPrice} | Next market open GTC.`
                    );

                    const order = await alpaca.createOrder({
                        symbol: signal.symbol,
                        qty,
                        side,
                        type: 'limit',
                        limit_price: limitPrice,
                        time_in_force: 'gtc',
                    });

                    queued.push({ ...signal, qty, limit_price: limitPrice, order_id: order.id });
                    this.recentlyPushed.add(signal.symbol);

                    await supabase.from('trades').insert({
                        symbol: signal.symbol,
                        side: signal.signal_type,
                        qty,
                        price: limitPrice,
                        total_value: limitPrice * qty,
                        agent: 'Risk Controller',
                        strategy: 'GTC Pre-order',
                        status: 'queued',
                        alpaca_order_id: order.id,
                    });

                    await DiscordDispatcher.postQueueAlert(signal.symbol, signal.signal_type.toUpperCase() as 'BUY' | 'SELL', qty, limitPrice, `Pre-order for open: ${signal.reasoning}`);
                }

                await supabase.from('signals')
                    .update({ acted_on: true })
                    .eq('symbol', signal.symbol)
                    .eq('signal_type', signal.signal_type);

            } catch (err: any) {
                const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                await logAgentAction('Risk Controller', 'error', `ORDER FAILED: ${signal.symbol} -> ${detail}`);
            }
        }

        return { executed, queued };
    }
}
