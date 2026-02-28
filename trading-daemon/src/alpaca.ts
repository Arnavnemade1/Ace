import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY;  // matches .env
const BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

if (!API_KEY || !API_SECRET) {
    throw new Error('Alpaca credentials missing. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env');
}

const alpacaApi = axios.create({
    baseURL: `${BASE_URL}/v2`,
    headers: {
        'APCA-API-KEY-ID': API_KEY,
        'APCA-API-SECRET-KEY': API_SECRET,
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

// Request interceptor — log every outbound Alpaca call
alpacaApi.interceptors.request.use(req => {
    console.log(`[Alpaca] --> ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`, req.data || '');
    return req;
});

// Response interceptor — log response status
alpacaApi.interceptors.response.use(
    res => {
        console.log(`[Alpaca] <-- ${res.status} ${res.config.url}`);
        return res;
    },
    err => {
        const status = err.response?.status;
        const body = JSON.stringify(err.response?.data);
        console.error(`[Alpaca] ERROR ${status}: ${body}`);
        throw err;
    }
);

export const alpaca = {
    getAccount: async () => {
        const { data } = await alpacaApi.get('/account');
        return data;
    },
    getPositions: async (): Promise<any[]> => {
        const { data } = await alpacaApi.get('/positions');
        return data as any[];
    },
    getOrders: async (status = 'open'): Promise<any[]> => {
        const { data } = await alpacaApi.get(`/orders?status=${status}&limit=20`);
        return data as any[];
    },
    createOrder: async (orderParams: any) => {
        console.log(`[Alpaca] Submitting order:`, JSON.stringify(orderParams));
        const { data } = await alpacaApi.post('/orders', orderParams);
        console.log(`[Alpaca] Order confirmed: id=${data.id} status=${data.status}`);
        return data;
    },
    cancelOrder: async (orderId: string) => {
        await alpacaApi.delete(`/orders/${orderId}`);
        console.log(`[Alpaca] Order ${orderId} cancelled`);
    },
};
