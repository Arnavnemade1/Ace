import dotenv from 'dotenv';
dotenv.config();
import { checkSupabaseConnection, logAgentAction } from './supabase';
import { alpaca } from './alpaca';
import { SwarmOrchestrator } from './agents/SwarmOrchestrator';
import { CausalReplayArena } from './agents/CausalReplayArena';
import { startDiscordControl } from './discord/DiscordControl';

async function main() {
    console.log('🚀 Starting Autonomous Trading Daemon...');
    const supabaseCheck = await checkSupabaseConnection();
    if (!supabaseCheck.ok) {
        console.error(`❌ Supabase connection failed: ${supabaseCheck.error}`);
    } else {
        console.log('✅ Supabase connection OK');
    }

    await logAgentAction('Orchestrator', 'info', 'Daemon Booted', 'System initialized properly.');

    // Validate Alpaca connection
    try {
        const account = await alpaca.getAccount();
        console.log(`🏦 Alpaca Paper Account connected. Buying Power: $${account.buying_power}, Portfolio: $${account.portfolio_value}`);
        await logAgentAction('Orchestrator', 'info', `Alpaca Connected: $${account.portfolio_value}`);
    } catch (error) {
        console.error('❌ Failed to connect to Alpaca', error);
        throw error; // Let the boot loop handle the restart
    }

    // Start the Swarm Orchestrator loop
    const orchestrator = new SwarmOrchestrator();
    orchestrator.start();

    // Discord keyword control (aggressive/minimal/pause/etc)
    startDiscordControl().catch((err) => console.error('Discord control failed:', err));

    // Setup Nightly Causal Replay Arena (Mocked as interval for demo purposes: runs every 5 minutes in demo)
    const arena = new CausalReplayArena();
    setInterval(() => {
        console.log(`\n🌙 [${new Date().toISOString()}] Triggering Nightly Causal Replay Arena...`);
        arena.runNightlyReplay().catch(console.error);
    }, 300000); // 5 minutes
}

async function boot() {
    try {
        await main();
    } catch (err) {
        console.error('⚠️ [CRASH] Daemon encountered a fatal error:', err);
        console.log('🔄 Restarting brain in 10s...');
        setTimeout(boot, 10000);
    }
}

boot();
