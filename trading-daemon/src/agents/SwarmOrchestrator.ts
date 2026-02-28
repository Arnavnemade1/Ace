import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { OmniScanner } from './OmniScanner';
import { DiscordDispatcher } from './DiscordDispatcher';
import { logAgentAction } from '../supabase';
import axios from 'axios';

// ── Dynamic Watchlist ──
// We start with a large curated list and also fetch the top movers dynamically from Alpaca
const CORE_SYMBOLS = [
    // Mega-cap US Equities
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'V',
    // ETFs & Macro Proxies
    'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'ARKK',
    // High-volatility / Momentum
    'PLTR', 'COIN', 'HOOD', 'SOFI', 'AMD', 'INTC', 'MU', 'MSTR', 'SMCI', 'ARM',
    // Healthcare / Defensive
    'UNH', 'JNJ', 'PFE', 'ABBV',
    // Energy / Commodities
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
    private discordInterval = 10; // post to Discord every 10 cycles (= 10 mins)
    private executionInterval = 10; // evaluate + attempt execution every 10 cycles

    // News sentiment collected from OmniScanner cycles
    private latestSentiment = 0.5;

    async start() {
        this.isRunning = true;
        await logAgentAction('Orchestrator', 'info', `Swarm Orchestrator Started. Monitoring ${this.watchlist.length} symbols. Discord heartbeat every ${this.discordInterval} mins.`);
        await DiscordDispatcher.postUpdate(
            '🚀 ACE_OS DAEMON BOOT',
            `System initialized.\n**Watchlist:** ${this.watchlist.length} symbols\n**Execution Window:** Every ${this.executionInterval} mins\n**Market:** ${this.risk.isMarketOpen() ? '✅ OPEN' : '🌙 CLOSED — GTC queue active'}`,
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

            console.log('⏳ Waiting 60 seconds...');
            await new Promise(res => setTimeout(res, 60000));
        }
    }

    async stop() {
        this.isRunning = false;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator Stopped.');
    }

    /**
     * Dynamically refresh watchlist by pulling top Alpaca gainers/losers
     */
    private async refreshWatchlist() {
        try {
            const { data } = await axios.get('https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=20', {
                headers: {
                    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
                    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
                }
            });

            const topSymbols: string[] = [
                ...(data?.gainers?.map((s: any) => s.symbol) || []),
                ...(data?.losers?.map((s: any) => s.symbol) || []),
            ].filter(Boolean);

            if (topSymbols.length > 0) {
                // Merge core + movers, deduplicate
                this.watchlist = [...new Set([...CORE_SYMBOLS, ...topSymbols])];
                console.log(`[Watchlist] Updated: ${this.watchlist.length} symbols (${topSymbols.length} movers added)`);
                await logAgentAction('Orchestrator', 'info', `Watchlist refreshed: ${this.watchlist.length} symbols. Movers: ${topSymbols.join(', ')}`);
            }
        } catch (e) {
            console.log('[Watchlist] Mover refresh unavailable, using core list.');
        }
    }

    private async runCycle() {
        const marketOpen = this.risk.isMarketOpen();
        const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: true, hour: '2-digit', minute: '2-digit' });
        console.log(`\n--- [${new Date().toISOString()}] Cycle #${this.cycleCounter} | Market: ${marketOpen ? 'OPEN' : 'CLOSED'} | ${this.watchlist.length} symbols ---`);

        // 0. Refresh watchlist every 10 cycles to pick up hot movers
        if (this.cycleCounter % 10 === 1) {
            await this.refreshWatchlist();
        }

        // 1. Stream Portfolio
        await this.portfolio.streamLiveData();

        // 2. OmniScanner — pass symbol subset (first 10 to stay within API limits)
        const scanSymbols = this.watchlist.slice(0, 10);
        await this.omni.scanAll(scanSymbols);

        // 3. Macro Intel from last runs
        const macroIntel = { newsSentiment: this.latestSentiment, weatherRisk: 0.2 };

        // 4. Evaluate Strategy on FULL watchlist
        const signals = await this.strategy.evaluate(this.watchlist, macroIntel);

        // 5. Execute / Queue every executionInterval cycles
        let executionResult: any = null;
        if (this.cycleCounter % this.executionInterval === 0 && signals.length > 0) {
            const topSignals = signals
                .sort((a, b) => b.strength - a.strength)
                .slice(0, 5); // Execute top 5 strongest signals

            await logAgentAction('Risk Controller', 'decision',
                `Execution window reached. Processing top ${topSignals.length} signals. Market: ${marketOpen ? 'OPEN' : 'CLOSED'}`
            );
            executionResult = await this.risk.executeSignals(topSignals, marketOpen);
        } else if (signals.length > 0) {
            const remaining = this.executionInterval - (this.cycleCounter % this.executionInterval);
            await logAgentAction('Risk Controller', 'info',
                `${signals.length} signals pending. Next execution window in ${remaining} min(s).`
            );
        } else {
            await logAgentAction('Risk Controller', 'info', `No actionable signals. Monitoring ${this.watchlist.length} symbols.`);
        }

        // 6. Discord Heartbeat — every 10 cycles
        if (this.cycleCounter % this.discordInterval === 0) {
            await this.postRichDiscordUpdate(signals, executionResult, marketOpen, nowET);
        }

        console.log(`--- Cycle #${this.cycleCounter} Complete ---`);
    }

    private async postRichDiscordUpdate(signals: any[], executionResult: any, marketOpen: boolean, nowET: string) {
        const topSignals = signals.sort((a, b) => b.strength - a.strength).slice(0, 5);

        const signalLines = topSignals.length > 0
            ? topSignals.map(s =>
                `> \`${s.signal_type === 'BUY' ? '🟢' : '🔴'} ${s.symbol}\` — $${(s.metadata.price_observed || 0).toFixed(2)} | Δ${(s.metadata.price_change_pct || 0).toFixed(2)}% | strength \`${s.strength}\``
            ).join('\n')
            : '> No high-conviction signals this window.';

        const execLines = executionResult
            ? [
                ...(executionResult.executed || []).map((e: any) => `> ✅ EXECUTED: **${e.signal_type} ${e.symbol}** x${e.qty} @ ~$${(e.metadata.price_observed || 0).toFixed(2)}`),
                ...(executionResult.queued || []).map((q: any) => `> 🌙 QUEUED (GTC): **${q.signal_type} ${q.symbol}** x${q.qty} @ $${(q.limit_price || 0).toFixed(2)}`),
            ].join('\n') || '> No orders this window.'
            : '> Execution window not reached yet.';

        await DiscordDispatcher.postUpdate(
            `📊 ACE_OS — 10-MIN INTELLIGENCE BRIEF`,
            [
                `**🕐 Time:** ${nowET} ET  |  **Market:** ${marketOpen ? '✅ OPEN' : '🌙 CLOSED'}`,
                `**📡 Scanning:** ${this.watchlist.length} symbols`,
                `**🔬 Signals Found:** ${signals.length}`,
                '',
                '**📈 Top Signals This Window:**',
                signalLines,
                '',
                '**⚡ Execution:**',
                execLines,
                '',
                `**💡 Sentiment Index:** ${this.latestSentiment.toFixed(2)} | **Next Exec Window:** T-${this.executionInterval - (this.cycleCounter % this.executionInterval)} min`,
            ].join('\n'),
            marketOpen ? 3066993 : 9807270 // green if open, grey if closed
        );
    }
}
