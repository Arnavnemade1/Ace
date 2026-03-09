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

const MODEL_STACK = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite'
];

export class AIBridge {
    private apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

    async request(userPrompt: string, options: AIRequestOptions = {}): Promise<AIResponse> {
        if (!this.apiKey) {
            return { text: '', modelUsed: 'none', success: false, error: 'No API Key found (GEMINI_API_KEY or LOVABLE_API_KEY)' };
        }

        let lastError = '';

        for (const model of MODEL_STACK) {
            try {
                return await this.executeWithRetry(model, userPrompt, options);
            } catch (error: any) {
                lastError = error.message;
                const status = error.response?.status;
                const isRateLimit = status === 429 || lastError.includes('429');
                const isServerWeight = status >= 500 || lastError.includes('500');

                if (isRateLimit || isServerWeight) {
                    console.warn(`[AIBridge] Model ${model} failed (${status || 'unknown'}). Falling back...`);
                    continue; // Try next model in stack
                }

                // If it's a context window or other terminal error, stop
                break;
            }
        }

        return { text: '', modelUsed: 'failed_stack', success: false, error: `All models in stack failed. Last error: ${lastError}` };
    }

    private async executeWithRetry(model: string, userPrompt: string, options: AIRequestOptions, retries = 2): Promise<AIResponse> {
        let delay = 1000;

        for (let i = 0; i <= retries; i++) {
            try {
                const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
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
                    timeout: 20000
                });

                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Empty response from AI');

                return { text, modelUsed: model, success: true };

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
}

export const aiBridge = new AIBridge();
