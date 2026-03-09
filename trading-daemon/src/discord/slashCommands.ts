import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    REST,
    Routes,
    EmbedBuilder,
} from 'discord.js';
import { alpaca } from '../alpaca';
import { supabase, logAgentAction } from '../supabase';
import { TRADING_UNIVERSE, SECTORS } from '../universe';
import { orderStatusEmbed, tradeApprovalRow, tradeProposalEmbed } from './components';
import { trackOrderMessage } from './liveTracker';

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

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
    } catch { return null; }
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
    } catch { return null; }
}

// ── Command definitions ──
export const commands = [
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('📊 Show account status, positions, and open orders'),

    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('📈 Submit a buy order')
        .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('sell')
        .setDescription('📉 Submit a sell order')
        .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('regime')
        .setDescription('🌐 Show current market regime and confidence'),

    new SlashCommandBuilder()
        .setName('portfolio')
        .setDescription('💼 Show full portfolio breakdown'),

    new SlashCommandBuilder()
        .setName('agents')
        .setDescription('🤖 Show active AI agent statuses'),

    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('💬 Ask the ACE_OS AI about market state or system info')
        .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
];

// ── Register slash commands with Discord ──
export async function registerSlashCommands(clientId: string) {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return;

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('[SlashCommands] Registering...');
        await rest.put(Routes.applicationCommands(clientId), {
            body: commands.map(c => c.toJSON()),
        });
        console.log('[SlashCommands] ✅ Registered successfully');
    } catch (e) {
        console.error('[SlashCommands] Failed to register:', e);
    }
}

// ── Autocomplete handler ──
export async function handleAutocomplete(interaction: any) {
    const focused = interaction.options.getFocused().toUpperCase();
    const filtered = TRADING_UNIVERSE
        .filter(s => s.startsWith(focused) && !s.includes('/'))
        .slice(0, 25)
        .map(s => ({ name: s, value: s }));
    await interaction.respond(filtered);
}

