import { Client, GatewayIntentBits } from 'discord.js';
import { logAgentAction, supabase } from '../supabase';

const STRATEGY_KEYWORDS = new Set(['aggressive', 'balanced', 'conservative']);
const RISK_KEYWORDS = new Set(['minimal', 'cautious', 'standard']);
const TOGGLE_KEYWORDS = new Set(['pause', 'resume']);
const ALL_KEYWORDS = new Set([...STRATEGY_KEYWORDS, ...RISK_KEYWORDS, ...TOGGLE_KEYWORDS]);

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

            const summary = `Strategy: ${nextConfig.strategy_bias || 'balanced'} | Risk: ${nextConfig.risk_profile || 'standard'} | Trading: ${nextConfig.trading_enabled === false ? 'paused' : 'enabled'}`;
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

            await message.reply(`Directive applied: ${keywords.join(' ')}. ${summary}`);
        } catch (e) {
            console.error('[DiscordControl] Failed to process directive:', e);
        }
    });

    await client.login(token);
}
