import { supabase, logAgentAction } from '../supabase';
import { alpaca } from '../alpaca';

export class PortfolioStreamer {
    async streamLiveData() {
        await logAgentAction('Portfolio Optimizer', 'info', 'Fetching live Alpaca portfolio & positions.');

        try {
            const account = await alpaca.getAccount();
            const positions = await alpaca.getPositions();
            const orders = await alpaca.getOrders('open');

            const portfolioState = {
                id: '63963cac-3336-44d5-b7b7-913a89beb74f', // fixed singleton row UUID
                total_value: parseFloat(account.portfolio_value),
                cash: parseFloat(account.cash),
                buying_power: parseFloat(account.buying_power),
                equity: parseFloat(account.equity),
                positions: positions.map((p: any) => ({
                    symbol: p.symbol,
                    qty: parseFloat(p.qty),
                    avg_entry_price: parseFloat(p.avg_entry_price),
                    current_price: parseFloat(p.current_price),
                    market_value: parseFloat(p.market_value),
                    unrealized_pl: parseFloat(p.unrealized_pl),
                    unrealized_plpc: parseFloat(p.unrealized_plpc),
                    side: p.side,
                })),
                orders: orders.map((o: any) => ({
                    symbol: o.symbol,
                    qty: parseFloat(o.qty),
                    side: o.side,
                    type: o.type,
                    status: o.status,
                    limit_price: o.limit_price ? parseFloat(o.limit_price) : null
                })),
                updated_at: new Date().toISOString(),
            };

            // Deprecated Supabase Update to save on realtime messages and DB Ego
            console.log(`[PortfolioStreamer] Local Update: $${portfolioState.total_value.toFixed(2)} | ${positions.length} positions`);

            return portfolioState;
        } catch (err: any) {
            await logAgentAction('Portfolio Optimizer', 'error', `Portfolio stream failed: ${err.message}`);
        }
    }
}
