import { Client, GatewayIntentBits } from 'discord.js';
import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const MIN_BUYING_POWER = 100;

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

async function getMarketClock() {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY;
    if (!key || !secret) return null;
    try {
        const res = await fetch(`${ALPACA_PAPER_URL}/v2/clock`, {
            headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function getSnapshot(symbol: string) {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY;
    if (!key || !secret) return null;
    try {
        const res = await fetch(`${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbol}`, {
            headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.[symbol] || null;
    } catch {
        return null;
    }
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

            const raw = (message.content || '').trim();
            const parts = raw.split(/\s+/);
            const cmd = (parts[0] || '').toLowerCase();

            if (cmd === 'buy' || cmd === 'sell') {
                const symbol = (parts[1] || '').toUpperCase();
                const qty = Math.max(1, parseInt(parts[2] || '1', 10));
                if (!symbol || !/^[A-Z.\-]{1,10}$/.test(symbol)) {
                    await message.reply('Usage: `buy SYMBOL QTY` or `sell SYMBOL QTY`');
                    return;
                }

                const account = await alpaca.getAccount();
                const buyingPower = parseFloat(account?.buying_power || '0');
                if (!Number.isFinite(buyingPower) || buyingPower < MIN_BUYING_POWER) {
                    await message.reply(`Insufficient buying power ($${buyingPower.toFixed(2)}).`);
                    return;
                }

                const clock = await getMarketClock();
                const marketOpen = clock?.is_open ?? false;
                let limitPrice: number | null = null;
                if (!marketOpen) {
                    const snap = await getSnapshot(symbol);
                    const bid = snap?.latestQuote?.bp;
                    const ask = snap?.latestQuote?.ap;
                    const last = snap?.latestTrade?.p;
                    const ref = cmd === 'buy' ? (ask || last || bid) : (bid || last || ask);
                    if (!ref) {
                        await message.reply(`Unable to price ${symbol}. Try again later or use a different symbol.`);
                        return;
                    }
                    limitPrice = cmd === 'buy' ? Number((ref * 1.001).toFixed(2)) : Number((ref * 0.999).toFixed(2));
                }

                const orderParams: any = {
                    symbol,
                    qty,
                    side: cmd,
                    type: marketOpen ? 'market' : 'limit',
                    time_in_force: marketOpen ? 'day' : 'gtc',
                };
                if (!marketOpen && limitPrice) orderParams.limit_price = limitPrice;

                const order = await alpaca.createOrder(orderParams);

                await supabase.from('trades').insert({
                    symbol,
                    side: cmd.toUpperCase(),
                    qty,
                    price: limitPrice || 0,
                    total_value: (limitPrice || 0) * qty,
                    agent: 'Order Agent',
                    strategy: 'Discord Manual',
                    reasoning: `User command: ${raw}`,
                    status: 'pending',
                    alpaca_order_id: order.id,
                });

                await logAgentAction(
                    'Order Agent',
                    'trade',
                    `USER ${cmd.toUpperCase()} ${qty} ${symbol}`,
                    `Order ${order.id} | ${marketOpen ? 'MARKET' : `LIMIT $${limitPrice}`}`
                );

                await message.reply(
                    `Order submitted: ${cmd.toUpperCase()} ${qty} ${symbol} (${marketOpen ? 'MARKET' : `LIMIT $${limitPrice}`}).\nOrder ID: ${order.id}`
                );
                return;
            }

            if (cmd === 'status') {
                const account = await alpaca.getAccount();
                const positions = await alpaca.getPositions();
                const orders = await alpaca.getOrders('open');
                await message.reply(
                    `Account: Equity $${parseFloat(account.equity).toFixed(2)} | Cash $${parseFloat(account.cash).toFixed(2)} | BP $${parseFloat(account.buying_power).toFixed(2)}\nOpen Positions: ${positions.length} | Open Orders: ${orders.length}`
                );
                return;
            }

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