// ── Command handlers ──
export async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const cmd = interaction.commandName;

    try {
        if (cmd === 'status') {
            await interaction.deferReply();
            const account = await alpaca.getAccount();
            const positions = await alpaca.getPositions();
            const orders = await alpaca.getOrders('open');

            const embed = new EmbedBuilder()
                .setTitle('📊 ACE_OS — Account Status')
                .setColor(0x3498DB)
                .addFields(
                    { name: 'Equity', value: `$${parseFloat(account.equity).toLocaleString()}`, inline: true },
                    { name: 'Cash', value: `$${parseFloat(account.cash).toLocaleString()}`, inline: true },
                    { name: 'Buying Power', value: `$${parseFloat(account.buying_power).toLocaleString()}`, inline: true },
                    { name: 'Positions', value: `${positions.length}`, inline: true },
                    { name: 'Open Orders', value: `${orders.length}`, inline: true },
                )
                .setTimestamp()
                .setFooter({ text: 'ACE_OS — Alpaca Paper' });

            if (positions.length > 0) {
                const posText = positions.slice(0, 10).map((p: any) =>
                    `\`${p.symbol}\` ${parseFloat(p.qty)}x @ $${parseFloat(p.avg_entry_price).toFixed(2)} (${parseFloat(p.unrealized_plpc) >= 0 ? '🟢' : '🔴'} ${(parseFloat(p.unrealized_plpc) * 100).toFixed(1)}%)`
                ).join('\n');
                embed.addFields({ name: 'Top Positions', value: posText });
            }

            await interaction.editReply({ embeds: [embed] });
        }

        else if (cmd === 'buy' || cmd === 'sell') {
            await interaction.deferReply();
            const symbol = interaction.options.getString('symbol', true).toUpperCase();
            const qty = interaction.options.getInteger('qty', true);

            const account = await alpaca.getAccount();
            const bp = parseFloat(account?.buying_power || '0');
            if (bp < 100) {
                await interaction.editReply(`Insufficient buying power ($${bp.toFixed(2)}).`);
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
                    await interaction.editReply(`Unable to price ${symbol}. Try later.`);
                    return;
                }
                limitPrice = cmd === 'buy' ? Number((ref * 1.001).toFixed(2)) : Number((ref * 0.999).toFixed(2));
            }

            const orderParams: any = {
                symbol, qty, side: cmd,
                type: marketOpen ? 'market' : 'limit',
                time_in_force: marketOpen ? 'day' : 'gtc',
            };
            if (!marketOpen && limitPrice) orderParams.limit_price = limitPrice;

            const order = await alpaca.createOrder(orderParams);
            const price = limitPrice || 0;

            await supabase.from('trades').insert({
                symbol, side: cmd.toUpperCase(), qty, price,
                total_value: price * qty, agent: 'Order Agent',
                strategy: 'Discord Slash', reasoning: `/${cmd} ${symbol} ${qty}`,
                status: 'pending', alpaca_order_id: order.id,
            });

            const embed = orderStatusEmbed(symbol, cmd.toUpperCase(), qty, price, 'pending');
            const row = tradeApprovalRow(order.id);
            const reply = await interaction.editReply({ embeds: [embed], components: [row] });

            trackOrderMessage(order.id, reply.id, interaction.channelId, symbol, cmd.toUpperCase(), qty, price);

            await logAgentAction('Order Agent', 'trade', `SLASH ${cmd.toUpperCase()} ${qty} ${symbol}`, `Order ${order.id}`);
        }

        else if (cmd === 'regime') {
            await interaction.deferReply();
            const { data } = await supabase.from('market_regimes')
                .select('*').order('created_at', { ascending: false }).limit(1);
            const regime = data?.[0];
            if (!regime) {
                await interaction.editReply('No regime data available.');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🌐 Market Regime: ${regime.regime_type}`)
                .setColor(regime.confidence > 0.7 ? 0x2ECC71 : 0xF39C12)
                .addFields(
                    { name: 'Confidence', value: `${(regime.confidence * 100).toFixed(0)}%`, inline: true },
                    { name: 'News Velocity', value: `${regime.news_velocity || 0}`, inline: true },
                )
                .setTimestamp(new Date(regime.created_at))
                .setFooter({ text: 'ACE_OS — Regime Oracle' });

            const factors = regime.macro_factors as any;
            if (factors && typeof factors === 'object') {
                const factorStr = Object.entries(factors).map(([k, v]) => `• ${k}: ${v}`).join('\n');
                if (factorStr) embed.addFields({ name: 'Macro Factors', value: factorStr });
            }

            await interaction.editReply({ embeds: [embed] });
        }

        else if (cmd === 'portfolio') {
            await interaction.deferReply();
            const { data } = await supabase.from('portfolio_state')
                .select('*').order('updated_at', { ascending: false }).limit(1);
            const pf = data?.[0];
            if (!pf) {
                await interaction.editReply('No portfolio data.');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('💼 Portfolio Overview')
                .setColor(0x9B59B6)
                .addFields(
                    { name: 'Equity', value: `$${Number(pf.equity).toLocaleString()}`, inline: true },
                    { name: 'Cash', value: `$${Number(pf.cash).toLocaleString()}`, inline: true },
                    { name: 'Daily P&L', value: `$${Number(pf.daily_pnl).toFixed(2)}`, inline: true },
                    { name: 'Total P&L', value: `$${Number(pf.total_pnl).toFixed(2)}`, inline: true },
                    { name: 'Win Rate', value: `${(Number(pf.win_rate) * 100).toFixed(1)}%`, inline: true },
                    { name: 'Sharpe', value: `${Number(pf.sharpe_ratio).toFixed(2)}`, inline: true },
                    { name: 'Trades', value: `${pf.total_trades}`, inline: true },
                    { name: 'Max DD', value: `${(Number(pf.max_drawdown) * 100).toFixed(1)}%`, inline: true },
                )
                .setTimestamp()
                .setFooter({ text: 'ACE_OS — Portfolio Streamer' });

            await interaction.editReply({ embeds: [embed] });
        }

        else if (cmd === 'agents') {
            await interaction.deferReply();
            const { data } = await supabase.from('agent_state').select('*');
            if (!data || data.length === 0) {
                await interaction.editReply('No agent data.');
                return;
            }

            const lines = data.map(a => {
                const icon = a.status === 'active' ? '🟢' : a.status === 'idle' ? '🟡' : '🔴';
                return `${icon} **${a.agent_name}** — ${a.status}${a.last_action ? ` | ${a.last_action}` : ''}`;
            });

            const embed = new EmbedBuilder()
                .setTitle('🤖 Agent Swarm Status')
                .setDescription(lines.join('\n'))
                .setColor(0x1ABC9C)
                .setTimestamp()
                .setFooter({ text: 'ACE_OS — Swarm Orchestrator' });

            await interaction.editReply({ embeds: [embed] });
        }

        else if (cmd === 'ask') {
            // Handled by chatbot module
        }

    } catch (e: any) {
        console.error(`[SlashCommand] Error in /${cmd}:`, e);
        const msg = `Error: ${e?.message || 'Unknown'}`;
        if (interaction.deferred) await interaction.editReply(msg);
        else await interaction.reply({ content: msg, ephemeral: true });
    }
}
