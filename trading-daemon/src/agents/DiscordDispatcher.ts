import axios from 'axios';

export class DiscordDispatcher {
    static async postUpdate(title: string, description: string, color: number = 3447003) {
        const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (!WEBHOOK_URL) return;
        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title,
                    description,
                    color,
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS — Auto-Trading Daemon" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post update:`, e);
        }
    }

    static async postTradeAlert(symbol: string, action: 'BUY' | 'SELL', qty: number, price: number, reasoning: string) {
        const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (!WEBHOOK_URL) return;
        const color = action === 'BUY' ? 3066993 : 15158332;
        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title: `ORDER EXECUTED — ${action} ${symbol}`,
                    description: [
                        `**Symbol:** ${symbol}`,
                        `**Action:** ${action}`,
                        `**Quantity:** ${qty}`,
                        `**Price:** $${price.toFixed(2)}`,
                        `**Total Value:** $${(qty * price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                        '',
                        `**AI Reasoning:**`,
                        `${reasoning}`,
                    ].join('\n'),
                    color,
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS — Alpaca Paper API" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post trade alert:`, e);
        }
    }

    static async postQueueAlert(symbol: string, action: 'BUY' | 'SELL', qty: number, limitPrice: number, reasoning: string) {
        const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (!WEBHOOK_URL) return;
        const color = 9807270; // neutral grey for queued
        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title: `ORDER QUEUED (GTC) — ${action} ${symbol}`,
                    description: [
                        `**Symbol:** ${symbol}`,
                        `**Action:** ${action} (Good-Till-Cancelled)`,
                        `**Quantity:** ${qty}`,
                        `**Limit Price:** $${limitPrice.toFixed(2)}`,
                        `**Status:** Pending market open`,
                        '',
                        `**AI Reasoning:**`,
                        `${reasoning}`,
                    ].join('\n'),
                    color,
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS — Market Closed — Order Queued for Open" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post queue alert:`, e);
        }
    }
}
