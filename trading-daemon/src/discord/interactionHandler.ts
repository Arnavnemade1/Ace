import { Client, Interaction } from 'discord.js';
import { alpaca } from '../alpaca';
import { supabase, logAgentAction } from '../supabase';
import { orderStatusEmbed, strategyDropdown, riskDropdown } from './components';

const STRATEGY_MATRIX: Record<string, { minConviction: number; signalThreshold: number; buyThreshold: number; maxAllocationPct: number }> = {
    aggressive: { minConviction: 0.8, signalThreshold: 0.65, buyThreshold: 0.75, maxAllocationPct: 0.023 },
    balanced: { minConviction: 0.85, signalThreshold: 0.7, buyThreshold: 0.8, maxAllocationPct: 0.02 },
    conservative: { minConviction: 0.9, signalThreshold: 0.8, buyThreshold: 0.9, maxAllocationPct: 0.015 },
};
const RISK_MATRIX: Record<string, { lowRiskOnly: boolean; maxAllocationPct?: number; note: string }> = {
    minimal: { lowRiskOnly: true, maxAllocationPct: 0.01, note: 'Low-risk ETF only' },
    standard: { lowRiskOnly: false, note: 'Standard universe' },
    cautious: { lowRiskOnly: false, note: 'Standard universe, tighter limits' },
};

export function setupInteractionHandler(client: Client) {
    client.on('interactionCreate', async (interaction: Interaction) => {
        // ── Button interactions ──
        if (interaction.isButton()) {
            const [action, orderId] = interaction.customId.split(':');

            if (action === 'trade_approve') {
                await interaction.reply({ content: `✅ Order \`${orderId}\` confirmed by ${interaction.user.username}.`, ephemeral: false });
                await logAgentAction('Order Agent', 'trade', `BUTTON_CONFIRM ${orderId}`, `Confirmed by ${interaction.user.username}`);
            }

            else if (action === 'trade_cancel') {
                await interaction.deferReply();
                try {
                    await alpaca.cancelOrder(orderId);
                    await supabase.from('trades').update({ status: 'cancelled' }).eq('alpaca_order_id', orderId);

                    // Edit original message
                    const original = interaction.message;
                    const embed = orderStatusEmbed('—', '—', 0, 0, 'cancelled');
                    await original.edit({ embeds: [embed], components: [] });

                    await interaction.editReply(`❌ Order \`${orderId}\` cancelled by ${interaction.user.username}.`);
                    await logAgentAction('Order Agent', 'trade', `BUTTON_CANCEL ${orderId}`, `Cancelled by ${interaction.user.username}`);
                } catch (e: any) {
                    await interaction.editReply(`Failed to cancel: ${e?.message}`);
                }
            }

            else if (action === 'trade_details') {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const { data: trade } = await supabase.from('trades')
                        .select('*').eq('alpaca_order_id', orderId).maybeSingle();
                    if (trade) {
                        await interaction.editReply(
                            `**${trade.side} ${trade.symbol}** x${trade.qty}\nPrice: $${trade.price}\nStrategy: ${trade.strategy}\nReasoning: ${trade.reasoning || 'N/A'}\nStatus: ${trade.status}`
                        );
                    } else {
                        await interaction.editReply('Trade not found.');
                    }
                } catch (e: any) {
                    await interaction.editReply(`Error: ${e?.message}`);
                }
            }
        }

        // ── Select menu interactions ──
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;
            const value = interaction.values[0];

            if (id === 'strategy_select' || id === 'risk_select') {
                await interaction.deferReply();
                const { data: state } = await supabase.from('agent_state')
                    .select('config').eq('agent_name', 'Orchestrator').maybeSingle();
                const config: any = { ...(state?.config || {}) };

                if (id === 'strategy_select') {
                    config.strategy_bias = value;
                    const s = STRATEGY_MATRIX[value] || STRATEGY_MATRIX.balanced;
                    await interaction.editReply(
                        `🧠 Strategy set to **${value}**\n• Conviction: ${(s.minConviction * 100).toFixed(0)}%\n• Signal: ${s.signalThreshold}\n• Buy: ${s.buyThreshold}\n• Max Alloc: ${(s.maxAllocationPct * 100).toFixed(2)}%`
                    );
                } else {
                    config.risk_profile = value;
                    const r = RISK_MATRIX[value] || RISK_MATRIX.standard;
                    await interaction.editReply(
                        `🔒 Risk set to **${value}**\n• Mode: ${r.note}${r.lowRiskOnly ? ' (ETF only)' : ''}\n• Max Alloc: ${r.maxAllocationPct ? (r.maxAllocationPct * 100).toFixed(2) + '%' : 'default'}`
                    );
                }

                config.discord_directive = {
                    type: id === 'strategy_select' ? 'strategy' : 'risk',
                    value,
                    author: interaction.user.username,
                    at: new Date().toISOString(),
                };

                await supabase.from('agent_state')
                    .update({ config, updated_at: new Date().toISOString() })
                    .eq('agent_name', 'Orchestrator');

                await logAgentAction('Orchestrator', 'learning', `Discord ${id}: ${value}`, `Set by ${interaction.user.username}`);
            }
        }
    });
}
