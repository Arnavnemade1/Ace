import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { OmniScanner } from './OmniScanner';
import { DiscordDispatcher } from './DiscordDispatcher';
import { logAgentAction } from '../supabase';

export class SwarmOrchestrator {
    private scanner = new MarketScanner();
    private strategy = new StrategyEngine();
    private risk = new RiskController();
    private portfolio = new PortfolioStreamer();
    private omni = new OmniScanner();

    private symbolsToMonitor = ['AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ', 'NVDA', 'BTCUSD', 'ETHUSD'];
    private isRunning = false;
    private executionEpochCounter = 0;
    private executionThreshold = 30; // 30 minutes (60s * 30)

    async start() {
        this.isRunning = true;
        await logAgentAction('Orchestrator', 'info', `Swarm Orchestrator Started. Monitoring 24/7. Execution Horizon: ${this.executionThreshold} mins.`);

        while (this.isRunning) {
            try {
                this.executionEpochCounter++;
                await this.runCycle();
            } catch (err: any) {
                console.error('Cycle Error:', err);
                await logAgentAction('Orchestrator', 'error', `Cycle Failed: ${err.message}`);
            }

            // Wait for next cycle
            console.log('⏳ Cycle complete. Waiting 60 seconds before next heartbeat...');
            await new Promise(res => setTimeout(res, 60000));
        }
    }

    async stop() {
        this.isRunning = false;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator Stopped.');
    }

    private async runCycle() {
        console.log(`\n--- [${new Date().toISOString()}] Starting Swarm Cycle (Epoch: ${this.executionEpochCounter}/${this.executionThreshold}) ---`);

        // 0. Stream Live Portfolio Info
        await this.portfolio.streamLiveData();

        // 1. Gather Intelligence via OMNI (Every 60s)
        await this.omni.scanAll(this.symbolsToMonitor);

        // Ensure legacy logic has some data to run (mocking standard format)
        const macroIntel = { newsSentiment: 0.5, weatherRisk: 0.2 };
        const marketData = [{ symbol: 'SPY', currentPrice: 505.20 }];

        // 2. Evaluate Strategy (Every 60s)
        const signals = await this.strategy.evaluate(marketData, macroIntel);

        // 3. Risk Control & Execution (Only every 30-60 mins based on threshold)
        if (signals.length > 0) {
            if (this.executionEpochCounter >= this.executionThreshold) {
                await logAgentAction('Risk Controller', 'decision', `Execution Horizon Reached (${this.executionThreshold} mins). Sending ${signals.length} signals to Alpha execution.`);
                await this.risk.executeSignals(signals);
                this.executionEpochCounter = 0; // Reset after execution
            } else {
                await logAgentAction('Risk Controller', 'info', `Signals generated but delaying execution. Awaiting horizon confirmation (${this.executionThreshold - this.executionEpochCounter}m remaining).`);
            }
        } else {
            await logAgentAction('Risk Controller', 'info', `No actionable signals this cycle. Monitoring continues.`, JSON.stringify(marketData));
        }

        // --- DISCORD HEARTBEAT ---
        await DiscordDispatcher.postUpdate(
            `🧠 ACE_OS Cycle Complete [Epoch ${this.executionEpochCounter}/${this.executionThreshold}]`,
            `**Active Monitoring:** ${this.symbolsToMonitor.join(', ')}\n**Actionable Signals Found:** ${signals.length}\n**Status:** ${signals.length > 0 && this.executionEpochCounter < this.executionThreshold ? "AWAITING HORIZON (Span Penalty Active)" : "NOMINAL"}`,
            3447003
        );

        console.log(`--- Cycle Complete ---`);
    }
}
