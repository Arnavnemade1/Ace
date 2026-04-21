// Shared AI helper — triple fallback: Gemini → Lovable AI → OpenRouter Llama
// Aggressively token-optimized: low maxTokens, low temperature, JSON-only.

export interface AIOpts {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"]; // cheapest first

export async function callAI(
  prompt: string,
  opts: AIOpts = {},
): Promise<string> {
  const { maxTokens = 768, temperature = 0.3, jsonMode = true } = opts;
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";

  // 1) Gemini direct (cheapest models first)
  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                ...(jsonMode ? { responseMimeType: "application/json" } : {}),
                temperature,
                maxOutputTokens: maxTokens,
              },
            }),
          },
        );
        if (r.ok) {
          const d = await r.json();
          const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
          if (t) return t;
        } else if (r.status === 429 || r.status >= 500) {
          continue; // try next model
        } else {
          break; // hard error, go to next provider
        }
      } catch (_e) { /* try next */ }
    }
  }

  // 2) Lovable AI gateway
  if (lovableKey) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const c = d.choices?.[0]?.message?.content;
        if (c) return c;
      }
    } catch (_e) { /* fall through */ }
  }

  // 3) OpenRouter Llama 3.3 70B free
  if (openrouterKey) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: jsonMode
          ? [
              { role: "system", content: "You MUST respond with ONLY valid JSON. No prose, no markdown fences." },
              { role: "user", content: prompt },
            ]
          : [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!r.ok) throw new Error(`All AI providers failed (OpenRouter ${r.status})`);
    const d = await r.json();
    let c = d.choices?.[0]?.message?.content || "";
    if (jsonMode) {
      // Strip markdown fences if Llama added them
      c = c.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    }
    return c || (jsonMode ? "{}" : "");
  }

  throw new Error("No AI provider keys configured");
}

export function safeJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract first JSON object
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* ignore */ }
    }
    return fallback;
  }
}
