import { Client, TextChannel } from 'discord.js';
import { alpaca } from '../alpaca';
import { supabase } from '../supabase';
import { orderStatusEmbed } from './components';

interface TrackedOrder {
    messageId: string;
    channelId: string;
    symbol: string;
    side: string;
    qty: number;
    price: number;
    lastStatus: string;
}

const trackedOrders = new Map<string, TrackedOrder>();

export function trackOrderMessage(orderId: string, messageId: string, channelId: string, symbol: string, side: string, qty: number, price: number) {
    trackedOrders.set(orderId, { messageId, channelId, symbol, side, qty, price, lastStatus: 'pending' });
}

// Poll Alpaca for order status changes and edit embeds in-place
export function startLiveTracker(client: Client, intervalMs = 15000) {
    setInterval(async () => {
        if (trackedOrders.size === 0) return;

        for (const [orderId, tracked] of trackedOrders.entries()) {
            try {
                const orders = await alpaca.getOrders('all');
                const order = orders.find((o: any) => o.id === orderId);
                if (!order) continue;

                const newStatus = order.status;
                if (newStatus === tracked.lastStatus) continue;

                tracked.lastStatus = newStatus;
                const filledPrice = order.filled_avg_price ? parseFloat(order.filled_avg_price) : tracked.price;

                // Compute P&L for filled sells
                let pnl: number | undefined;
                if (newStatus === 'filled' && tracked.side === 'SELL') {
                    const { data: trades } = await supabase.from('trades')
                        .select('price').eq('symbol', tracked.symbol).eq('side', 'BUY')
                        .order('created_at', { ascending: false }).limit(1);
                    if (trades?.[0]) {
                        pnl = (filledPrice - Number(trades[0].price)) * tracked.qty;
                    }
                }

                // Edit the message in-place
                const channel = await client.channels.fetch(tracked.channelId) as TextChannel;
                if (!channel) continue;
                const message = await channel.messages.fetch(tracked.messageId);
                if (!message) continue;

                const embed = orderStatusEmbed(tracked.symbol, tracked.side, tracked.qty, filledPrice, newStatus, pnl);
                await message.edit({ embeds: [embed], components: [] });

                // Update DB
                await supabase.from('trades').update({ status: newStatus, price: filledPrice })
                    .eq('alpaca_order_id', orderId);

                // Remove terminal states
                if (['filled', 'cancelled', 'expired', 'rejected'].includes(newStatus)) {
                    trackedOrders.delete(orderId);
                }
            } catch (e) {
                console.error(`[LiveTracker] Error tracking ${orderId}:`, e);
            }
        }
    }, intervalMs);
}
