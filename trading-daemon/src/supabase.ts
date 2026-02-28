import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase Environment Variables');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function logAgentAction(agent: string, type: 'info' | 'decision' | 'error' | 'learning' | 'trade', message: string, reasoning?: string, metadata?: any) {
    try {
        const { error } = await supabase
            .from('agent_logs')
            .insert({
                agent_name: agent,
                log_type: type,
                message,
                reasoning,
                metadata: metadata || {}
            });

        if (error) {
            console.error(`[${agent}] Failed to insert log to Supabase:`, error);
        }
    } catch (err) {
        console.error(`[${agent}] Failed to log to Supabase:`, err);
    }
}
