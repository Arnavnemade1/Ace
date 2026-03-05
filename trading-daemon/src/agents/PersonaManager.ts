import { supabase, logAgentAction } from '../supabase';
import { RegimeState, MarketRegimeType } from './RegimeOracle';
import { v4 as uuidv4 } from 'uuid';
import { DiscordDispatcher } from './DiscordDispatcher';

export interface LivingAgent {
    id: string;
    name: string;
    task: string;
    regimeAffinity: string;
    spawnTime: number;
    estimatedLifespanMs: number;
    birthReason: string;
    specialization?: string;
}

export interface DynamicPersona {
    name: string;
    task: string;
    specialization: string;
}

export class PersonaManager {
    private livingAgents: LivingAgent[] = [];

    /**
     * Adapts the swarm based on instructions from the Orchestrator.
     */
    async adaptWithInstructions(regime: RegimeState, instructions: DynamicPersona[]) {
        const now = Date.now();
        const idealNames = instructions.map(i => i.name);

        // 1. Natural Aging & Mismatch Death
        const survivors: LivingAgent[] = [];
        for (const agent of this.livingAgents) {
            const age = now - agent.spawnTime;
            const isNoLongerIdeal = !idealNames.includes(agent.name);
            let deathReason: string | null = null;

            if (age > agent.estimatedLifespanMs) {
                deathReason = 'Natural Expiration (TTL Reached)';
            } else if (isNoLongerIdeal && regime.confidence > 0.8) {
                deathReason = `Orchestrator Swap (Phase out for dynamic shift)`;
            }

            if (deathReason) {
                await this.killAgent(agent, deathReason);
            } else {
                survivors.push(agent);
            }
        }

        this.livingAgents = survivors;

        // 2. Spawning new instructions
        const currentNames = this.livingAgents.map(a => a.name);
        for (const instr of instructions) {
            if (!currentNames.includes(instr.name)) {
                await this.spawnAgent(instr, regime);
            }
        }
    }

    private async spawnAgent(instr: DynamicPersona, regime: RegimeState) {
        // Lifespan is shorter for dynamic agents to keep swarm fresh
        const lifespanHours = 2 + Math.random() * 3;
        const msLifespan = Math.floor(lifespanHours * 60 * 60 * 1000);

        const agent: LivingAgent = {
            id: uuidv4(),
            name: instr.name,
            task: instr.task,
            specialization: instr.specialization,
            regimeAffinity: regime.regime_type,
            spawnTime: Date.now(),
            estimatedLifespanMs: msLifespan,
            birthReason: `Orchestrated Mission: ${instr.task}`
        };

        this.livingAgents.push(agent);

        await logAgentAction('PersonaManager', 'decision', `🐣 Spawned Agent: ${agent.name}`, agent.birthReason);

        // Notify Discord
        await DiscordDispatcher.postOracleLifecycle('SPAWN', agent.name as any, agent.birthReason, regime.regime_type);

        // Record birth in DB
        await supabase.from('agent_lifecycles').insert({
            id: agent.id,
            persona: agent.name, // using persona column for dynamic name
            status: 'born',
            regime_affinity: agent.regimeAffinity,
            spawn_time: new Date(agent.spawnTime).toISOString(),
            estimated_lifespan_ms: agent.estimatedLifespanMs,
            specialization: agent.specialization,
            task: agent.task // Ensuring task is logged
        });

        // Immediately set to active
        await supabase.from('agent_lifecycles')
            .update({ status: 'active' })
            .eq('id', agent.id);
    }

    private async killAgent(agent: LivingAgent, reason: string) {
        await logAgentAction('PersonaManager', 'decision', `💀 Retired Agent: ${agent.name}`, reason);

        // Notify Discord
        await DiscordDispatcher.postOracleLifecycle('KILL', agent.name as any, reason, agent.regimeAffinity as any);

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
