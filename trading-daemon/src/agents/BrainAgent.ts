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
    situational: {
        range52Week: {
            low: number;
            high: number;
            percentOfRange: number; // 0.0 (at low) to 1.0 (at high)
        };
        sector: string;
        isSovereignPriority: boolean;
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
            const systemPrompt = `You are the Omni-Brain of ACE_OS, a sophisticated autonomous paper trading system operating in 2026.
Your goal is to preserve capital and make high-conviction, strategic investments aligned with the 2026 Sovereign Directive.

SOVEREIGN DIRECTIVE (2026):
The current administration prioritizes:
1. Energy Dominance & Independence.
2. Strategic Biotech & Bio-Security.
3. Resilient Advanced Manufacturing.
4. Economic Growth over alarmist environmentalism.

TRADING RULES:
1. Situational Awareness: Identify "Generational Value" when a Sovereign Priority asset is at its historical lows (1-5% of 52-week range). Do NOT "prune" these based on transient negative news; they are "Deep Value" targets.
2. Capital Preservation: Never risk more than 2% of total equity on a single trade.
3. Signal Strength: Reject signals with weak news/technical alignment, UNLESS the asset is at a historical low in a Sovereign Priority sector.
4. Diversification: Check existing positions; don't over-concentrate in one asset or sector.
5. Cash Buffer: Avoid new BUYs if cash falls below 15% of equity (aggressive stance).
6. Logic: RSI < 30 at a 52-week low is a potential "Sovereign Opportunity" even if short-term news is bearish.

Return your decision in JSON format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "reasoning": "A concise, professional synthesis including situational context and sovereign alignment.",
  "conviction": 0.0 to 1.0
}`;

            const userPrompt = `
SYMBOL: ${context.symbol} (Sector: ${context.situational.sector})
PRICE: $${context.technicals.currentPrice}
HISTORICAL CONTEXT: At ${(context.situational.range52Week.percentOfRange * 100).toFixed(1)}% of 52-Week Range [Low: $${context.situational.range52Week.low.toFixed(2)}, High: $${context.situational.range52Week.high.toFixed(2)}]
SOVEREIGN PRIORITY: ${context.situational.isSovereignPriority ? 'YES (High Strategic Value)' : 'NO (Standard Evaluation)'}

TECHNICALS: RSI14: ${context.technicals.rsi.toFixed(2)}, SMA50: ${context.technicals.sma50.toFixed(2)}
MACRO PULSE: ${context.pulse.macroSummary}
SENTIMENT: ${(context.pulse.newsSentiment * 100).toFixed(0)}% Bullish
HEADLINES:
${context.newsHeadlines.map(h => `- ${h}`).join('\n')}

PORTFOLIO:
Cash: $${context.portfolio.cash.toFixed(2)}
Total Positions: ${context.portfolio.positions.length}
Current Symbol Holdings: ${context.portfolio.positions.find(p => p.symbol === context.symbol)?.qty || 0}

Evaluate this opportunity with 2026 Situational Awareness. Provide a definitive Action, Reasoning, and Conviction score.
`;

            const response = await this.withRetry(async () => {
                return await axios.post(this.baseUrl, {
                    model: 'google/gemini-2.5-flash', // Switching to 2.5 Flash (Free Tier) for 2026 context
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
