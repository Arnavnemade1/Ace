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

        // --- LEAN HANDSHAKE ---
        // Parallelize initial connections to reduce boot latency
        const bootMsg = `ACE_OS Daemon Initialized | Watchlist: ${this.watchlist.length} symbols | Execution Interval: ${this.executionInterval}m`;
        console.log(`🚀 ${bootMsg}`);

        await Promise.all([
            logAgentAction('Orchestrator', 'info', 'Daemon Booted', bootMsg),
            this.refreshWatchlist(),
            this.portfolio.streamLiveData(),
            DiscordDispatcher.postUpdate(
                'ACE_OS — DAEMON ONLINE',
                `**Status:** System Normal\n**Watchlist:** ${this.watchlist.length} symbols\n**Market:** ${this.risk.isMarketOpen() ? 'OPEN' : 'CLOSED'}`,
                5763719
            )
        ]);

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

        // 1. Refresh watchlist & Fetch Portfolio state
        if (this.cycleCounter % 10 === 1) await this.refreshWatchlist();
        await this.portfolio.streamLiveData();

        // 2. Fetch current active positions and open orders from Alpaca
        const [positions, openOrders] = await Promise.all([
            axios.get('https://paper-api.alpaca.markets/v2/positions', { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY } }).then(r => r.data).catch(() => []),
            axios.get('https://paper-api.alpaca.markets/v2/orders?status=open', { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY } }).then(r => r.data).catch(() => [])
        ]);

        const activeSymbols = new Set([
            ...positions.map((p: any) => p.symbol),
            ...openOrders.map((o: any) => o.symbol)
        ]);

        // 3. OmniScanner — scan all watchlist symbols and synthesize Global Pulse
        const BATCH = 10;
        for (let i = 0; i < this.watchlist.length; i += BATCH) {
            await this.omni.scanAll(this.watchlist.slice(i, i + BATCH));
        }
        const pulse = this.omni.getGlobalPulse();
        await logAgentAction('Orchestrator', 'info', 'Market Pulse Synthesized', pulse.macroSummary);

        // 4. Strategy evaluation with full Market Pulse and Position Awareness
        const signals = await this.strategy.evaluate(this.watchlist, pulse, activeSymbols);

        // 5. Execute top signals every executionInterval cycles with extra Risk Guardrails
        let executionResult: any = null;
        if (this.cycleCounter % this.executionInterval === 0 && signals.length > 0) {
            const topSignals = signals.sort((a, b) => b.strength - a.strength).slice(0, 5);
            await logAgentAction('Risk Controller', 'decision',
                `Execution window reached. Pulse: ${pulse.newsSentiment.toFixed(2)} | Active Positions: ${activeSymbols.size}`
            );
            executionResult = await this.risk.executeSignals(topSignals, marketOpen, positions, openOrders);
        } else if (signals.length > 0) {
            const remaining = this.executionInterval - (this.cycleCounter % this.executionInterval);
            await logAgentAction('Risk Controller', 'info',
                `${signals.length} signals pending. Market Consensus: ${pulse.macroSummary}. Next execution in ${remaining}m.`
            );
        } else {
            await logAgentAction('Risk Controller', 'info', `No actionable signals. Global Sentiment: ${pulse.newsSentiment.toFixed(2)}.`);
        }

        // 6. Discord brief every 10 cycles (10 minutes)
        if (this.cycleCounter % this.discordInterval === 0) {
            await this.postDiscordBrief(signals, executionResult, marketOpen, nowET, pulse);
        }

        console.log(`--- Cycle #${this.cycleCounter} complete ---`);
    }

    private async postDiscordBrief(signals: any[], executionResult: any, marketOpen: boolean, nowET: string, pulse: any) {
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
                `> **Global Pulse:** ${pulse.macroSummary}`,
                `> **News Sentiment:** ${(pulse.newsSentiment * 100).toFixed(0)}%`,
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
