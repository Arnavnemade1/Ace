import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
} from 'discord.js';

// ── Trade Alert Buttons ──
export function tradeApprovalRow(orderId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`trade_approve:${orderId}`)
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`trade_cancel:${orderId}`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`trade_details:${orderId}`)
            .setLabel('📊 Details')
            .setStyle(ButtonStyle.Secondary),
    );
}

// ── Strategy Dropdown ──
export function strategyDropdown() {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('strategy_select')
            .setPlaceholder('🧠 Switch Strategy…')
            .addOptions(
                { label: '⚡ Aggressive', value: 'aggressive', description: 'High conviction, wider allocation' },
                { label: '⚖️ Balanced', value: 'balanced', description: 'Default mode, moderate risk' },
                { label: '🛡️ Conservative', value: 'conservative', description: 'Tight thresholds, low risk' },
            ),
    );
}

// ── Risk Dropdown ──
export function riskDropdown() {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('risk_select')
            .setPlaceholder('🔒 Set Risk Profile…')
            .addOptions(
                { label: '🟢 Standard', value: 'standard', description: 'Full universe, normal allocation' },
                { label: '🟡 Cautious', value: 'cautious', description: 'Standard universe, tighter limits' },
                { label: '🔴 Minimal', value: 'minimal', description: 'ETF-only, minimal allocation' },
            ),
    );
}

// ── Trade Proposal Embed (for reaction voting) ──
export function tradeProposalEmbed(symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, reasoning: string, orderId: string) {
    const color = side === 'BUY' ? 0x2ECC71 : 0xE74C3C;
    return new EmbedBuilder()
        .setTitle(`⏳ TRADE PROPOSAL — ${side} ${symbol}`)
        .setDescription([
            `**Symbol:** ${symbol}`,
            `**Action:** ${side}`,
            `**Quantity:** ${qty}`,
            `**Price:** $${price.toFixed(2)}`,
            `**Est. Value:** $${(qty * price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            '',
            `**AI Reasoning:**`,
            reasoning,
            '',
            `React 👍 to confirm or 👎 within 60s to cancel.`,
        ].join('\n'))
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `ACE_OS — Order ID: ${orderId}` });
}

// ── Live Status Embed (editable) ──
export function orderStatusEmbed(symbol: string, side: string, qty: number, price: number, status: string, pnl?: number) {
    const statusIcon: Record<string, string> = {
        pending: '⏳',
        filled: '✅',
        cancelled: '❌',
        partial: '🔄',
    };
    const icon = statusIcon[status] || '❓';

    const embed = new EmbedBuilder()
        .setTitle(`${icon} ${side.toUpperCase()} ${symbol} — ${status.toUpperCase()}`)
        .addFields(
            { name: 'Qty', value: `${qty}`, inline: true },
            { name: 'Price', value: `$${price.toFixed(2)}`, inline: true },
            { name: 'Status', value: status.toUpperCase(), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'ACE_OS — Live Order Tracker' });

    if (pnl !== undefined && pnl !== null) {
        const pnlColor = pnl >= 0 ? 0x2ECC71 : 0xE74C3C;
        embed.addFields({ name: 'P&L', value: `$${pnl.toFixed(2)}`, inline: true });
        embed.setColor(pnlColor);
    } else {
        embed.setColor(side === 'BUY' ? 0x3498DB : 0xE67E22);
    }

    return embed;
}
