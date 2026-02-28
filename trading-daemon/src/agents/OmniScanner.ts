import axios from 'axios';
import { supabase } from '../supabase';

const KEYS = {
    ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_KEY,
    FINNHUB: process.env.FINNHUB_KEY,
    MARKETSTACK: process.env.MARKETSTACK_KEY,
    TWELVEDATA: process.env.TWELVEDATA_KEY,
    NEWSAPI: process.env.NEWSAPI_KEY,
    NEWSDATA: process.env.NEWSDATA_KEY,
};

export interface GlobalPulse {
    newsSentiment: number;
    weatherRisk: number;
    trafficDensity: number;
    macroSummary: string;
    newsHeadlines: string[];
}

export class OmniScanner {
    // Aggregated Results
    private results: { [key: string]: any } = {};
    private seenNewsTitles = new Set<string>();

    async scanAll(symbols: string[]): Promise<any> {
        console.log(`[OmniScanner] Scanning batch of ${symbols.length}...`);

        // Dynamic News Query based on active stocks
        const contextQuery = symbols.length > 0 ? `(${symbols.slice(0, 3).join(' OR ')}) AND market` : 'stock market';

        await Promise.allSettled([
            ...symbols.map(sym => this.fetchAlphaVantage(sym)),
            ...symbols.map(sym => this.fetchFinnhub(sym)),
            ...symbols.map(sym => this.fetchMarketStack(sym)),
            ...symbols.map(sym => this.fetchTwelveData(sym)),
            this.fetchCoinGecko(),
            this.fetchNewsAPI(contextQuery),
            this.fetchNewsData(contextQuery),
            this.fetchOpenMeteo(),
            this.fetchADSB(),
            this.fetchSportsArb()
        ]);

        console.log(`[OmniScanner] Ingestion complete. Collected ${((this.results['GLOBAL_NEWS'] || []) as any[]).length} fresh news items.`);
        return this.results;
    }

    reset() {
        this.results = {};
        this.seenNewsTitles.clear();
    }

    getGlobalPulse(): GlobalPulse {
        const news = (this.results['GLOBAL_NEWS'] || []) as any[];
        const weather = this.results['NYC_CONTEXT'] || {};
        const adsb = this.results['FLIGHT_TRAFFIC_NYC'] || {};

        // 1. Synthesize Sentiment (Check for keywords in headlines)
        const headlines = news.map(n => (n.title || '')).filter(Boolean);
        const text = news.map(n => (n.title || n.description || '')).join(' ').toLowerCase();
        const bullish = (text.match(/surge|up|bull|gain|growth|positive|rally/g) || []).length;
        const bearish = (text.match(/drop|down|bear|loss|negative|crash|inflation/g) || []).length;

        // Sentiment range 0-1 (0.5 neutral)
        let newsSentiment = 0.5;
        if (bullish + bearish > 0) {
            newsSentiment = bullish / (bullish + bearish);
        }

        // 2. Weather Risk (Extreme temps or precipitation)
        const weatherRisk = (weather.precipitation > 0 || weather.temperature_2m > 35 || weather.temperature_2m < -5) ? 0.4 : 0.1;

        // 3. Traffic Density (Proxy for economic activity/logistics)
        const trafficDensity = (adsb.traffic_density_index || 250) / 500;

        return {
            newsSentiment,
            weatherRisk,
            trafficDensity,
            macroSummary: `Sentiment: ${newsSentiment > 0.6 ? 'Optimistic' : (newsSentiment < 0.4 ? 'Cautions' : 'Stable')} | Weather Risk: ${(weatherRisk * 100).toFixed(0)}% | Logistics: ${(trafficDensity * 100).toFixed(0)}%`,
            newsHeadlines: headlines
        };
    }

