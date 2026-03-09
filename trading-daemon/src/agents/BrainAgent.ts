import { logAgentAction } from '../supabase';
import { aiBridge } from '../utils/AIBridge';

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
    async synthesize(context: BrainContext): Promise<{ action: 'BUY' | 'SELL' | 'HOLD'; reasoning: string; conviction: number }> {
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
PRICE: $${Number(context.technicals.currentPrice).toFixed(2)}
RANGE_52W: At ${(Number(context.situational.range52Week.percentOfRange) * 100).toFixed(1)}% of 52-Week Range [Low: $${Number(context.situational.range52Week.low).toFixed(2)}, High: $${Number(context.situational.range52Week.high).toFixed(2)}]
SOVEREIGN_TAG: ${context.situational.isSovereignPriority ? 'STRATEGIC_PRIORITY (BIO/ENERGY/DEFENSE)' : 'STANDARD'}

[MARKET_DATA]
RSI14: ${Number(context.technicals.rsi).toFixed(2)}
SMA50: ${Number(context.technicals.sma50).toFixed(2)}
MACRO_PULSE: ${context.pulse.macroSummary}
NEWS_SENTIMENT: ${(Number(context.pulse.newsSentiment) * 100).toFixed(0)}% Bullish

[GLOBAL_HEADLINES]
${context.newsHeadlines.map(h => `- ${h}`).join('\n')}

[PORTFOLIO_STATE]
Cash: $${Number(context.portfolio.cash).toFixed(2)}
Positions Count: ${context.portfolio.positions.length}
Current Holding(qty): ${context.portfolio.positions.find(p => p.symbol === context.symbol)?.qty || 0}

[OPERATIONAL_CONTEXT-2026]
- Target Generational Value if symbol is STRATEGIC_PRIORITY and at <10% 52W range.
- Weight Geopolitical events heavily over short-term price noise.
- Synthesize all inputs and output your definitive strategy.` ;

            const response = await aiBridge.request(userPrompt, {
                systemPrompt,
                responseMimeType: 'application/json',
                maxTokens: 1024
            });

            if (!response.success) {
                throw new Error(response.error);
            }

            const parsedResult = JSON.parse(response.text);
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
