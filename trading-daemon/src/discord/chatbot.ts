import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { supabase, logAgentAction } from '../supabase';
import { alpaca } from '../alpaca';
import { aiBridge } from '../utils/AIBridge';

// ── Tool Definitions ──
const TOOLS = {
    get_portfolio: {
        description: 'Get current portfolio state including equity, cash, P&L, positions',
        execute: async () => {
            const account = await alpaca.getAccount();
            const positions = await alpaca.getPositions();
            return {
                equity: account.equity,
                cash: account.cash,
                buying_power: account.buying_power,
                portfolio_value: account.portfolio_value,
                positions: positions.map((p: any) => ({
                    symbol: p.symbol,
                    qty: p.qty,
                    avg_entry: p.avg_entry_price,
                    current_price: p.current_price,
                    unrealized_pl: p.unrealized_pl,
                    unrealized_plpc: p.unrealized_plpc,
                    market_value: p.market_value,
                })),
            };
        },
    },
    get_open_orders: {
        description: 'Get all open/pending orders',
        execute: async () => {
            const orders = await alpaca.getOrders('open');
            return orders.map((o: any) => ({
                id: o.id,
                symbol: o.symbol,
                side: o.side,
                qty: o.qty,
                type: o.type,
                limit_price: o.limit_price,
                status: o.status,
                created_at: o.created_at,
            }));
        },
    },
    get_recent_trades: {
        description: 'Get the most recent trades from the system',
        execute: async () => {
            const { data } = await supabase.from('trades')
                .select('*').order('created_at', { ascending: false }).limit(15);
            return (data || []).map(t => ({
                symbol: t.symbol,
                side: t.side,
                qty: t.qty,
                price: t.price,
                status: t.status,
                strategy: t.strategy,
                reasoning: t.reasoning,
                pnl: t.pnl,
                created_at: t.created_at,
            }));
        },
    },
    get_market_regime: {
        description: 'Get the current market regime classification',
        execute: async () => {
            const { data } = await supabase.from('market_regimes')
                .select('*').order('created_at', { ascending: false }).limit(1);
            return data?.[0] || { regime_type: 'unknown', confidence: 0 };
        },
    },
    get_signals: {
        description: 'Get recent trading signals from the strategy engine',
        execute: async () => {
            const { data } = await supabase.from('signals')
                .select('*').order('created_at', { ascending: false }).limit(15);
            return (data || []).map(s => ({
                symbol: s.symbol,
                signal_type: s.signal_type,
                strength: s.strength,
                source_agent: s.source_agent,
                acted_on: s.acted_on,
                created_at: s.created_at,
            }));
        },
    },
    get_agent_status: {
        description: 'Get the status of all AI agents in the swarm',
        execute: async () => {
            const { data } = await supabase.from('agent_state').select('*');
            return (data || []).map(a => ({
                agent: a.agent_name,
                status: a.status,
                last_action: a.last_action,
                last_action_at: a.last_action_at,
            }));
        },
    },
    get_news_sentiment: {
        description: 'Get recent news articles with sentiment scores',
        execute: async () => {
            const { data } = await supabase.from('news_articles')
                .select('title, sentiment_hint, source, symbols, published_at')
                .order('created_at', { ascending: false }).limit(10);
            return data || [];
        },
    },
    place_buy_order: {
        description: 'Place a BUY order for a stock (REQUIRES explicit user confirmation)',
        execute: async (args: { symbol: string; qty: number }) => {
            const account = await alpaca.getAccount();
            if (parseFloat(account.buying_power) < 100) {
                return { error: 'Insufficient buying power' };
            }
            const order = await alpaca.createOrder({
                symbol: args.symbol.toUpperCase(),
                qty: args.qty,
                side: 'buy',
                type: 'market',
                time_in_force: 'day',
            });
            await supabase.from('trades').insert({
                symbol: args.symbol.toUpperCase(),
                side: 'BUY',
                qty: args.qty,
                price: 0,
                total_value: 0,
                agent: 'Discord Chatbot',
                strategy: 'Agentic Chat',
                status: 'pending',
                alpaca_order_id: order.id,
                reasoning: 'Placed via /ask agentic chatbot',
            });
            await logAgentAction('Discord Chatbot', 'trade', `AGENTIC BUY ${args.qty}x ${args.symbol}`, `Order ${order.id}`);
            return { success: true, order_id: order.id, symbol: args.symbol, qty: args.qty, side: 'BUY' };
        },
    },
    place_sell_order: {
        description: 'Place a SELL order for a stock (REQUIRES explicit user confirmation)',
        execute: async (args: { symbol: string; qty: number }) => {
            const order = await alpaca.createOrder({
                symbol: args.symbol.toUpperCase(),
                qty: args.qty,
                side: 'sell',
                type: 'market',
                time_in_force: 'day',
            });
            await supabase.from('trades').insert({
                symbol: args.symbol.toUpperCase(),
                side: 'SELL',
                qty: args.qty,
                price: 0,
                total_value: 0,
                agent: 'Discord Chatbot',
                strategy: 'Agentic Chat',
                status: 'pending',
                alpaca_order_id: order.id,
                reasoning: 'Placed via /ask agentic chatbot',
            });
            await logAgentAction('Discord Chatbot', 'trade', `AGENTIC SELL ${args.qty}x ${args.symbol}`, `Order ${order.id}`);
            return { success: true, order_id: order.id, symbol: args.symbol, qty: args.qty, side: 'SELL' };
        },
    },
    cancel_order: {
        description: 'Cancel an open order by order ID',
        execute: async (args: { order_id: string }) => {
            await alpaca.cancelOrder(args.order_id);
            await supabase.from('trades').update({ status: 'cancelled' }).eq('alpaca_order_id', args.order_id);
            await logAgentAction('Discord Chatbot', 'trade', `AGENTIC CANCEL order ${args.order_id}`);
            return { success: true, cancelled: args.order_id };
        },
    },
    cancel_all_orders: {
        description: 'Cancel ALL open orders',
        execute: async () => {
            const orders = await alpaca.getOrders('open');
            const results: any[] = [];
            for (const o of orders) {
                try {
                    await alpaca.cancelOrder(o.id);
                    results.push({ id: o.id, symbol: o.symbol, cancelled: true });
                } catch (e: any) {
                    results.push({ id: o.id, symbol: o.symbol, cancelled: false, error: e.message });
                }
            }
            await logAgentAction('Discord Chatbot', 'trade', `AGENTIC CANCEL ALL — ${results.length} orders`);
            return results;
        },
    },
};

