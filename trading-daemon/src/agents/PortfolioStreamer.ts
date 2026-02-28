import { supabase, logAgentAction } from '../supabase';
import { alpaca } from '../alpaca';

export class PortfolioStreamer {
    async streamLiveData() {
        await logAgentAction('Portfolio Optimizer', 'info', 'Fetching live Alpaca portfolio & positions.');

        try {
            const account = await alpaca.getAccount();
            const positions = await alpaca.getPositions();

            const portfolioState = {
                id: '63963cac-3336-44d5-b7b7-913a89beb74f', // fixed singleton row UUID
                total_value: parseFloat(account.portfolio_value),
                cash: parseFloat(account.cash),
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
                updated_at: new Date().toISOString(),
            };

            // Upsert on id=1 so we always have one fresh row
            const { error } = await (supabase as any)
                .from('portfolio_state')
                .upsert(portfolioState, { onConflict: 'id' });

            if (error) {
                console.error('[PortfolioStreamer] Upsert failed:', error.message);
            } else {
                console.log(`[PortfolioStreamer] Updated: $${portfolioState.total_value.toFixed(2)} | ${positions.length} positions`);
            }

            return portfolioState;
        } catch (err: any) {
            await logAgentAction('Portfolio Optimizer', 'error', `Portfolio stream failed: ${err.message}`);
        }
    }
}
