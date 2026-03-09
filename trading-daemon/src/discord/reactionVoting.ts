import { Message, TextChannel, Client } from 'discord.js';
import { alpaca } from '../alpaca';
import { supabase, logAgentAction } from '../supabase';
import { tradeProposalEmbed, orderStatusEmbed } from './components';

const VOTE_TIMEOUT_MS = 60_000;

/**
 * Post a trade proposal with reaction voting.
 * 👍 = confirm, 👎 within 60s = cancel the order.
 */
export async function postTradeProposal(
    client: Client,
    channelId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    qty: number,
    price: number,
    reasoning: string,
    alpacaOrderId: string,
) {
    try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel) return;

        const embed = tradeProposalEmbed(symbol, side, qty, price, reasoning, alpacaOrderId);
        const message = await channel.send({ embeds: [embed] });

        await message.react('👍');
        await message.react('👎');

        const filter = (reaction: any, user: any) => {
            return ['👍', '👎'].includes(reaction.emoji.name) && !user.bot;
        };

        const collector = message.createReactionCollector({ filter, time: VOTE_TIMEOUT_MS });

        collector.on('collect', async (reaction, user) => {
            if (reaction.emoji.name === '👎') {
                try {
                    await alpaca.cancelOrder(alpacaOrderId);
                    await supabase.from('trades').update({ status: 'cancelled' })
                        .eq('alpaca_order_id', alpacaOrderId);

                    const cancelEmbed = orderStatusEmbed(symbol, side, qty, price, 'cancelled');
                    await message.edit({ embeds: [cancelEmbed] });
                    await message.reply(`Order cancelled by ${user.username} via 👎 vote.`);

                    await logAgentAction('Order Agent', 'trade', `VOTE_CANCEL ${side} ${symbol}`, `Cancelled by ${user.username}`);
                } catch (e) {
                    console.error('[ReactionVoting] Cancel failed:', e);
                }
                collector.stop();
            }
        });

        collector.on('end', async (collected) => {
            const hasVeto = collected.some(r => r.emoji.name === '👎' && r.count > 1);
            if (!hasVeto) {
                // Order stands — update embed
                const confirmedEmbed = orderStatusEmbed(symbol, side, qty, price, 'confirmed');
                await message.edit({ embeds: [confirmedEmbed] });
            }
        });
    } catch (e) {
        console.error('[ReactionVoting] Failed to post proposal:', e);
    }
}