// ── Agentic Loop ──
async function agenticLoop(question: string): Promise<string> {
    // Gather initial context snapshot
    const contextParts: string[] = [];

    // Lightweight context: portfolio + regime + agents (always available)
    try {
        const portfolio = await TOOLS.get_portfolio.execute();
        contextParts.push(`## Portfolio\nEquity: $${Number(portfolio.equity).toLocaleString()} | Cash: $${Number(portfolio.cash).toLocaleString()} | BP: $${Number(portfolio.buying_power).toLocaleString()}\nPositions (${portfolio.positions.length}): ${portfolio.positions.slice(0, 10).map((p: any) => `${p.symbol}: ${p.qty}x @ $${Number(p.avg_entry).toFixed(2)} (${Number(p.unrealized_plpc) >= 0 ? '+' : ''}${(Number(p.unrealized_plpc) * 100).toFixed(1)}%)`).join(', ')}`);
    } catch { }

    try {
        const regime = await TOOLS.get_market_regime.execute();
        contextParts.push(`## Regime: ${regime.regime_type} (${(Number(regime.confidence) * 100).toFixed(0)}% confidence)`);
    } catch { }

    try {
        const agents = await TOOLS.get_agent_status.execute();
        contextParts.push(`## Agents: ${agents.map((a: any) => `${a.agent}: ${a.status}`).join(' | ')}`);
    } catch { }

    const systemContext = contextParts.join('\n\n');

    const systemPrompt = `You are ACE_OS, an autonomous AI trading system with AGENTIC capabilities. You can both answer questions AND take actions.

## LIVE SYSTEM STATE
${systemContext}

## AVAILABLE TOOLS
You can invoke tools by responding with a JSON block in this format:
\`\`\`tool
{"tool": "tool_name", "args": {}}
\`\`\`

Available tools:
- get_portfolio: Get full portfolio details
- get_open_orders: Get all pending orders
- get_recent_trades: Get trade history
- get_market_regime: Get current regime
- get_signals: Get recent trading signals
- get_agent_status: Get swarm agent statuses
- get_news_sentiment: Get recent news with sentiment
- place_buy_order: Place a BUY {"symbol": "AAPL", "qty": 5} — ONLY if user explicitly asks to buy
- place_sell_order: Place a SELL {"symbol": "AAPL", "qty": 5} — ONLY if user explicitly asks to sell
- cancel_order: Cancel order {"order_id": "xxx"}
- cancel_all_orders: Cancel all open orders

## BEHAVIORAL RULES
1. If the user asks a question about data, FIRST use a tool to get fresh data, then answer based on results.
2. For trade actions (buy/sell/cancel), execute ONLY when the user explicitly requests it. Never auto-trade.
3. Be concise, data-driven, and specific. Reference actual numbers from the system state.
4. You can chain multiple tool calls — after getting tool results, you can call another tool or give your final answer.
5. When providing analysis, combine system state with your market knowledge. Be opinionated and actionable.
6. If you need to call a tool, ONLY output the tool block and nothing else. Your text response comes AFTER tool results.

## PERSONALITY
You are confident, direct, and slightly intense — like a senior quant trader. Use numbers, not adjectives. If the data is bad, say so bluntly.`;

    // Agentic loop: AI can call tools iteratively
    let messages: { role: string; content: string }[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
    ];

    const MAX_TOOL_ROUNDS = 4;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await aiBridge.request(
            messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n'),
            { maxTokens: 2048 }
        );

        if (!response.success) {
            throw new Error(response.error);
        }

        const text = response.text;

        // Check for tool invocation
        const toolMatch = text.match(/```tool\s*\n?([\s\S]*?)\n?```/);
        if (toolMatch) {
            try {
                const toolCall = JSON.parse(toolMatch[1].trim());
                const toolName = toolCall.tool as keyof typeof TOOLS;
                const tool = TOOLS[toolName];

                if (!tool) {
                    messages.push({ role: 'assistant', content: text });
                    messages.push({ role: 'system', content: `Tool "${toolName}" not found. Available: ${Object.keys(TOOLS).join(', ')}` });
                    continue;
                }

                console.log(`[Chatbot] Executing tool: ${toolName}`);
                const result = await tool.execute(toolCall.args || {});
                const resultStr = JSON.stringify(result, null, 2);

                messages.push({ role: 'assistant', content: text });
                messages.push({ role: 'system', content: `Tool result for ${toolName}:\n${resultStr}\n\nNow provide your response to the user based on this data. Do NOT call another tool unless absolutely necessary.` });
                continue;
            } catch (e: any) {
                messages.push({ role: 'assistant', content: text });
                messages.push({ role: 'system', content: `Tool execution error: ${e.message}. Respond to the user explaining the issue.` });
                continue;
            }
        }

        // No tool call — this is the final answer
        return text;
    }

    // If we exhausted rounds, get final answer
    messages.push({ role: 'system', content: 'You have used all tool rounds. Give your final answer to the user now.' });
    const finalResponse = await aiBridge.request(
        messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n'),
        { maxTokens: 2048 }
    );
    return finalResponse.text || 'Unable to generate a response.';
}

// ── Discord Command Handler ──
export async function handleAskCommand(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true);
    await interaction.deferReply();

    try {
        const answer = await agenticLoop(question);

        // Clean any leftover tool blocks from the answer
        const cleanAnswer = answer.replace(/```tool[\s\S]*?```/g, '').trim() || 'Processing complete.';

        // Split into chunks if too long for Discord
        const chunks = cleanAnswer.match(/[\s\S]{1,4000}/g) || [cleanAnswer];

        const embed = new EmbedBuilder()
            .setTitle('🧠 ACE_OS Intelligence')
            .setDescription(chunks[0])
            .setColor(0x9B59B6)
            .setTimestamp()
            .setFooter({ text: `Asked by ${interaction.user.username} | Agentic Mode` });

        await interaction.editReply({ embeds: [embed] });

        for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder().setDescription(chunks[i]).setColor(0x9B59B6)
                ]
            });
        }
    } catch (e: any) {
        console.error('[Chatbot] Agentic error:', e?.message);
        await interaction.editReply(`AI error: ${e?.message || 'Unknown error'}`);
    }
}
