import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { OmniScanner } from './OmniScanner';
import { DiscordDispatcher } from './DiscordDispatcher';
import { logAgentAction } from '../supabase';
import { alpaca } from '../alpaca';
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
    private discordInterval = 30;   // Discord brief interval in minutes
    private executionInterval = 6;  // Execute signals every 6 cycles (cooldown)
    private latestSentiment = 0.5;

    // timestamp of last discord post (ms)
    private lastDiscordTs = 0;

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
            const pulse = this.omni.getGlobalPulse();
            const urgency = Math.abs(pulse.newsSentiment - 0.5) + (pulse.weatherRisk > 0.3 ? 0.2 : 0);
            const cycleDelay = !this.risk.isMarketOpen() ? 120000 : (urgency > 0.3 ? 30000 : 60000);

            console.log(`Neural Pulse: Next thought in ${cycleDelay / 1000}s (Urgency: ${urgency.toFixed(2)})`);

            // Quiet wait between cycles (no heartbeat spam)
            if (!this.isRunning) break;
            await new Promise(res => setTimeout(res, cycleDelay));
        }
    }

    async stop() {
        this.isRunning = false;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator stopped.');
    }

    private async refreshWatchlist() {
        try {
            // [x] Phase 32: Deep Discovery Overhaul
            // Stop relying on static movers; sample from the entire 500+ symbol universe
            const allSymbols = [...TRADING_UNIVERSE];

            // 1. Sector Shuffle: Pick a random sector for deep focus
            const sectorNames = Object.keys(SECTORS);
            const currentSector = sectorNames[Math.floor(Math.random() * sectorNames.length)];
            const sectorSymbols = SECTORS[currentSector] || [];

            // 2. Random Sampling Discovery: Pick 40 symbols randomly from the entire universe
            const discoveryPool = allSymbols
                .filter(s => !sectorSymbols.includes(s))
                .sort(() => 0.5 - Math.random())
                .slice(0, 40);

            // 3. Combine: Sector (7) + Random Discovery (40) + Dynamic Movers (Optional)
            // We use the Movers API only as an additional hint, not the primary source
            let movers: string[] = [];
            try {
                const { data } = await axios.get('https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=10', {
                    headers: {
                        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
                        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
                    },
                    timeout: 2000
                });
                movers = [
                    ...(data?.gainers?.map((s: any) => s.symbol) || []),
                    ...(data?.losers?.map((s: any) => s.symbol) || []),
                ].filter(Boolean);
            } catch (e) {
                console.log('[Orchestrator] Movers API unreachable, skipping...');
            }

            // 4. Final Watchlist: Filter out any duplicates and limit to 50
            this.watchlist = [...new Set([...sectorSymbols, ...discoveryPool, ...movers])].slice(0, 50);

            await logAgentAction('Orchestrator', 'info',
                `Deep Discovery Active: Analyzing 50 diverse symbols. Focus: ${currentSector}.`,
                `Watchlist Sample: ${this.watchlist.slice(0, 10).join(', ')}...`
            );
        } catch (e: any) {
            console.error('[Orchestrator] Refresh failed:', e.message);
            this.watchlist = TRADING_UNIVERSE.slice(0, 30);
        }
    }

    private async runCycle() {
        const marketOpen = this.risk.isMarketOpen();
        const nowET = new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            hour12: true, hour: '2-digit', minute: '2-digit'
        });
        console.log(`\n--- Cycle #${this.cycleCounter} | Market: ${marketOpen ? 'OPEN' : 'CLOSED'} | ${this.watchlist.length} symbols | ${new Date().toISOString()} ---`);

        // 1. Refresh watchlist & Fetch ACTUAL Account/Portfolio state (Phase 31)
        if (this.cycleCounter % 5 === 1) await this.refreshWatchlist(); // More frequent refresh (every 5 cycles instead of 10)
        await this.portfolio.streamLiveData();

        const [account, positions, openOrders] = await Promise.all([
            alpaca.getAccount(),
            alpaca.getPositions(),
            alpaca.getOrders()
        ]);

        if (!account || positions === null || openOrders === null) {
            await logAgentAction('Orchestrator', 'error', 'Failed to synchronize with Alpaca. Skipping cycle safely.');
            return;
        }

        const activeSymbols = new Set([
            ...positions.map((p: any) => p.symbol),
            ...openOrders.map((o: any) => o.symbol)
        ]);

        // 3. OmniScanner — scan all watchlist symbols and synthesize Global Pulse
        this.omni.reset(); // [x] Phase 32: Reset results for new cycle
        await logAgentAction('Market Scanner', 'info', `Scanning ${this.watchlist.length} Diverse Symbols (Deep Discovery)...`);
        const BATCH = 10;
        for (let i = 0; i < this.watchlist.length; i += BATCH) {
            await this.omni.scanAll(this.watchlist.slice(i, i + BATCH));
        }
        const pulse = this.omni.getGlobalPulse();
        await logAgentAction('Orchestrator', 'info', 'Market Pulse Synthesized', pulse.macroSummary);

        // 4. Strategy evaluation with full Market Pulse and Position Awareness
        await logAgentAction('Strategy Engine', 'info', 'Neural Strategy Synthesis in Progress...');
        const signals = await this.strategy.evaluate(this.watchlist, pulse, activeSymbols, account, positions);
        const shortlist = [...signals].sort((a, b) => b.strength - a.strength).slice(0, 8);
        if (shortlist.length > 0) {
            await logAgentAction(
                'Strategy Engine',
                'learning',
                'Shortlist candidates',
                shortlist
                    .map(s => `${s.symbol} ${s.signal_type} (${s.strength.toFixed(2)}) — ${s.reasoning || s.metadata?.news_context || 'signal strength/technical setup'}`)
                    .join(' | ')
            );
        } else {
            await logAgentAction('Strategy Engine', 'learning', 'Shortlist candidates', 'No candidates met the quality threshold this cycle.');
        }

        // 5. Execute top signals with Dynamic Risk Guardrails (Phase 31)
        let executionResult: any = null;
        if (this.cycleCounter % this.executionInterval === 0 && signals.length > 0) {
            const topSignals = signals.sort((a, b) => b.strength - a.strength).slice(0, 1);
            await logAgentAction('Risk Controller', 'decision',
                `Execution window reached. Pulse: ${pulse.newsSentiment.toFixed(2)} | Active Positions: ${activeSymbols.size}`
            );
            // Pass account to risk controller
            executionResult = await this.risk.executeSignals(topSignals, marketOpen, account, positions, openOrders);
        } else if (signals.length > 0) {
            const remaining = this.executionInterval - (this.cycleCounter % this.executionInterval);
            await logAgentAction('Risk Controller', 'info',
                `${signals.length} signals pending. Market Consensus: ${pulse.macroSummary}. Next execution in ${remaining}m.`
            );
        } else {
            await logAgentAction('Risk Controller', 'info', `No actionable signals. Global Sentiment: ${pulse.newsSentiment.toFixed(2)}.`);
        }

        // 6. Discord brief at real‑time intervals (minutes)
        const nowTs = Date.now();
        if (!this.lastDiscordTs || nowTs - this.lastDiscordTs >= this.discordInterval * 60 * 1000) {
            await this.postDiscordBrief(signals, executionResult, marketOpen, nowET, pulse);
            this.lastDiscordTs = nowTs;
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
