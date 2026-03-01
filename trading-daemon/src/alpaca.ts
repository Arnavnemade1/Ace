import Alpaca from '@alpacahq/alpaca-trade-api';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET;
const BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

if (!API_KEY || !API_SECRET) {
    throw new Error('Alpaca credentials missing. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env');
}

// Initialize official SDK
const alpacaClient = new Alpaca({
    keyId: API_KEY,
    secretKey: API_SECRET,
    paper: BASE_URL.includes('paper'),
    usePolygon: false
});

/**
 * [x] Phase 31: Native Alpaca Integration
 * Standardized wrapper using the official Node.js SDK.
 */
export const alpaca = {
    getAccount: async () => {
        return await alpacaClient.getAccount();
    },
    getPositions: async (): Promise<any[]> => {
        return await alpacaClient.getPositions();
    },
    getOrders: async (status = 'open'): Promise<any[]> => {
        // Fix for lint error: provide full object or cast
        return await (alpacaClient as any).getOrders({ status, limit: 100 });
    },
    createOrder: async (orderParams: any) => {
        console.log(`[Alpaca] Submitting ${orderParams.side} ${orderParams.symbol} x${orderParams.qty}...`);
        return await (alpacaClient as any).createOrder(orderParams);
    },
    cancelOrder: async (orderId: string) => {
        await (alpacaClient as any).cancelOrder(orderId);
        console.log(`[Alpaca] Order ${orderId} cancelled`);
    },
    // Useful for discovery
    getAssets: async (status = 'active') => {
        return await (alpacaClient as any).getAssets({ status });
    },
    // [x] Phase 33: Historical Bars for Technical Analysis
    getBars: async (symbol: string, start: string, timeframe = '1Day', limit = 100) => {
        const bars: any[] = [];
        const resp = alpacaClient.getBarsV2(symbol, {
            start,
            timeframe,
            limit
        });
        for await (const b of resp) {
            bars.push(b);
        }
        return bars;
    }
};
