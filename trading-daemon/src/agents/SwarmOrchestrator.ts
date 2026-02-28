import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { OmniScanner } from './OmniScanner';
import { DiscordDispatcher } from './DiscordDispatcher';
import { logAgentAction } from '../supabase';
import axios from 'axios';

import { TRADING_UNIVERSE, SECTORS } from '../universe';

const CORE_SYMBOLS = [...TRADING_UNIVERSE];

export class SwarmOrchestrator {
    /*
     * [x] **Phase 29: Massive Watchlist & Autonomous Discovery**
     *  - [x] Implement `Universe.ts` with 500+ symbols.
     *  - [x] Add `Deep Momentum Discovery` to `OmniScanner`.
     *  - [x] Rotate analyzed symbols in `SwarmOrchestrator`.
     */
    private scanner = new MarketScanner();
    private strategy = new StrategyEngine();
    private risk = new RiskController();
    private portfolio = new PortfolioStreamer();
    private omni = new OmniScanner();

    private watchlist: string[] = [];
    private currentSectorIndex = 0;
    private isRunning = false;
    private cycleCounter = 0;
    private discordInterval = 30;   // Discord brief every 30 minutes
    private executionInterval = 1;  // Execute signals every cycle (1m) — INSTANT TRADING
    private latestSentiment = 0.5;

    async start() {
        this.isRunning = true;

        // Initial setup - populate with a healthy mix
        await this.refreshWatchlist();

        const bootMsg = `ACE_OS Daemon Initialized | Universe: ${CORE_SYMBOLS.length} symbols | Focus: ${this.watchlist.length} hot stocks`;
        console.log(`🚀 ${bootMsg}`);

        await Promise.all([
            logAgentAction('Orchestrator', 'info', 'Daemon Massive Universe Online', bootMsg),
            this.portfolio.streamLiveData(),
            DiscordDispatcher.postUpdate(
                'ACE_OS — WIDE HORIZON ACTIVE',
                `**Status:** Monitoring 500+ Symbols\n**Current Focus:** ${this.watchlist.length} high-momentum stocks\n**Discovery Mode:** Sector Rotation Enabled`,
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

            // --- NEURAL PULSE: ADAPTIVE CYCLE DELAY ---
            const isMarketOpen = this.risk.isMarketOpen();
            const pulse = this.omni.getGlobalPulse();
            const urgency = Math.abs(pulse.newsSentiment - 0.5) + (pulse.weatherRisk > 0.3 ? 0.2 : 0);
            const cycleDelay = !isMarketOpen ? 120000 : (urgency > 0.3 ? 30000 : 60000);

            console.log(`Neural Pulse: Next thought in ${cycleDelay / 1000}s (Urgency: ${urgency.toFixed(2)})`);
            await new Promise(res => setTimeout(res, cycleDelay));
        }
    }

    async stop() {
        this.isRunning = false;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator stopped.');
    }

    private async refreshWatchlist() {
        try {
            // 1. Sector Rotation: Pick a different sector each time
            const sectorNames = Object.keys(SECTORS);
            const currentSector = sectorNames[this.currentSectorIndex % sectorNames.length];
            const sectorSymbols = SECTORS[currentSector] || [];
            this.currentSectorIndex++;

            // 2. Discover Gainers/Movers (Truly looking into all options)
            const { data } = await axios.get('https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=15', {
                headers: {
                    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
                    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
                }
            });

            const movers: string[] = [
                ...(data?.gainers?.map((s: any) => s.symbol) || []),
                ...(data?.losers?.map((s: any) => s.symbol) || []),
            ].filter(Boolean);

            // 3. Combine: Sector + Movers + a few staples = the 'Hot' List for this cycle
            const staples = ['AAPL', 'TSLA', 'NVDA', 'SPY'];
            this.watchlist = [...new Set([...staples, ...sectorSymbols, ...movers])].slice(0, 30);

            await logAgentAction('Orchestrator', 'discovery',
                `Autonomous Discovery: Focusing on ${currentSector} and ${movers.length} top market movers.`,
                `Analyzing: ${this.watchlist.join(', ')}`
            );
        } catch (e) {
            // Fallback to staples if API fails
            this.watchlist = TRADING_UNIVERSE.slice(0, 20);
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

        // 2. Fetch current active positions and open orders from Alpaca using verified wrapper
        // CRITICAL: We use the account's actual state to drive the Duplicate Guard
        const [positions, openOrders] = await Promise.all([
            this.alpacaWrapperGetPositions(),
            this.alpacaWrapperGetOrders()
        ]);

        if (positions === null || openOrders === null) {
            await logAgentAction('Orchestrator', 'error', 'Failed to synchronize with Alpaca. Skipping cycle to prevent duplicate risk.');
            return;
        }

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

    private async alpacaWrapperGetPositions() {
        try {
            const { alpaca } = await import('../alpaca');
            return await alpaca.getPositions();
        } catch {
            return null;
        }
    }

    private async alpacaWrapperGetOrders() {
        try {
            const { alpaca } = await import('../alpaca');
            return await alpaca.getOrders('open');
        } catch {
            return null;
        }
    }
}
