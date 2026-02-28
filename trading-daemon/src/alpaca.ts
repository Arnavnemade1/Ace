import Alpaca from '@alpacahq/alpaca-trade-api';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY;
const BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

if (!API_KEY || !API_SECRET) {
    throw new Error('Alpaca credentials missing');
}

export const alpaca = new Alpaca({
    keyId: API_KEY,
    secretKey: API_SECRET,
    paper: true,
    usePolygon: false
});
