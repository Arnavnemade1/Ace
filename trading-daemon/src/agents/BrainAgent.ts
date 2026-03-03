import axios from 'axios';
import { logAgentAction } from '../supabase';

export interface BrainContext {
    symbol: string;
    technicals: {
        rsi: number;
        sma50: number;
        currentPrice: number;
    };
    pulse: {
        newsSentiment: number;
        macroSummary: string;
        weatherRisk: number;
    };
    newsHeadlines: string[];
    portfolio: {
        cash: number;
        equity: number;
        buyingPower: number;
        positions: any[];
    };
}

export class BrainAgent {
    private apiKey = process.env.LOVABLE_API_KEY;
    private baseUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';

    private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> {
        let delay = initialDelay;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error: any) {
                const is429 = error.response?.status === 429 || error.message?.includes('429');
                if (is429 && i < maxRetries - 1) {
                    console.log(`[Omni-Brain] 429 Rate Limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                throw error;
            }
        }
        return await fn();
    }

    async synthesize(context: BrainContext): Promise<{ action: 'BUY' | 'SELL' | 'HOLD'; reasoning: string; conviction: number }> {
        if (!this.apiKey) {
            return {
                action: 'HOLD',
                reasoning: 'Omni-Brain Offline: LOVABLE_API_KEY missing from environment.',
                conviction: 0
            };
        }

        try {
            const systemPrompt = `You are the Omni-Brain of ACE_OS, a sophisticated autonomous paper trading system.
Your goal is to preserve capital and make only high-quality, well-justified investments.
You synthesize Technical Analysis, News Sentiment, Macro Context, and Portfolio Risk.

TRADING RULES:
1. Capital Preservation: Never risk more than 2% of total equity on a single trade.
2. Signal Strength: Reject signals with weak news/technical alignment.
3. Diversification: Check existing positions; don't over-concentrate in one asset or sector.
4. Cash Buffer: Avoid new BUYs if cash falls below 25% of equity.
5. Logic: RSI > 70 is overbought (Sell/Hold), RSI < 30 is oversold (Buy/Hold), but ONLY if News Sentiment aligns.
6. Quality: Avoid stocks with highly negative or volatile news.

Return your decision in JSON format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "reasoning": "A concise, professional synthesis of why this decision was made.",
  "conviction": 0.0 to 1.0
}`;

            const userPrompt = `
SYMBOL: ${context.symbol}
PRICE: $${context.technicals.currentPrice}
TECHNICALS: RSI14: ${context.technicals.rsi.toFixed(2)}, SMA50: ${context.technicals.sma50.toFixed(2)}
MACRO PULSE: ${context.pulse.macroSummary}
SENTIMENT: ${(context.pulse.newsSentiment * 100).toFixed(0)}% Bullish
WEATHER RISK: ${context.pulse.weatherRisk.toFixed(2)}
HEADLINES:
${context.newsHeadlines.map(h => `- ${h}`).join('\n')}

PORTFOLIO:
Cash: $${context.portfolio.cash.toFixed(2)}
Total Positions: ${context.portfolio.positions.length}
Current Symbol Holdings: ${context.portfolio.positions.find(p => p.symbol === context.symbol)?.qty || 0}

Evaluate this opportunity. Provide a definitive Action, Reasoning, and Conviction score.
`;

            const response = await this.withRetry(async () => {
                return await axios.post(this.baseUrl, {
                    model: 'google/gemini-3-flash-preview',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    response_format: { type: 'json_object' }
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });
            });

            const result = response.data.choices[0].message.content;
            // Original code had JSON.parse which might be needed if string, but let's be safe
            const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
            return {
                action: parsedResult.action || 'HOLD',
                reasoning: parsedResult.reasoning || 'No reasoning provided by AI.',
                conviction: parsedResult.conviction || 0
            };

        } catch (error: any) {
            console.error('[Omni-Brain] Synthesis Error:', error.message);
            return {
                action: 'HOLD',
                reasoning: `Synthesis failure: ${error.message}`,
                conviction: 0
            };
        }
    }
}
