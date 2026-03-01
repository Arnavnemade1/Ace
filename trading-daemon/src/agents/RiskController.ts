import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { DiscordDispatcher } from './DiscordDispatcher';

export class RiskController {
    private positionLimit = 5000;     // max USD per trade
    private strengthThreshold = 0.7; // minimum signal strength to act
    private buyStrengthThreshold = 0.8; // stricter BUY threshold
    private maxTradesPerCycle = 1;
    private minMinutesBetweenTrades = 30;
    private minBuyingPower = 1000;
    private cashBufferPct = 0.25; // keep 25% cash
    private maxAllocationPct = 0.02; // max 2% equity per trade

    // [x] Phase 32: Symbol Fatigue & Manual Blacklist
    private SYMBOL_BLACKLIST = new Set(['HOOD', 'SOFI', 'ABBV']);

    /** Returns true if NYSE regular trading hours (9:30-16:00 ET, weekdays) */
    isMarketOpen(): boolean {
        const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = nowNY.getDay();
        if (day === 0 || day === 6) return false; // weekend
        const minutes = nowNY.getHours() * 60 + nowNY.getMinutes();
        return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
    }

    private recentlyPushed = new Set<string>();
    private lastTradeLocalTs = 0;

    /**
     * [x] Phase 31: Dynamic Risk Gating
     * Validates account state before any execution.
     */
    async validateAccount(account: any): Promise<boolean> {
        if (account.trading_blocked) {
            await logAgentAction('Risk Controller', 'error', 'ALGORITHM HALTED: Alpaca account is TRADING_BLOCKED.');
            return false;
        }
        if (account.status !== 'ACTIVE') {
            await logAgentAction('Risk Controller', 'error', `ALGORITHM HALTED: Account status is ${account.status}.`);
            return false;
        }
        return true;
    }

