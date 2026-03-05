import { supabase, logAgentAction } from '../supabase';
import { RegimeState } from './RegimeOracle';
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
    private readonly genericNamePattern = /(momentum|intraday|trader|scalper|chaser|sniper|harvester|hunter|agent\s*\d*)/i;

    /**
     * Adapts the swarm based on instructions from the Orchestrator.
     */
    async adaptWithInstructions(regime: RegimeState, instructions: DynamicPersona[]) {
        const normalizedInstructions = this.normalizeInstructions(instructions, regime);
        const now = Date.now();
        const idealNames = normalizedInstructions.map(i => i.name);

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
        const currentNames = new Set(this.livingAgents.map(a => a.name.toLowerCase()));
        for (const instr of normalizedInstructions) {
            const key = instr.name.toLowerCase();
            if (!currentNames.has(key)) {
                await this.spawnAgent(instr, regime);
                currentNames.add(key);
            }
        }

        await logAgentAction(
            'PersonaManager',
            'info',
            `Team Roster Synced (${this.livingAgents.length} active)`,
            this.livingAgents.map(a => `${a.name} -> ${a.specialization || 'adaptive ops'}`).join(' | ')
        );
    }

    private normalizeInstructions(instructions: DynamicPersona[], regime: RegimeState): DynamicPersona[] {
        const uniqueByName = new Set<string>();
        const normalized: DynamicPersona[] = [];
        let idx = 0;

        for (const instr of instructions || []) {
            idx++;
            const proposedName = String(instr?.name || '')
                .replace(/\s+/g, ' ')
                .trim();
            const cleanedName = this.ensureAuthenticName(proposedName, regime, `${idx}-${instr?.task || ''}`);
            const cleanedTask = String(instr?.task || '')
                .replace(/\s+/g, ' ')
                .trim();
            const cleanedSpecialization = String(instr?.specialization || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!cleanedName || !cleanedTask) continue;
            const key = cleanedName.toLowerCase();
            if (uniqueByName.has(key)) continue;
            uniqueByName.add(key);

            normalized.push({
                name: cleanedName,
                task: cleanedTask,
                specialization: cleanedSpecialization || 'Adaptive market operations'
            });
        }

        return normalized;
    }

    private ensureAuthenticName(name: string, regime: RegimeState, seedInput: string): string {
        if (name && !this.genericNamePattern.test(name)) {
            return name;
        }

        const prefixesByRegime: Record<string, string[]> = {
            'high-vol-reversion': ['Vol', 'Gamma', 'Revert', 'Shock', 'Tail'],
            'low-vol-trend': ['Trend', 'Flow', 'Carry', 'Drift', 'Signal'],
            'quiet-accumulation': ['Base', 'Layer', 'Delta', 'Accum', 'Gradual'],
            'crisis-transition': ['Stress', 'Pivot', 'Break', 'Flux', 'Switch'],
            'commodity-supercycle': ['Macro', 'Curve', 'Basis', 'Barrel', 'Energy']
        };
        const suffixes = ['Atlas', 'Relay', 'Sentinel', 'Circuit', 'Forge', 'Protocol', 'Kernel', 'Vector'];
        const prefixes = prefixesByRegime[regime.regime_type] || prefixesByRegime['low-vol-trend'];
        const seed = this.hash(`${regime.regime_type}-${seedInput}-${Date.now()}`);
        const prefix = prefixes[seed % prefixes.length];
        const suffix = suffixes[(seed >> 3) % suffixes.length];
        return `${prefix} ${suffix} ${(seed % 10000).toString().padStart(4, '0')}`;
    }

    private hash(input: string): number {
        let h = 0;
        for (let i = 0; i < input.length; i++) {
            h = (h << 5) - h + input.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }

    private async spawnAgent(instr: DynamicPersona, regime: RegimeState) {
        // Lifespan is shorter for dynamic agents to keep swarm fresh
        const lifespanHours = 2 + Math.random() * 3;
        const msLifespan = Math.floor(lifespanHours * 60 * 60 * 1000);

        const agent: LivingAgent = {
            id: uuidv4(),
            name: instr.name,
            task: instr.task,
            specialization: instr.specialization || 'Adaptive market operations',
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
