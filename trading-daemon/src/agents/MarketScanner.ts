import axios from 'axios';
import { logAgentAction } from '../supabase';

export class MarketScanner {
    private alphaVantageKey = process.env.ALPHA_VANTAGE_KEY;
    private finnhubKey = process.env.FINNHUB_KEY;
    private newsDataKey = process.env.NEWSDATA_KEY;

    async scanEquities(symbols: string[]) {
        await logAgentAction('Market Scanner', 'info', `Scanning equities using Alpha Vantage & Finnhub: ${symbols.join(', ')}`);

        const marketData = [];

        for (const sym of symbols) {
            try {
                // Simple Finnhub quote for current price
                const res = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${this.finnhubKey}`);

                if (res.data && res.data.c !== undefined) {
                    marketData.push({
                        symbol: sym,
                        price: res.data.c,
                        high: res.data.h,
                        low: res.data.l,
                        open: res.data.o,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err: any) {
                await logAgentAction('Market Scanner', 'error', `Finnhub fetch failed for ${sym}: ${err.message}`);
            }
            // Delay to avoid strict rate limits (Finnhub allows 60/min free)
            await new Promise(r => setTimeout(r, 1000));
        }

        return marketData;
    }

    async fetchMacroIntel() {
        await logAgentAction('Market Scanner', 'info', 'Fetching Macro Intel (Weather, News)');

        const intel: any = { sentiment: 'neutral', news: [], weather: {} };

        // Fetch NewsData
        try {
            const newsRes = await axios.get(`https://newsdata.io/api/1/latest?apikey=${this.newsDataKey}&q=finance OR market OR economy&language=en`);
            if (newsRes.data && newsRes.data.results) {
                intel.news = newsRes.data.results.slice(0, 5).map((n: any) => n.title);
                // Extremely basic sentiment logic: check title words
                const text = intel.news.join(' ').toLowerCase();
                const bullish = (text.match(/surge|up|bull|gain|positive|growth/g) || []).length;
                const bearish = (text.match(/drop|down|bear|loss|negative|crash/g) || []).length;
                intel.sentiment = bullish > bearish ? 'bullish' : (bearish > bullish ? 'bearish' : 'neutral');
            }
        } catch (err: any) {
            await logAgentAction('Market Scanner', 'error', `NewsData fetch failed: ${err.message}`);
        }

        // Fetch weather (NYC proxy for market)
        try {
            const weatherRes = await axios.get('https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m,precipitation');
            if (weatherRes.data && weatherRes.data.current) {
                intel.weather = {
                    temp: weatherRes.data.current.temperature_2m,
                    rain: weatherRes.data.current.precipitation
                };
            }
        } catch (err: any) {
            await logAgentAction('Market Scanner', 'error', `Weather fetch failed: ${err.message}`);
        }

        return intel;
    }
}