    async executeSignals(signals: any[], isMarketOpen: boolean, account: any, currentPositions: any[] = [], openOrders: any[] = []): Promise<{ executed: any[]; queued: any[] }> {
        const executed: any[] = [];
        const queued: any[] = [];

        if (signals.length === 0) return { executed, queued };

        // Global cooldown: don't trade too frequently
        const { data: lastTrade } = await supabase
            .from('trades')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (lastTrade?.created_at) {
            const ageMs = Date.now() - new Date(lastTrade.created_at).getTime();
            if (ageMs < this.minMinutesBetweenTrades * 60 * 1000) {
                await logAgentAction('Risk Controller', 'info', `Cooldown active: last trade ${Math.round(ageMs / 60000)}m ago. Skipping new orders.`);
                return { executed, queued };
            }
        }
        if (this.lastTradeLocalTs && Date.now() - this.lastTradeLocalTs < this.minMinutesBetweenTrades * 60 * 1000) {
            await logAgentAction('Risk Controller', 'info', `Local cooldown active. Skipping new orders.`);
            return { executed, queued };
        }

        // 0. Account Health Guard
        const isHealthy = await this.validateAccount(account);
        if (!isHealthy) return { executed, queued };

        // 1. Filter to strong enough signals only
        const viable = signals.filter(s => s.strength >= this.strengthThreshold);

        // 2. Ironclad Position Guard (Blocks duplicates, orders, and recent pushes)
        const posSymbols = new Set(currentPositions.map(p => p.symbol));
        const orderSymbols = new Set(openOrders.map(o => o.symbol));
        const orderSidesBySymbol = new Map<string, Set<string>>();
        for (const o of openOrders) {
            const sym = o.symbol;
            const side = (o.side || '').toLowerCase();
            if (!orderSidesBySymbol.has(sym)) orderSidesBySymbol.set(sym, new Set());
            if (side) orderSidesBySymbol.get(sym)!.add(side);
        }

        const finalViable: any[] = [];
        for (const s of viable) {
            // [x] Phase 32: Hard Blacklist Check
            if (this.SYMBOL_BLACKLIST.has(s.symbol)) {
                console.log(`[Risk Guard] Blocking BLACKLISTED symbol: ${s.symbol}`);
                continue;
            }

            if (s.signal_type === 'BUY') {
                // Persistent check: 24h Supabase lookup + Local cache + Current holdings
                const tradedRecently = await this.hasTradedRecently(s.symbol, 'BUY');
                const held = posSymbols.has(s.symbol) || orderSymbols.has(s.symbol) || this.recentlyPushed.has(s.symbol) || tradedRecently;

                if (held) {
                    console.log(`[Risk Guard] Blocking duplicate BUY for ${s.symbol}. Stock already in portfolio or traded in last 24h.`);
                    continue;
                }
                if (orderSidesBySymbol.get(s.symbol)?.has('sell')) {
                    console.log(`[Risk Guard] Blocking BUY for ${s.symbol}. Existing SELL order open (wash-trade risk).`);
                    continue;
                }
            } else if (s.signal_type === 'SELL') {
                // Sell-Side Guard: Only sell if we have a position to liquidate AND no open order
                const hasPosition = posSymbols.has(s.symbol);
                const hasOpenOrder = orderSymbols.has(s.symbol);

                if (!hasPosition) {
                    console.log(`[Risk Guard] Blocking NAKED SELL for ${s.symbol}. No active position found.`);
                    continue;
                }
                if (hasOpenOrder || this.recentlyPushed.has(s.symbol)) {
                    console.log(`[Risk Guard] Blocking redundant SELL for ${s.symbol}. Open order already exists or was recently submitted.`);
                    continue;
                }
                if (orderSidesBySymbol.get(s.symbol)?.has('buy')) {
                    console.log(`[Risk Guard] Blocking SELL for ${s.symbol}. Existing BUY order open (wash-trade risk).`);
                    continue;
                }
            }
            finalViable.push(s);
        }

        // 3. Exposure Cap: Don't allow more than 15 active positions (increased from 10)
        if (currentPositions.length >= 15 && finalViable.some(s => s.signal_type === 'BUY')) {
            await logAgentAction('Risk Controller', 'info', `Exposure Cap Reached (${currentPositions.length}/15). Skipping new BUY signals.`);
            return { executed, queued };
        }

        if (finalViable.length === 0) return { executed, queued };

        const modeMsg = isMarketOpen ? 'LIVE MARKET TRADING' : 'MARKET CLOSED - PRE-ORDER MODE (GTC)';
        await logAgentAction('Risk Controller', 'info', `Operational Mode: ${modeMsg}`);

        // 4. Dynamic Lot Sizing based on Account Equity/Buying Power
        const equity = parseFloat(account.equity);
        const buyingPower = parseFloat(account.buying_power);
        const cash = parseFloat(account.cash ?? account.buying_power ?? "0");
        const minCashBuffer = equity * this.cashBufferPct;
        const maxPerTrade = Math.min(equity * this.maxAllocationPct, buyingPower * 0.25, 5000); // 2% equity, 25% BP, or $5000

        let executedThisCycle = 0;
        for (const signal of finalViable) {
            if (buyingPower < this.minBuyingPower) {
                await logAgentAction('Risk Controller', 'info', `Buying power below $${this.minBuyingPower}. Skipping trades.`);
                break;
            }
            if (executedThisCycle >= this.maxTradesPerCycle) break;
            // [x] Phase 35: Crypto Bypass (24/7 execution)
            const isCrypto = signal.symbol.includes('/USD');
            const canTradeNow = isMarketOpen || isCrypto;

            const price = await this.getLivePrice(signal.symbol, signal.metadata?.price_observed || 0);
            if (price <= 0) continue;

            const qty = Math.max(1, Math.floor(maxPerTrade / price));
            const side = signal.signal_type.toLowerCase() as 'buy' | 'sell';

            if (side === 'buy') {
                if (signal.strength < this.buyStrengthThreshold) {
                    await logAgentAction('Risk Controller', 'info', `Skipping BUY ${signal.symbol}: strength ${signal.strength} below ${this.buyStrengthThreshold}.`);
                    continue;
                }
                if (cash < minCashBuffer) {
                    await logAgentAction('Risk Controller', 'info', `Cash buffer hit. Cash $${cash.toFixed(2)} < $${minCashBuffer.toFixed(2)}. Skipping BUY ${signal.symbol}.`);
                    continue;
                }
            }

            if (qty * price > buyingPower && side === 'buy') {
                await logAgentAction('Risk Controller', 'error', `INSOLVENT: Required $${(qty * price).toFixed(2)} exceeds $${buyingPower.toFixed(2)} Buying Power.`);
                continue;
            }

            try {
                if (canTradeNow) {
                    // --- LIVE TRADING ---
                    await logAgentAction('Risk Controller', 'trade',
                        `EXECUTING ${signal.signal_type} ${signal.symbol} x${qty} | Reasoning: ${signal.reasoning}`
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
                    this.lastTradeLocalTs = Date.now();
                    executedThisCycle++;

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
                    const limitPrice = side === 'buy'
                        ? parseFloat((price * 1.001).toFixed(2))
                        : parseFloat((price * 0.999).toFixed(2));

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

                    // [x] Phase 34: Local Session Memory
                    this.recentlyPushed.add(signal.symbol);
                    this.lastTradeLocalTs = Date.now();
                    executedThisCycle++;

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

    private async getLivePrice(symbol: string, fallback: number): Promise<number> {
        try {
            const bars = await alpaca.getBars(symbol, new Date(Date.now() - 5 * 60 * 1000).toISOString(), '1Min', 1);
            const last = bars[bars.length - 1];
            const price = last?.ClosePrice || last?.close || 0;
            return price > 0 ? price : fallback;
        } catch {
            return fallback;
        }
    }

    private async hasTradedRecently(symbol: string, side: string): Promise<boolean> {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('trades')
            .select('id')
            .eq('symbol', symbol)
            .eq('side', side)
            .gte('created_at', oneDayAgo)
            .limit(1);

        if (error) return false;
        return (data && data.length > 0);
    }
}
