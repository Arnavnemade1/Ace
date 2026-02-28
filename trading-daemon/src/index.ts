import dotenv from 'dotenv';
dotenv.config();
import { logAgentAction } from './supabase';
import { alpaca } from './alpaca';
import { SwarmOrchestrator } from './agents/SwarmOrchestrator';
import { CausalReplayArena } from './agents/CausalReplayArena';

async function main() {
    console.log('🚀 Starting Autonomous Trading Daemon...');
    await logAgentAction('Orchestrator', 'info', 'Daemon Booted', 'System initialized properly.');

    // Validate Alpaca connection
    try {
        const account = await alpaca.getAccount();
        console.log(`🏦 Alpaca Paper Account connected. Buying Power: $${account.buying_power}, Portfolio: $${account.portfolio_value}`);
        await logAgentAction('Orchestrator', 'info', `Alpaca Connected: $${account.portfolio_value}`);
    } catch (error) {
        console.error('❌ Failed to connect to Alpaca', error);
        process.exit(1);
    }

    // Start the Swarm Orchestrator loop
    const orchestrator = new SwarmOrchestrator();

    // Wait before starting the loop so the boot logs register
    setTimeout(() => {
        orchestrator.start();
    }, 1000);

    // Setup Nightly Causal Replay Arena (Mocked as interval for demo purposes: runs every 5 minutes in demo)
    const arena = new CausalReplayArena();
    setInterval(() => {
        console.log(`\n🌙 [${new Date().toISOString()}] Triggering Nightly Causal Replay Arena...`);
        arena.runNightlyReplay().catch(console.error);
    }, 300000); // 5 minutes
}

main().catch(err => {
    console.error('Fatal initialization error:', err);
});
