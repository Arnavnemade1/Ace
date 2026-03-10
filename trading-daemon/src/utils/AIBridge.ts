import axios from 'axios';

export interface AIRequestOptions {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    responseMimeType?: string;
}

export type AIResponse = {
    text: string;
    modelUsed: string;
    success: boolean;
    error?: string;
};

// Gemini model fallback stack (direct API)
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite'
];

// OpenRouter Llama fallback
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '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';

export class AIBridge {
    private geminiKey = process.env.GEMINI_API_KEY;
    private lovableKey = process.env.LOVABLE_API_KEY;
    private geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    private lovableBaseUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';

    async request(userPrompt: string, options: AIRequestOptions = {}): Promise<AIResponse> {
        // Strategy 1: Try Lovable AI Gateway first (if key exists)
        if (this.lovableKey) {
            try {
                const result = await this.callLovableAI(userPrompt, options);
                if (result.success) return result;
            } catch (e: any) {
                console.warn(`[AIBridge] Lovable AI failed: ${e.message}. Falling back to Gemini...`);
            }
        }

        // Strategy 2: Try Gemini direct API with model fallback stack
        if (this.geminiKey) {
            const geminiResult = await this.callGeminiStack(userPrompt, options);
            if (geminiResult.success) return geminiResult;
            console.warn(`[AIBridge] All Gemini models failed. Falling back to OpenRouter...`);
        }

        // Strategy 3: OpenRouter Llama 3.3 70B (free tier)
        try {
            const result = await this.callOpenRouter(userPrompt, options);
            if (result.success) return result;
        } catch (e: any) {
            console.error(`[AIBridge] OpenRouter also failed: ${e.message}`);
        }

        return { text: '', modelUsed: 'all_failed', success: false, error: 'All AI providers failed (Lovable, Gemini, OpenRouter).' };
    }

    // ── Lovable AI Gateway ──
    private async callLovableAI(userPrompt: string, options: AIRequestOptions): Promise<AIResponse> {
        const messages: any[] = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });

        const body: any = {
            model: 'google/gemini-2.5-flash',
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2048,
        };

        // For JSON output, instruct via system prompt (Lovable gateway uses OpenAI-compatible API)
        if (options.responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }

        const response = await axios.post(this.lovableBaseUrl, body, {
            headers: {
                'Authorization': `Bearer ${this.lovableKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        const text = response.data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Lovable AI');

        return { text, modelUsed: 'lovable/gemini-2.5-flash', success: true };
    }

    // ── Gemini Direct API with model cascade ──
    private async callGeminiStack(userPrompt: string, options: AIRequestOptions): Promise<AIResponse> {
        let lastError = '';

        for (const model of GEMINI_MODELS) {
            try {
                return await this.callGeminiDirect(model, userPrompt, options);
            } catch (error: any) {
                lastError = error.message;
                const status = error.response?.status;
                const isRateLimit = status === 429 || lastError.includes('429');
                const isServerError = status >= 500 || lastError.includes('500');

                if (isRateLimit || isServerError) {
                    console.warn(`[AIBridge] Gemini ${model} failed (${status || 'unknown'}). Trying next...`);
                    continue;
                }
                break; // Terminal error (auth, context window, etc.)
            }
        }

        return { text: '', modelUsed: 'gemini_stack_failed', success: false, error: lastError };
    }

    private async callGeminiDirect(model: string, userPrompt: string, options: AIRequestOptions, retries = 2): Promise<AIResponse> {
        let delay = 1000;

        for (let i = 0; i <= retries; i++) {
            try {
                const url = `${this.geminiBaseUrl}/${model}:generateContent?key=${this.geminiKey}`;
                const payload = {
                    contents: [{
                        role: 'user',
                        parts: [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${userPrompt}` : userPrompt }]
                    }],
                    generationConfig: {
                        temperature: options.temperature ?? 0.7,
                        maxOutputTokens: options.maxTokens ?? 2048,
                        responseMimeType: options.responseMimeType ?? 'text/plain'
                    }
                };

                const response = await axios.post(url, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 25000
                });

                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Empty response from Gemini');

                return { text, modelUsed: `gemini/${model}`, success: true };

            } catch (error: any) {
                const status = error.response?.status;
                const is429 = status === 429 || error.message?.includes('429');

                if (is429 && i < retries) {
                    console.log(`[AIBridge] ${model} hit 429. Retry ${i + 1}/${retries} after ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`Execution failed for ${model} after ${retries} retries`);
    }

    // ── OpenRouter Llama 3.3 70B (free fallback) ──
    private async callOpenRouter(userPrompt: string, options: AIRequestOptions): Promise<AIResponse> {
        const messages: any[] = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }

        // For JSON mode, reinforce in user prompt
        const finalPrompt = options.responseMimeType === 'application/json'
            ? `${userPrompt}\n\nIMPORTANT: Respond with valid JSON only, no markdown or extra text.`
            : userPrompt;
        messages.push({ role: 'user', content: finalPrompt });

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: OPENROUTER_MODEL,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2048,
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://ace-os.lovable.app',
                'X-Title': 'ACE_OS Trading System',
            },
            timeout: 45000,
        });

        let text = response.data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from OpenRouter');

        // Clean markdown wrapping if JSON expected
        if (options.responseMimeType === 'application/json') {
            text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        }

        return { text, modelUsed: `openrouter/${OPENROUTER_MODEL}`, success: true };
    }
}

export const aiBridge = new AIBridge();
