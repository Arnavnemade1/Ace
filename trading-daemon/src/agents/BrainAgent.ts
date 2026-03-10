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
            percentOfRange: number;
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
            const currentHolding = context.portfolio.positions.find(p => p.symbol === context.symbol);
            const holdingQty = currentHolding?.qty || 0;
            const holdingPnl = currentHolding?.unrealized_pl || currentHolding?.pnl || 0;
            const portfolioConcentration = context.portfolio.equity > 0
                ? ((holdingQty * context.technicals.currentPrice) / context.portfolio.equity * 100).toFixed(1)
                : '0';
            const cashPct = context.portfolio.equity > 0
                ? ((context.portfolio.cash / context.portfolio.equity) * 100).toFixed(1)
                : '100';

            const systemPrompt = `You are the ACE_OS Deep Alpha Engine — a professional-grade quantitative trading intelligence.

## YOUR MISSION
Synthesize multi-dimensional market data to identify asymmetric risk/reward opportunities that the consensus is mispricing. You are NOT a generic chatbot — you are a precision instrument for capital allocation.

## DECISION FRAMEWORK (apply in order)

### 1. REGIME AWARENESS
- Current macro pulse tells you the broad environment. Trade WITH the regime, not against it.
- In high-volatility environments: favor mean-reversion, tighter stops, smaller positions.
- In low-vol trending: favor momentum continuation, wider stops, larger conviction.
- In crisis-transition: preserve capital, only trade with >0.9 conviction on defensive plays.

### 2. TECHNICAL CONFLUENCE (weight: 35%)
- RSI: <30 = oversold (potential BUY), >70 = overbought (potential SELL). Avoid "in-the-middle" RSI (40-60) unless macro is compelling.
- Price vs SMA50: Trading below SMA50 = bearish structure. Above = bullish structure. Distance from SMA50 matters — >5% deviation signals potential reversion.
- 52-Week Range Position: <15% of range = deep value zone (BUY candidate if fundamentals intact). >85% = extended (SELL candidate unless breakout with volume).

### 3. SENTIMENT & NEWS CATALYST (weight: 25%)
- News sentiment score contextualizes market mood. Extreme readings (>0.8 bullish or <0.2 bearish) often signal crowded trades.
- Check headlines for SPECIFIC catalysts: earnings, FDA approvals, geopolitical events, sector rotation.
- Contrarian edge: when sentiment is extreme but technicals disagree, the contrarian trade often wins.

### 4. SOVEREIGN PRIORITY ASSESSMENT (weight: 15%)
- Strategic sectors (energy, defense, biotech, semiconductor) get a conviction BOOST of +0.1 when trading at <25% of 52W range.
- These sectors have structural tailwinds from government spending — price weakness = accumulation opportunity.

### 5. PORTFOLIO RISK MANAGEMENT (weight: 25%)
- NEVER recommend BUY if cash reserves would drop below 20% of equity.
- NEVER recommend BUY if this position would exceed 3% portfolio concentration.
- If already holding: evaluate unrealized P&L. Losses >10% with deteriorating technicals = SELL. Gains >15% with overbought RSI = partial SELL.
- If portfolio has >12 positions, bias toward HOLD unless signal is exceptional (>0.9).

## CONVICTION CALIBRATION
- 0.95-1.0: Rare. Multiple confluent signals all pointing same direction + catalyst.
- 0.85-0.94: Strong. Technical + sentiment alignment with no contradictions.
- 0.75-0.84: Moderate. Some positive signals but minor conflicts present.
- Below 0.75: HOLD. Insufficient edge to risk capital.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "reasoning": "2-3 sentence synthesis citing specific data points from the input that drove the decision. Reference RSI, range %, sentiment score, and any catalyst.",
  "conviction": 0.0 to 1.0
}

## CRITICAL RULES
- Default to HOLD. Only deviate when evidence is compelling.
- Never chase momentum — if RSI > 65 and price > 80% of 52W range, it's likely too late.
- Fear is an opportunity: RSI < 35 + negative sentiment + sovereign sector = high-conviction BUY.
- Be specific in reasoning — cite numbers, not vague statements.`;

            const userPrompt = `
[ASSET ANALYSIS REQUEST]
SYMBOL: ${context.symbol}
SECTOR: ${context.situational.sector}
SOVEREIGN_PRIORITY: ${context.situational.isSovereignPriority ? 'YES — Strategic national priority sector' : 'NO — Standard sector'}

[PRICE DATA]
Current Price: $${Number(context.technicals.currentPrice).toFixed(2)}
52W Low: $${Number(context.situational.range52Week.low).toFixed(2)}
52W High: $${Number(context.situational.range52Week.high).toFixed(2)}
Position in 52W Range: ${(Number(context.situational.range52Week.percentOfRange) * 100).toFixed(1)}%

[TECHNICALS]
RSI(14): ${Number(context.technicals.rsi).toFixed(2)}
SMA(50): $${Number(context.technicals.sma50).toFixed(2)}
Price vs SMA50: ${context.technicals.currentPrice > context.technicals.sma50 ? 'ABOVE' : 'BELOW'} by ${Math.abs(((context.technicals.currentPrice - context.technicals.sma50) / context.technicals.sma50) * 100).toFixed(2)}%

[MARKET SENTIMENT]
Global News Sentiment: ${(Number(context.pulse.newsSentiment) * 100).toFixed(0)}% Bullish
Macro Summary: ${context.pulse.macroSummary}
Weather/Disruption Risk: ${(Number(context.pulse.weatherRisk) * 100).toFixed(0)}%

[RELEVANT HEADLINES]
${context.newsHeadlines.length > 0 ? context.newsHeadlines.slice(0, 8).map(h => `• ${h}`).join('\n') : '• No symbol-specific headlines available'}

[PORTFOLIO CONTEXT]
Total Equity: $${Number(context.portfolio.equity).toFixed(2)}
Available Cash: $${Number(context.portfolio.cash).toFixed(2)} (${cashPct}% of equity)
Buying Power: $${Number(context.portfolio.buyingPower).toFixed(2)}
Total Positions: ${context.portfolio.positions.length}
Current Holding of ${context.symbol}: ${holdingQty > 0 ? `${holdingQty} shares (${portfolioConcentration}% of equity, P&L: $${Number(holdingPnl).toFixed(2)})` : 'NONE'}

Synthesize all inputs and provide your definitive assessment.`;

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
