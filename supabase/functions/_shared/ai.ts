// Shared AI helper — triple fallback: Gemini → Lovable AI → OpenRouter Llama
// Aggressively token-optimized + daily budget hard-stop persisted in agent_logs.metadata.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AIOpts {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  agent?: string; // for budget accounting
}

const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

// Daily global budget across ALL providers/agents. Override via AI_DAILY_TOKEN_BUDGET env.
const DAILY_BUDGET = Number(Deno.env.get("AI_DAILY_TOKEN_BUDGET") || 200_000);
const BUDGET_MARKER = "ai_token_budget";

// In-memory cooldowns + cache (per cold start)
const cooldown: Record<string, number> = {};
const COOLDOWN_MS = 5 * 60 * 1000;
const cache = new Map<string, { text: string; exp: number }>();
const CACHE_TTL = 8 * 60 * 1000;

// Local memo of today's usage to avoid querying every call
let usageMemo: { day: string; tokens: number; loadedAt: number } | null = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function estTokens(s: string) {
  // ~4 chars per token heuristic
  return Math.ceil((s || "").length / 4);
}

function hashKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

function getSb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  try { return createClient(url, key); } catch { return null; }
}

async function loadUsage(): Promise<number> {
  const day = todayKey();
  if (usageMemo && usageMemo.day === day && Date.now() - usageMemo.loadedAt < 60_000) {
    return usageMemo.tokens;
  }
  const sb = getSb();
  if (!sb) { usageMemo = { day, tokens: 0, loadedAt: Date.now() }; return 0; }
  try {
    const start = `${day}T00:00:00.000Z`;
    const { data } = await sb
      .from("agent_logs")
      .select("metadata")
      .eq("agent_name", BUDGET_MARKER)
      .gte("created_at", start)
      .limit(1000);
    const total = (data || []).reduce((sum: number, row: any) => {
      const t = Number(row?.metadata?.tokens || 0);
      return sum + (Number.isFinite(t) ? t : 0);
    }, 0);
    usageMemo = { day, tokens: total, loadedAt: Date.now() };
    return total;
  } catch {
    usageMemo = { day, tokens: 0, loadedAt: Date.now() };
    return 0;
  }
}

async function recordUsage(agent: string, provider: string, tokens: number) {
  const day = todayKey();
  if (!usageMemo || usageMemo.day !== day) usageMemo = { day, tokens: 0, loadedAt: Date.now() };
  usageMemo.tokens += tokens;
  const sb = getSb();
  if (!sb) return;
  try {
    await sb.from("agent_logs").insert({
      agent_name: BUDGET_MARKER,
      log_type: "info",
      message: `${agent} via ${provider} ~${tokens}t`,
      metadata: { tokens, agent, provider, day },
    });
  } catch { /* ignore */ }
}

export async function getDailyTokenUsage() {
  const used = await loadUsage();
  return { used, budget: DAILY_BUDGET, remaining: Math.max(0, DAILY_BUDGET - used) };
}

export async function callAI(prompt: string, opts: AIOpts = {}): Promise<string> {
  const { maxTokens = 512, temperature = 0.3, jsonMode = true, agent = "unknown" } = opts;

  // 1) Cache hit
  const ck = hashKey(`${maxTokens}|${temperature}|${jsonMode}|${prompt}`);
  const c = cache.get(ck);
  if (c && c.exp > Date.now()) return c.text;

  // 2) Budget hard-stop (estimate input + reserved output before spending)
  const estCost = estTokens(prompt) + maxTokens;
  const used = await loadUsage();
  if (used + estCost > DAILY_BUDGET) {
    throw new Error(`AI daily budget reached (${used}/${DAILY_BUDGET}); skipped ${agent}`);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";

  const tryFinish = async (provider: string, text: string) => {
    cache.set(ck, { text, exp: Date.now() + CACHE_TTL });
    const spent = estTokens(prompt) + estTokens(text);
    await recordUsage(agent, provider, spent);
    return text;
  };

  // Provider 1: Gemini direct
  if (geminiKey && (cooldown["gemini"] || 0) < Date.now()) {
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
          if (t) return await tryFinish("gemini", t);
        } else if (r.status === 429 || r.status === 402) {
          cooldown["gemini"] = Date.now() + COOLDOWN_MS;
          break;
        } else if (r.status >= 500) {
          continue;
        } else {
          break;
        }
      } catch { /* try next model */ }
    }
  }

  // Provider 2: Lovable AI gateway
  if (lovableKey && (cooldown["lovable"] || 0) < Date.now()) {
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
        const c2 = d.choices?.[0]?.message?.content;
        if (c2) return await tryFinish("lovable", c2);
      } else if (r.status === 429 || r.status === 402) {
        cooldown["lovable"] = Date.now() + COOLDOWN_MS;
      }
    } catch { /* fall through */ }
  }

  // Provider 3: OpenRouter Llama 3.3 70B free
  if (openrouterKey && (cooldown["openrouter"] || 0) < Date.now()) {
    try {
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
      if (r.ok) {
        const d = await r.json();
        let c3 = d.choices?.[0]?.message?.content || "";
        if (jsonMode) c3 = c3.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        if (c3) return await tryFinish("openrouter", c3);
      } else if (r.status === 429 || r.status === 402) {
        cooldown["openrouter"] = Date.now() + COOLDOWN_MS;
      }
    } catch { /* fall through */ }
  }

  throw new Error("All AI providers failed (Gemini → Lovable → OpenRouter)");
}

export function safeJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* ignore */ }
    }
    return fallback;
  }
}
