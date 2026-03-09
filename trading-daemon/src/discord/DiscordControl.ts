import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Interaction
} from 'discord.js';
import { logAgentAction, supabase } from '../supabase';
import { alpaca } from '../alpaca';
import { BrainAgent } from '../agents/BrainAgent';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const MIN_BUYING_POWER = 100;

const brain = new BrainAgent();

const commands = [
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check portfolio and daemon status'),
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the ACE_OS Intelligence Brain a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for the AI')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Manually buy an asset')
        .addStringOption(option => option.setName('symbol').setDescription('Ticker symbol').setRequired(true))
        .addIntegerOption(option => option.setName('qty').setDescription('Quantity').setRequired(true)),
    new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Manually sell an asset')
        .addStringOption(option => option.setName('symbol').setDescription('Ticker symbol').setRequired(true))
        .addIntegerOption(option => option.setName('qty').setDescription('Quantity').setRequired(true)),
].map(command => command.toJSON());

async function registerCommands(token: string, clientId: string, guildId?: string) {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('[Discord] Registering slash commands...');
        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
        }
        console.log('[Discord] Slash commands registered successfully.');
    } catch (error) {
        console.error('[Discord] Failed to register commands:', error);
    }
}

async function getMarketClock() {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET;
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
    const secret = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET;
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
    const channelId = process.env.DISCORD_CONTROL_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;

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
        await registerCommands(token, client.user!.id);
        await logAgentAction('Orchestrator', 'info', 'Discord control online', `Slash commands and Interaction handling active.`);
    });

    client.on('interactionCreate', async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

        try {
            if (interaction.isChatInputCommand()) {
                const { commandName } = interaction;

                if (commandName === 'status') {
                    await interaction.deferReply();
                    const account = await alpaca.getAccount();
                    const positions = await alpaca.getPositions();
                    const orders = await alpaca.getOrders('open');

                    const embed = new EmbedBuilder()
                        .setTitle('📊 System Portfolio Status')
                        .setColor(0x00ae86)
                        .addFields(
                            { name: 'Equity', value: `$${parseFloat(account.equity).toLocaleString()}`, inline: true },
                            { name: 'Buying Power', value: `$${parseFloat(account.buying_power).toLocaleString()}`, inline: true },
                            { name: 'Positions', value: `${positions.length}`, inline: true },
                            { name: 'Open Orders', value: `${orders.length}`, inline: true }
                        )
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                }

                if (commandName === 'ask') {
                    const question = interaction.options.getString('question', true);
                    await interaction.deferReply();

                    // Simple chat synthesis using BrainAgent
                    // We mock a light context for a general question
                    const response = await (brain as any).synthesize({
                        symbol: 'GENERAL',
                        technicals: { rsi: 50, sma50: 0, currentPrice: 0 },
                        pulse: { newsSentiment: 0.5, macroSummary: question, weatherRisk: 0 },
                        situational: { sector: 'Global', isSovereignPriority: false, range52Week: { low: 0, high: 0, percentOfRange: 0.5 } },
                        newsHeadlines: [],
                        portfolio: { cash: 0, equity: 0, buyingPower: 0, positions: [] }
                    });

                    const embed = new EmbedBuilder()
                        .setTitle('🧠 ACE_OS Intelligence Brain')
                        .setDescription(`**Q:** ${question}\n\n**A:** ${response.reasoning}`)
                        .setColor(0x5865F2)
                        .setFooter({ text: `Conviction: ${(response.conviction * 100).toFixed(0)}%` });

                    await interaction.editReply({ embeds: [embed] });
                }

                if (commandName === 'buy' || commandName === 'sell') {
                    const symbol = interaction.options.getString('symbol', true).toUpperCase();
                    const qty = interaction.options.getInteger('qty', true);

                    await interaction.reply({
                        content: `Confirm manual ${commandName.toUpperCase()} of ${qty} ${symbol}?`,
                        components: [
                            new ActionRowBuilder<ButtonBuilder>().addComponents(
                                new ButtonBuilder().setCustomId(`confirm_${commandName}_${symbol}_${qty}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
                                new ButtonBuilder().setCustomId('cancel_trade').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                            )
                        ],
                        ephemeral: true
                    });
                }
            }

            if (interaction.isButton()) {
                if (interaction.customId === 'cancel_trade') {
                    await interaction.update({ content: 'Trade cancelled.', components: [] });
                    return;
                }

                if (interaction.customId.startsWith('confirm_')) {
                    await interaction.deferUpdate();
                    const [, side, symbol, qtyStr] = interaction.customId.split('_');
                    const qty = parseInt(qtyStr, 10);

                    const clock = await getMarketClock();
                    const marketOpen = clock?.is_open ?? false;
                    let limitPrice: number | null = null;

                    if (!marketOpen) {
                        const snap = await getSnapshot(symbol);
                        const ref = side === 'buy' ? (snap?.latestQuote?.ap || snap?.latestTrade?.p) : (snap?.latestQuote?.bp || snap?.latestTrade?.p);
                        if (!ref) {
                            await interaction.editReply({ content: `❌ Unable to price ${symbol} (Market Closed).`, components: [] });
                            return;
                        }
                        limitPrice = side === 'buy' ? Number((ref * 1.001).toFixed(2)) : Number((ref * 0.999).toFixed(2));
                    }

                    const orderParams: any = {
                        symbol,
                        qty,
                        side: side as 'buy' | 'sell',
                        type: marketOpen ? 'market' : 'limit',
                        time_in_force: marketOpen ? 'day' : 'gtc',
                    };
                    if (!marketOpen && limitPrice) orderParams.limit_price = limitPrice;

                    try {
                        const order = await alpaca.createOrder(orderParams);
                        await logAgentAction('Order Agent', 'trade', `Discord Manual ${side.toUpperCase()} ${qty} ${symbol}`, `Order ${order.id}`);

                        await interaction.editReply({
                            content: `✅ ${side.toUpperCase()} order submitted for ${qty} ${symbol}. ID: ${order.id}`,
                            components: []
                        });
                    } catch (err: any) {
                        await interaction.editReply({ content: `❌ Alpaca Error: ${err.message}`, components: [] });
                    }
                }
            }
        } catch (error) {
            console.error('[Discord] Interaction Error:', error);
        }
    });

    await client.login(token);
}
