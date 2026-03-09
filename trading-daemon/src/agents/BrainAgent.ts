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
            const systemPrompt = `You are the ACE_OS Intelligence Synthesis Engine (v2026).
Your primary objective is to derive actionable alphabetic signals from high-dimensional market data.
Do not rely on predefined biases. Synthesize technicals, sentiment, and macro data to identify asymmetric edges.
Identify specifically where the "market is wrong" or where "sovereign priorities" (energy, defense, advanced-bio) are neglected by short-term noise.

Your output is a strict JSON object:
{
  "action": "BUY" | "SELL" | "HOLD",
  "reasoning": "A concise, technical synthesis of input data points.",
  "conviction": 0.0 to 1.0 (quantified signal strength)
}`;

            const userPrompt = `
[ASSET_CONTEXT]
SYMBOL: ${context.symbol} (Sector: ${context.situational.sector})
PRICE: $${context.technicals.currentPrice}
RANGE_52W: At ${(context.situational.range52Week.percentOfRange * 100).toFixed(1)}% of 52-Week Range [Low: $${context.situational.range52Week.low.toFixed(2)}, High: $${context.situational.range52Week.high.toFixed(2)}]
SOVEREIGN_TAG: ${context.situational.isSovereignPriority ? 'STRATEGIC_PRIORITY (BIO/ENERGY/DEFENSE)' : 'STANDARD'}

[MARKET_DATA]
RSI14: ${context.technicals.rsi.toFixed(2)}
SMA50: ${context.technicals.sma50.toFixed(2)}
MACRO_PULSE: ${context.pulse.macroSummary}
NEWS_SENTIMENT: ${(context.pulse.newsSentiment * 100).toFixed(0)}% Bullish

[GLOBAL_HEADLINES]
${context.newsHeadlines.map(h => `- ${h}`).join('\n')}

[PORTFOLIO_STATE]
Cash: $${context.portfolio.cash.toFixed(2)}
Positions Count: ${context.portfolio.positions.length}
Current Holding(qty): ${context.portfolio.positions.find(p => p.symbol === context.symbol)?.qty || 0}

[OPERATIONAL_CONTEXT-2026]
- Target Generational Value if symbol is STRATEGIC_PRIORITY and at <10% 52W range.
- Weight Geopolitical events heavily over short-term price noise.
- Synthesize all inputs and output your definitive strategy.` ;

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
