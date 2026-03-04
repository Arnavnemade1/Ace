import axios from 'axios';

export class DiscordDispatcher {
    private static enabled() {
        return process.env.DISCORD_DAEMON_ENABLED === 'true';
    }

    static async postUpdate(title: string, description: string, color: number = 3447003, imageUrl?: string) {
        if (!this.enabled()) return;
        const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (!WEBHOOK_URL) return;
        try {
            const embed: any = {
                title,
                description,
                color,
                timestamp: new Date().toISOString(),
                footer: { text: "ACE_OS — Auto-Trading Daemon" }
            };

            if (imageUrl) {
                embed.image = { url: imageUrl };
            }

            await axios.post(WEBHOOK_URL, {
                embeds: [embed]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post update:`, e);
        }
    }

    static async postTradeAlert(symbol: string, action: 'BUY' | 'SELL', qty: number, price: number, reasoning: string) {
        if (!this.enabled()) return;
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
        if (!this.enabled()) return;
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

    static async postOracleLifecycle(action: 'SPAWN' | 'KILL', agentName: string, reason: string, regime: string) {
        if (!this.enabled()) return;
        const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (!WEBHOOK_URL) return;

        const isBirth = action === 'SPAWN';
        const title = isBirth ? `🐣 ORACLE_SPAWN — ${agentName}` : `💀 ORACLE_RETIRE — ${agentName}`;
        const color = isBirth ? 10181046 : 9807270; // purple for birth, grey for death

        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title,
                    description: [
                        `**Agent Persona:** ${agentName}`,
                        `**Regime Context:** ${regime}`,
                        `**Reasoning:**`,
                        `${reason}`,
                    ].join('\n'),
                    color,
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS — Neural Lifecycle Feed" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post Oracle lifecycle:`, e);
        }
    }
}
