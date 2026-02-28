import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY;
const BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

if (!API_KEY || !API_SECRET) {
    throw new Error('Alpaca credentials missing');
}

const alpacaApi = axios.create({
    baseURL: `${BASE_URL}/v2`,
    headers: {
        'APCA-API-KEY-ID': API_KEY,
        'APCA-API-SECRET-KEY': API_SECRET,
        'Content-Type': 'application/json'
    }
});

export const alpaca = {
    getAccount: async () => {
        const { data } = await alpacaApi.get('/account');
        return data;
    },
    getPositions: async () => {
        const { data } = await alpacaApi.get('/positions');
        return data as any[];
    },
    createOrder: async (orderParams: any) => {
        const { data } = await alpacaApi.post('/orders', orderParams);
        return data;
    }
};
