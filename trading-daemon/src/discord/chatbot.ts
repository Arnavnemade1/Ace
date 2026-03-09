import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabase';
import { alpaca } from '../alpaca';
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function gatherSystemContext(): Promise<string> {
    const sections: string[] = [];

    // Portfolio
    try {
        const { data: pf } = await supabase.from('portfolio_state')
            .select('*').order('updated_at', { ascending: false }).limit(1);
        if (pf?.[0]) {
            const p = pf[0];
            sections.push(`## Portfolio\nEquity: $${Number(p.equity).toLocaleString()} | Cash: $${Number(p.cash).toLocaleString()} | Daily P&L: $${Number(p.daily_pnl).toFixed(2)} | Total P&L: $${Number(p.total_pnl).toFixed(2)} | Win Rate: ${(Number(p.win_rate) * 100).toFixed(1)}% | Sharpe: ${Number(p.sharpe_ratio).toFixed(2)} | Trades: ${p.total_trades} | Max DD: ${(Number(p.max_drawdown) * 100).toFixed(1)}%`);
            const positions = p.positions as any[];
            if (positions?.length > 0) {
                sections.push(`### Positions\n${positions.slice(0, 15).map((pos: any) => `${pos.symbol}: ${pos.qty}x @ $${pos.avg_entry_price}`).join('\n')}`);
            }
        }
    } catch {}

    // Regime
    try {
        const { data: reg } = await supabase.from('market_regimes')
            .select('*').order('created_at', { ascending: false }).limit(1);
        if (reg?.[0]) {
            const r = reg[0];
            sections.push(`## Market Regime\nType: ${r.regime_type} | Confidence: ${(r.confidence * 100).toFixed(0)}% | News Velocity: ${r.news_velocity}\nFactors: ${JSON.stringify(r.macro_factors)}`);
        }
    } catch {}

    // Agent states
    try {
        const { data: agents } = await supabase.from('agent_state').select('*');
        if (agents?.length) {
            const agentLines = agents.map(a => `${a.agent_name}: ${a.status}${a.last_action ? ` — ${a.last_action}` : ''}`);
            sections.push(`## Active Agents\n${agentLines.join('\n')}`);
        }
    } catch {}

    // Recent trades
    try {
        const { data: trades } = await supabase.from('trades')
            .select('*').order('created_at', { ascending: false }).limit(10);
        if (trades?.length) {
            const tradeLines = trades.map(t => `${t.side} ${t.qty}x ${t.symbol} @ $${t.price} — ${t.status} (${t.strategy})`);
            sections.push(`## Recent Trades\n${tradeLines.join('\n')}`);
        }
    } catch {}

    // Recent signals
    try {
        const { data: sigs } = await supabase.from('signals')
            .select('*').order('created_at', { ascending: false }).limit(10);
        if (sigs?.length) {
            const sigLines = sigs.map(s => `${s.signal_type} ${s.symbol} strength:${s.strength} from ${s.source_agent}`);
            sections.push(`## Recent Signals\n${sigLines.join('\n')}`);
        }
    } catch {}

    // Recent news
    try {
        const { data: news } = await supabase.from('news_articles')
            .select('title, sentiment_hint, source, symbols')
            .order('created_at', { ascending: false }).limit(8);
        if (news?.length) {
            const newsLines = news.map(n => `[${n.source}] ${n.title} (sentiment: ${n.sentiment_hint?.toFixed(2) ?? 'N/A'})`);
            sections.push(`## Recent News\n${newsLines.join('\n')}`);
        }
    } catch {}

    // Orchestrator config
    try {
        const { data: orch } = await supabase.from('agent_state')
            .select('config').eq('agent_name', 'Orchestrator').maybeSingle();
        if (orch?.config) {
            sections.push(`## Orchestrator Config\n${JSON.stringify(orch.config)}`);
        }
    } catch {}

    // Live account from Alpaca
    try {
        const account = await alpaca.getAccount();
        sections.push(`## Alpaca Live\nEquity: $${account.equity} | BP: $${account.buying_power} | Portfolio: $${account.portfolio_value}`);
    } catch {}

    return sections.join('\n\n');
}

export async function handleAskCommand(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true);
    await interaction.deferReply();

    try {
        const context = await gatherSystemContext();

        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_KEY) {
            await interaction.editReply('AI not configured. Missing GEMINI_API_KEY.');
            return;
        }

        const systemPrompt = `You are ACE_OS, an autonomous AI trading system assistant. You have full visibility into the system state below. Answer questions about portfolio, trades, agents, market regime, signals, and news. Be concise, data-driven, and specific. Use numbers. If asked about strategy, reference the actual config and regime data.\n\n--- SYSTEM STATE ---\n${context}`;

        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_KEY}`, {
            contents: [
                { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser question: ${question}` }] }
            ],
            generationConfig: { maxOutputTokens: 2048 },
        });

        const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';

        // Split into chunks if too long for Discord
        const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];

        const embed = new EmbedBuilder()
            .setTitle('🧠 ACE_OS Intelligence')
            .setDescription(chunks[0])
            .setColor(0x9B59B6)
            .setTimestamp()
            .setFooter({ text: `Asked by ${interaction.user.username}` });

        await interaction.editReply({ embeds: [embed] });

        // Send overflow as follow-ups
        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({ embeds: [
                new EmbedBuilder().setDescription(chunks[i]).setColor(0x9B59B6)
            ] });
        }
    } catch (e: any) {
        console.error('[Chatbot] AI error:', e?.response?.data || e?.message);
        await interaction.editReply(`AI error: ${e?.message || 'Unknown error'}`);
    }
}
