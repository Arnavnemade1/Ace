import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { OmniScanner } from './OmniScanner';
import { DiscordDispatcher } from './DiscordDispatcher';
import { logAgentAction } from '../supabase';
import axios from 'axios';

const CORE_SYMBOLS = [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'V',
    'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'ARKK',
    'PLTR', 'COIN', 'HOOD', 'SOFI', 'AMD', 'INTC', 'MU', 'MSTR', 'SMCI', 'ARM',
    'UNH', 'JNJ', 'PFE', 'ABBV',
    'XOM', 'CVX', 'OXY',
];

export class SwarmOrchestrator {
    private scanner = new MarketScanner();
    private strategy = new StrategyEngine();
    private risk = new RiskController();
    private portfolio = new PortfolioStreamer();
    private omni = new OmniScanner();

    private watchlist: string[] = [...CORE_SYMBOLS];
    private isRunning = false;
    private cycleCounter = 0;
    private discordInterval = 10;   // Discord brief every 10 minutes
    private executionInterval = 10; // Execute signals every 10 minutes
    private latestSentiment = 0.5;

    async start() {
        this.isRunning = true;
        await logAgentAction('Orchestrator', 'info',
            `Swarm Orchestrator started. Monitoring ${this.watchlist.length} symbols. Discord interval: ${this.discordInterval} minutes.`
        );
        await DiscordDispatcher.postUpdate(
            'ACE_OS — DAEMON INITIALIZED',
            [
                `**Watchlist:** ${this.watchlist.length} symbols`,
                `**Execution Interval:** Every ${this.executionInterval} minutes`,
                `**Market Status:** ${this.risk.isMarketOpen() ? 'OPEN' : 'CLOSED — GTC queue active'}`,
            ].join('\n'),
            5763719
        );

        while (this.isRunning) {
            try {
                this.cycleCounter++;
                await this.runCycle();
            } catch (err: any) {
                console.error('Cycle Error:', err);
                await logAgentAction('Orchestrator', 'error', `Cycle Failed: ${err.message}`);
            }
            console.log('Waiting 60 seconds...');
            await new Promise(res => setTimeout(res, 60000));
        }
    }

    async stop() {
        this.isRunning = false;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator stopped.');
    }

    private async refreshWatchlist() {
        try {
            const { data } = await axios.get('https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=20', {
                headers: {
                    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
                    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
                }
            });
            const movers: string[] = [
                ...(data?.gainers?.map((s: any) => s.symbol) || []),
                ...(data?.losers?.map((s: any) => s.symbol) || []),
            ].filter(Boolean);
            if (movers.length > 0) {
                this.watchlist = [...new Set([...CORE_SYMBOLS, ...movers])];
                await logAgentAction('Orchestrator', 'info',
                    `Watchlist updated: ${this.watchlist.length} symbols. Movers added: ${movers.join(', ')}`
                );
            }
        } catch {
            // Screener endpoint optional fallback
        }
    }

    private async runCycle() {
        const marketOpen = this.risk.isMarketOpen();
        const nowET = new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            hour12: true, hour: '2-digit', minute: '2-digit'
        });
        console.log(`\n--- Cycle #${this.cycleCounter} | Market: ${marketOpen ? 'OPEN' : 'CLOSED'} | ${this.watchlist.length} symbols | ${new Date().toISOString()} ---`);

        // Refresh watchlist every 10 cycles
        if (this.cycleCounter % 10 === 1) await this.refreshWatchlist();

        // Stream portfolio
        await this.portfolio.streamLiveData();

        // OmniScanner — scan all watchlist symbols in batches of 10
        const BATCH = 10;
        for (let i = 0; i < this.watchlist.length; i += BATCH) {
            await this.omni.scanAll(this.watchlist.slice(i, i + BATCH));
        }

        // Macro intel
        const macroIntel = { newsSentiment: this.latestSentiment, weatherRisk: 0.2 };

        // Strategy evaluation across full watchlist
        const signals = await this.strategy.evaluate(this.watchlist, macroIntel);

        // Execute top signals every executionInterval cycles
        let executionResult: any = null;
        if (this.cycleCounter % this.executionInterval === 0 && signals.length > 0) {
            const topSignals = signals.sort((a, b) => b.strength - a.strength).slice(0, 5);
            await logAgentAction('Risk Controller', 'decision',
                `Execution window reached. Top ${topSignals.length} signals. Market: ${marketOpen ? 'OPEN' : 'CLOSED'}`
            );
            executionResult = await this.risk.executeSignals(topSignals, marketOpen);
        } else if (signals.length > 0) {
            const remaining = this.executionInterval - (this.cycleCounter % this.executionInterval);
            await logAgentAction('Risk Controller', 'info',
                `${signals.length} signals pending. Next execution in ${remaining} minute(s).`
            );
        } else {
            await logAgentAction('Risk Controller', 'info', `No actionable signals. Monitoring ${this.watchlist.length} symbols.`);
        }

        // Discord brief every 10 cycles (10 minutes)
        if (this.cycleCounter % this.discordInterval === 0) {
            await this.postDiscordBrief(signals, executionResult, marketOpen, nowET);
        }

        console.log(`--- Cycle #${this.cycleCounter} complete ---`);
    }

    private async postDiscordBrief(signals: any[], executionResult: any, marketOpen: boolean, nowET: string) {
        const topSignals = [...signals].sort((a, b) => b.strength - a.strength).slice(0, 10);

        const signalRows = topSignals.length > 0
            ? topSignals.map(s => {
                const dir = s.signal_type === 'BUY' ? 'BUY ' : 'SELL';
                const price = (s.metadata.price_observed || 0).toFixed(2).padStart(10);
                return `  ${dir}  ${s.symbol.padEnd(8)} @ $${price} | Str: ${s.strength}`;
            }).join('\n')
            : '  No significant signals detected this epoch.';

        const orderSummary = executionResult
            ? [
                ...(executionResult.executed || []).map((e: any) =>
                    `✅ EXECUTED: ${e.signal_type} ${e.symbol} x${e.qty} @ $${(e.metadata.price_observed || 0).toFixed(2)}`
                ),
                ...(executionResult.queued || []).map((q: any) =>
                    `⏳ QUEUED (GTC): ${q.signal_type} ${q.symbol} x${q.qty} limit $${(q.limit_price || 0).toFixed(2)}`
                ),
            ].join('\n') || 'No orders executed in this window.'
            : 'Scanning for optimal entry/exit...';

        await DiscordDispatcher.postUpdate(
            `ACE_OS Cycle Complete [Epoch ${this.cycleCounter}/30]`,
            [
                `**Active Monitoring:** ${this.watchlist.slice(0, 15).join(', ')}${this.watchlist.length > 15 ? '...' : ''}`,
                `**Actionable Signals Found:** ${signals.length}`,
                `**Status:** ${marketOpen ? 'TRADING ACTIVE' : 'AWAITING HORIZON (Span Penalty Active)'}`,
                '',
                '**Intelligence Analysis**',
                '```',
                signalRows,
                '```',
                '',
                '**Execution Report**',
                '```',
                orderSummary,
                '```',
                '',
                `*Next descriptive summary in ${this.discordInterval} minutes.*`
            ].join('\n'),
            marketOpen ? 3066993 : 15844367
        );
    }
}
