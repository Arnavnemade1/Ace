import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase Environment Variables');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function checkSupabaseConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('agent_logs')
            .select('id')
            .limit(1);
        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unknown error' };
    }
}

export async function logAgentAction(agent: string, type: 'info' | 'decision' | 'error' | 'learning' | 'trade' | 'warning', message: string, reasoning?: string, metadata?: any) {
    if (type === 'info' || type === 'learning') {
        // Drop low-priority logs to save database space and egress
        return;
    }

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

export async function getDirectiveConfig(): Promise<any> {
    try {
        const { data } = await supabase
            .from('agent_state')
            .select('config')
            .eq('agent_name', 'Orchestrator')
            .maybeSingle();
        return data?.config || {};
    } catch {
        return {};
    }
}
