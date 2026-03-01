import { Client, GatewayIntentBits } from 'discord.js';
import { logAgentAction, supabase } from '../supabase';

const STRATEGY_KEYWORDS = new Set(['aggressive', 'balanced', 'conservative']);
const RISK_KEYWORDS = new Set(['minimal', 'cautious', 'standard']);
const TOGGLE_KEYWORDS = new Set(['pause', 'resume']);
const ALL_KEYWORDS = new Set([...STRATEGY_KEYWORDS, ...RISK_KEYWORDS, ...TOGGLE_KEYWORDS]);

const STRATEGY_MATRIX: Record<string, { minConviction: number; signalThreshold: number; buyThreshold: number; maxAllocationPct: number }> = {
    aggressive: { minConviction: 0.8, signalThreshold: 0.65, buyThreshold: 0.75, maxAllocationPct: 0.023 },
    balanced: { minConviction: 0.85, signalThreshold: 0.7, buyThreshold: 0.8, maxAllocationPct: 0.02 },
    conservative: { minConviction: 0.9, signalThreshold: 0.8, buyThreshold: 0.9, maxAllocationPct: 0.015 },
};
const RISK_MATRIX: Record<string, { lowRiskOnly: boolean; maxAllocationPct?: number; note: string }> = {
    minimal: { lowRiskOnly: true, maxAllocationPct: 0.01, note: 'Low‑risk ETF only' },
    standard: { lowRiskOnly: false, note: 'Standard universe' },
    cautious: { lowRiskOnly: false, note: 'Standard universe' },
};

function extractChannelId(input?: string) {
    if (!input) return null;
    const match = input.match(/\d{10,}/g);
    if (!match || match.length === 0) return input;
    return match[match.length - 1];
}

function parseKeywords(raw: string) {
    const tokens = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.trim());

    if (tokens.length === 0) return null;

    const keywords = Array.from(new Set(tokens.filter(t => ALL_KEYWORDS.has(t))));
    if (keywords.length === 0) return null;
    return keywords.slice(0, 2);
}

export async function startDiscordControl() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = extractChannelId(process.env.DISCORD_CONTROL_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID);
    if (!token || !channelId) {
        console.log('[DiscordControl] Disabled (missing DISCORD_BOT_TOKEN or DISCORD_CONTROL_CHANNEL_ID)');
        return;
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
    });

    client.once('ready', async () => {
        console.log(`[DiscordControl] Logged in as ${client.user?.tag}`);
        await logAgentAction('Orchestrator', 'info', 'Discord control online', `Listening for directives in channel ${channelId}`);
    });

    client.on('messageCreate', async (message) => {
        try {
            if (message.author.bot) return;
            if (message.channelId !== channelId) return;

            const keywords = parseKeywords(message.content || '');
            if (!keywords) return;

            const { data: state } = await supabase
                .from('agent_state')
                .select('config')
                .eq('agent_name', 'Orchestrator')
                .maybeSingle();

            const nextConfig: any = { ...(state?.config || {}) };

            for (const key of keywords) {
                if (STRATEGY_KEYWORDS.has(key)) nextConfig.strategy_bias = key;
                if (RISK_KEYWORDS.has(key)) nextConfig.risk_profile = key === 'cautious' ? 'minimal' : key;
                if (TOGGLE_KEYWORDS.has(key)) nextConfig.trading_enabled = key !== 'pause';
            }

            nextConfig.discord_directive = {
                keywords,
                author: message.author.username,
                at: new Date().toISOString(),
            };

            const strategyKey = String(nextConfig.strategy_bias || 'balanced');
            const riskKey = String(nextConfig.risk_profile || 'standard');
            const strategy = STRATEGY_MATRIX[strategyKey] || STRATEGY_MATRIX.balanced;
            const risk = RISK_MATRIX[riskKey] || RISK_MATRIX.standard;
            const effectiveAllocation = risk.maxAllocationPct ?? strategy.maxAllocationPct;
            const summary = `Strategy: ${strategyKey} | Risk: ${riskKey} | Trading: ${nextConfig.trading_enabled === false ? 'paused' : 'enabled'}`;
            const detailLines = [
                `• Min conviction: ${(strategy.minConviction * 100).toFixed(0)}%`,
                `• Signal threshold: ${strategy.signalThreshold.toFixed(2)} | Buy threshold: ${strategy.buyThreshold.toFixed(2)}`,
                `• Max allocation: ${(effectiveAllocation * 100).toFixed(2)}% equity`,
                `• Mode: ${risk.note}${risk.lowRiskOnly ? ' (ETF only)' : ''}`,
            ].join('\n');
            const { error } = await supabase
                .from('agent_state')
                .update({ config: nextConfig, updated_at: new Date().toISOString() })
                .eq('agent_name', 'Orchestrator');

            if (error) {
                await message.reply('Directive failed to apply.');
                return;
            }

            await logAgentAction(
                'Orchestrator',
                'learning',
                'Discord directive applied',
                `Keywords: ${keywords.join(', ')} | ${summary}`
            );

            await message.reply(`Directive applied: ${keywords.join(' ')}.\n${summary}\n${detailLines}`);
        } catch (e) {
            console.error('[DiscordControl] Failed to process directive:', e);
        }
    });

    await client.login(token);
}
