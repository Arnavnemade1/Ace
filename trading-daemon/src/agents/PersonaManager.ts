import { supabase, logAgentAction } from '../supabase';
import { RegimeState, MarketRegimeType } from './RegimeOracle';
import { v4 as uuidv4 } from 'uuid';
import { DiscordDispatcher } from './DiscordDispatcher';

export type PersonaType =
    | 'MomentumChaser'
    | 'ContrarianValue'
    | 'TransitionScout'
    | 'CommoditySniper'
    | 'VolatilityHarvester';

export interface LivingAgent {
    id: string;
    persona: PersonaType;
    regimeAffinity: MarketRegimeType;
    spawnTime: number;
    estimatedLifespanMs: number;
    birthReason: string;
    specialization?: string;
}

const PERSONA_SPECIALIZATIONS: Record<PersonaType, string[]> = {
    'MomentumChaser': ['EMA Cross', 'Volume Spike', 'RSI Breakout', 'Trend Follower'],
    'ContrarianValue': ['Mean Reversion', 'Oversold Dip', 'Institutional Support', 'Gap Fill'],
    'TransitionScout': ['Vol Expansion', 'Regime Shift', 'Neural Anomaly', 'Skew Rotation'],
    'CommoditySniper': ['Oil-Equities', 'Gold Arb', 'Geopolitics', 'Spread Capture'],
    'VolatilityHarvester': ['VIX Decay', 'Iron Condor', 'Theta Burn', 'Vol Crushing']
};

export class PersonaManager {
    private livingAgents: LivingAgent[] = [];

    // Config: Which agents thrive in which regimes?
    private readonly regimeAffinities: Record<MarketRegimeType, PersonaType[]> = {
        'high-vol-reversion': ['ContrarianValue', 'VolatilityHarvester'],
        'low-vol-trend': ['MomentumChaser'],
        'quiet-accumulation': ['ContrarianValue', 'MomentumChaser'],
        'crisis-transition': ['TransitionScout', 'VolatilityHarvester'],
        'commodity-supercycle': ['CommoditySniper', 'MomentumChaser']
    };

    /**
     * Checks the current regime and spawns/kills agents accordingly.
     */
    async adaptToRegime(regime: RegimeState) {
        const now = Date.now();
        const idealPersonas = this.regimeAffinities[regime.regime_type] || ['MomentumChaser'];

        // 1. Natural Aging (Kill agents whose lifespan expired)
        const survivors: LivingAgent[] = [];
        for (const agent of this.livingAgents) {
            const age = now - agent.spawnTime;

            // 2. Regime Mismatch Death (Immediate termination if regime shifts aggressively)
            // Transition Scouts die off incredibly fast when transition ends
            const isAffinityMismatch = !idealPersonas.includes(agent.persona);
            let deathReason: string | null = null;

            if (age > agent.estimatedLifespanMs) {
                deathReason = 'Natural Expiration (TTL Reached)';
            } else if (isAffinityMismatch && regime.confidence > 0.75) {
                deathReason = `Regime Mismatch (Fatal shift to ${regime.regime_type})`;
            } else if (agent.persona === 'TransitionScout' && regime.regime_type !== 'crisis-transition') {
                deathReason = 'Scout Mission Complete';
            }

            if (deathReason) {
                await this.killAgent(agent, deathReason);
            } else {
                survivors.push(agent);
            }
        }

        this.livingAgents = survivors;

        // 3. Spawning (Birth new agents to fill the optimal crew)
        // Aim for a crew of 3-5 specialized agents
        const currentPersonas = this.livingAgents.map(a => a.persona);

        for (const ideal of idealPersonas) {
            // Count how many of this type we have
            const count = currentPersonas.filter(p => p === ideal).length;

            // Spawn if we need more
            if (count < 2) {
                await this.spawnAgent(ideal, regime);
            }
        }
    }

    private async spawnAgent(persona: PersonaType, regime: RegimeState) {
        // Base lifespan is ~4 to 8 hours
        let lifespanHours = 4 + Math.random() * 4;

        // Modifiers based on persona & regime
        if (persona === 'TransitionScout') lifespanHours = 1 + Math.random(); // Scouts die fast
        if (persona === 'ContrarianValue') lifespanHours *= 1.5; // Value takes time to pan out

        // High volatility reduces lifespan across the board (stress)
        if (regime.macro_factors.spy_volatililty > 0.25) lifespanHours *= 0.7;

        const msLifespan = Math.floor(lifespanHours * 60 * 60 * 1000);
        const specs = PERSONA_SPECIALIZATIONS[persona];
        const specialization = specs[Math.floor(Math.random() * specs.length)];

        const agent: LivingAgent = {
            id: uuidv4(),
            persona,
            regimeAffinity: regime.regime_type,
            spawnTime: Date.now(),
            estimatedLifespanMs: msLifespan,
            specialization,
            birthReason: `Spawned due to dominant ${regime.regime_type} regime (Focus: ${specialization}, Confidence: ${(regime.confidence * 100).toFixed(0)}%)`
        };

        this.livingAgents.push(agent);

        await logAgentAction('PersonaManager', 'decision', `🐣 Spawned Agent: ${persona}`, agent.birthReason);

        // Notify Discord
        await DiscordDispatcher.postOracleLifecycle('SPAWN', persona, agent.birthReason, regime.regime_type);

        // Record birth in DB
        await supabase.from('agent_lifecycles').insert({
            id: agent.id,
            persona: agent.persona,
            status: 'born', // Will transition to active
            regime_affinity: agent.regimeAffinity,
            spawn_time: new Date(agent.spawnTime).toISOString(),
            estimated_lifespan_ms: agent.estimatedLifespanMs,
            specialization: agent.specialization // Logic will handle if column exists
        });

        // Immediately set to active
        await supabase.from('agent_lifecycles')
            .update({ status: 'active' })
            .eq('id', agent.id);
    }

    private async killAgent(agent: LivingAgent, reason: string) {
        await logAgentAction('PersonaManager', 'decision', `💀 Retired Agent: ${agent.persona}`, reason);

        // Notify Discord
        await DiscordDispatcher.postOracleLifecycle('KILL', agent.persona, reason, agent.regimeAffinity);

        // Record death in DB
        await supabase.from('agent_lifecycles')
            .update({
                status: 'retired',
                death_time: new Date().toISOString(),
                death_reason: reason
            })
            .eq('id', agent.id);
    }

    getActiveAgents(): LivingAgent[] {
        return this.livingAgents;
    }
}
