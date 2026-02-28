import { supabase, logAgentAction } from '../supabase';
import { alpaca } from '../alpaca';

export class PortfolioStreamer {
    async streamLiveData() {
        await logAgentAction('Portfolio Optimizer', 'info', 'Fetching live Alpaca portfolio & positions.');

        try {
            const account = await alpaca.getAccount();
            const positions = await alpaca.getPositions();

            const portfolioState = {
                total_value: parseFloat(account.portfolio_value),
                cash: parseFloat(account.cash),
                positions: positions.map((p: any) => ({
                    symbol: p.symbol,
                    qty: parseFloat(p.qty),
                    current_price: parseFloat(p.current_price),
                    market_value: parseFloat(p.market_value),
                    unrealized_pl: parseFloat(p.unrealized_pl),
                    unrealized_plpc: parseFloat(p.unrealized_plpc)
                })),
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('portfolio_state')
                .update(portfolioState)
                // just update the single row that is inserted by default
                .neq('id', '00000000-0000-0000-0000-000000000000');

            if (error) {
                console.error('Failed to update portfolio state:', error);
            }

            return portfolioState;
        } catch (err: any) {
            await logAgentAction('Portfolio Optimizer', 'error', `Portfolio stream failed: ${err.message}`);
        }
    }
}
