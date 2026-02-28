import axios from 'axios';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export class DiscordDispatcher {
    /**
     * Send a general intelligence or system status update
     */
    static async postUpdate(title: string, description: string, color: number = 3447003) {
        if (!WEBHOOK_URL) return;

        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title,
                    description,
                    color, // Default Blue
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS • Auto-Trading Daemon" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post update:`, e);
        }
    }

    /**
     * Send a high-priority trade execution alert
     */
    static async postTradeAlert(symbol: string, action: 'BUY' | 'SELL', qty: number, price: number, reasoning: string) {
        if (!WEBHOOK_URL) return;

        const isBuy = action === 'BUY';
        const color = isBuy ? 3066993 : 15158332; // Green : Red

        try {
            await axios.post(WEBHOOK_URL, {
                embeds: [{
                    title: `🚨 EXECUTING ${action}: ${symbol} 🚨`,
                    description: `**Quantity:** ${qty}\n**Est. Price:** $${price.toFixed(2)}\n**Total Value:** $${(qty * price).toLocaleString()}`,
                    color,
                    fields: [
                        { name: "🧠 AI Reasoning Synthesis", value: reasoning }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: "ACE_OS • Alpaca Live Paper API" }
                }]
            });
        } catch (e) {
            console.error(`[Discord] Failed to post trade alert:`, e);
        }
    }
}
