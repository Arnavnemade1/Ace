import { MarketScanner } from './MarketScanner';
import { StrategyEngine } from './StrategyEngine';
import { RiskController } from './RiskController';
import { PortfolioStreamer } from './PortfolioStreamer';
import { logAgentAction } from '../supabase';

export class SwarmOrchestrator {
    private scanner = new MarketScanner();
    private strategy = new StrategyEngine();
    private risk = new RiskController();
    private portfolio = new PortfolioStreamer();

    private symbolsToMonitor = ['AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ', 'NVDA', 'BTCUSD', 'ETHUSD'];
    private isRunning = false;

    async start() {
        this.isRunning = true;
        await logAgentAction('Orchestrator', 'info', 'Swarm Orchestrator Started. Beginning 24/7 autonomous loop.');

        while (this.isRunning) {
            try {
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
        console.log(`\n--- [${new Date().toISOString()}] Starting Swarm Cycle ---`);

        // 0. Stream Live Portfolio Info
        await this.portfolio.streamLiveData();

        // 1. Gather Intelligence
        const macroIntel = await this.scanner.fetchMacroIntel();
        const marketData = await this.scanner.scanEquities(this.symbolsToMonitor);

        // 2. Evaluate Strategy
        const signals = await this.strategy.evaluate(marketData, macroIntel);

        // 3. Risk Control & Execution
        if (signals.length > 0) {
            await this.risk.executeSignals(signals);
        } else {
            await logAgentAction('Risk Controller', 'info', 'No actionable signals this cycle.', JSON.stringify(marketData));
        }

        console.log(`--- Cycle Complete ---`);
    }
}