    private async logToStream(source: string, symbol_or_context: string, payload: any) {
        try {
            // News Aggregation Logic
            if (symbol_or_context === 'GLOBAL_NEWS' && Array.isArray(payload)) {
                const currentNews = this.results['GLOBAL_NEWS'] || [];
                // Filter duplicates by title
                const freshItems = payload.filter(item => {
                    const title = (item.title || '').trim().toLowerCase();
                    if (!title || this.seenNewsTitles.has(title)) return false;
                    this.seenNewsTitles.add(title);
                    return true;
                });
                this.results['GLOBAL_NEWS'] = [...currentNews, ...freshItems];
            } else {
                this.results[symbol_or_context] = payload;
                this.results[source] = payload;
            }

            // Maintain Supabase log for UI
            await supabase.from('live_api_streams').insert({ source, symbol_or_context, payload });
        } catch (e) {
            console.error(`[OmniScanner DB Error] ${source}`, e);
        }
    }

    // --- FINANCIAL APIs ---
    private async fetchAlphaVantage(symbol: string) {
        if (!KEYS.ALPHA_VANTAGE) return;
        try {
            const { data } = await axios.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${KEYS.ALPHA_VANTAGE}`);
            if (data && data['Global Quote']) {
                await this.logToStream('AlphaVantage', symbol, data['Global Quote']);
            }
        } catch (e) { }
    }

    private async fetchFinnhub(symbol: string) {
        if (!KEYS.FINNHUB) return;
        try {
            const { data } = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${KEYS.FINNHUB}`);
            await this.logToStream('Finnhub', symbol, data);
        } catch (e) { }
    }

    private async fetchMarketStack(symbol: string) {
        if (!KEYS.MARKETSTACK) return;
        try {
            const { data } = await axios.get(`https://api.marketstack.com/v2/eod/latest?access_key=${KEYS.MARKETSTACK}&symbols=${symbol}`);
            if (data && data.data && data.data.length > 0) {
                await this.logToStream('MarketStack', symbol, data.data[0]);
            }
        } catch (e) { }
    }

    private async fetchTwelveData(symbol: string) {
        if (!KEYS.TWELVEDATA) return;
        try {
            const { data } = await axios.get(`https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${KEYS.TWELVEDATA}`);
            if (data && data.datetime) {
                await this.logToStream('TwelveData', symbol, data);
            }
        } catch (e) { }
    }

    private async fetchCoinGecko() {
        try {
            const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
            await this.logToStream('CoinGecko', 'CRYPTO_MACRO', data);
        } catch (e) { }
    }

    // --- MACRO / ALTERNATIVE APIs ---
    private async fetchNewsAPI(query: string) {
        if (!KEYS.NEWSAPI) return;
        try {
            // sortBy=publishedAt ensures we get the LATEST news, not just "relevant" old news.
            const { data } = await axios.get(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${KEYS.NEWSAPI}&pageSize=10&sortBy=publishedAt&language=en`);
            await this.logToStream('NewsAPI', 'GLOBAL_NEWS', data.articles);
        } catch (e) { }
    }

    private async fetchNewsData(query: string) {
        if (!KEYS.NEWSDATA) return;
        try {
            const { data } = await axios.get(`https://newsdata.io/api/1/latest?apikey=${KEYS.NEWSDATA}&q=${encodeURIComponent(query)}&language=en`);
            await this.logToStream('NewsData.io', 'GLOBAL_NEWS', (data.results || []).slice(0, 10));
        } catch (e) { }
    }

    private async fetchOpenMeteo() {
        try {
            const { data } = await axios.get('https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m,precipitation,wind_speed_10m');
            await this.logToStream('OpenMeteo', 'NYC_CONTEXT', data.current);
        } catch (e) { }
    }

    private async fetchADSB() {
        try {
            await this.logToStream('ADSBexchange', 'FLIGHT_TRAFFIC_NYC', {
                "desc": "Simulated ADSB payload",
                "traffic_density_index": Math.floor(Math.random() * 500)
            });
        } catch (e) { }
    }

    private async fetchSportsArb() {
        try {
            const { data } = await axios.get('https://www.balldontlie.io/api/v1/games?per_page=5');
            await this.logToStream('balldontlie', 'SPORTS_ARB', data.data || []);
        } catch (e) { }
    }
}
