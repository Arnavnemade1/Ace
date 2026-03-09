import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { logAgentAction } from '../supabase';
import { registerSlashCommands, handleSlashCommand, handleAutocomplete } from './slashCommands';
import { handleAskCommand } from './chatbot';
import { setupInteractionHandler } from './interactionHandler';
import { startLiveTracker } from './liveTracker';
import { strategyDropdown, riskDropdown } from './components';

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
            GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.Message, Partials.Reaction],
    });

    client.once('ready', async () => {
        console.log(`[DiscordControl] Logged in as ${client.user?.tag}`);

        // Register slash commands
        if (client.user) {
            await registerSlashCommands(client.user.id);
        }

        // Setup button/dropdown interaction handler
        setupInteractionHandler(client);

        // Start live order embed tracker
        startLiveTracker(client);

        await logAgentAction('Orchestrator', 'info', 'Discord bot online',
            `Slash commands registered. Listening in channel ${channelId}`);

        // Send startup message with control dropdowns
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel && 'send' in channel) {
                await (channel as any).send({
                    content: '🟢 **ACE_OS Online** — Use slash commands or dropdowns below to control the swarm.',
                    components: [strategyDropdown(), riskDropdown()],
                });
            }
        } catch (e) {
            console.error('[DiscordControl] Failed to send startup message:', e);
        }
    });

    // Handle slash commands
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'ask') {
                await handleAskCommand(interaction);
            } else {
                await handleSlashCommand(interaction);
            }
        }
    });

    await client.login(token);
}
