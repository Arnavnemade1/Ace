import { useEffect, useMemo, useState } from "react";
import { Flame, Gauge, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { enablePushNotifications } from "@/lib/pwa/push";

type Mindset = "defensive" | "balanced" | "aggressive";

const TARGET_AGENTS = ["Swarm Orchestrator", "Orchestrator"];

const OPTIONS: Array<{
  value: Mindset;
  label: string;
  description: string;
  icon: typeof Shield;
  accent: string;
}> = [
  {
    value: "defensive",
    label: "Defensive",
    description: "Higher cash buffer, tighter conviction threshold, fewer open positions.",
    icon: Shield,
    accent: "text-emerald-300"
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Default profile with moderate sizing and diversification safeguards.",
    icon: Gauge,
    accent: "text-cyan-300"
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Larger position sizing with relaxed conviction threshold and faster rotation.",
    icon: Flame,
    accent: "text-amber-300"
  }
];

function normalizeMindset(value: unknown): Mindset {
  if (value === "defensive" || value === "aggressive") return value;
  return "balanced";
}

export default function SwarmMindsetControls() {
  const [currentMindset, setCurrentMindset] = useState<Mindset>("balanced");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [configByAgent, setConfigByAgent] = useState<Record<string, Record<string, any>>>({});

  const selected = useMemo(
    () => OPTIONS.find((item) => item.value === currentMindset) ?? OPTIONS[1],
    [currentMindset]
  );

  useEffect(() => {
    let alive = true;

    const syncFromDb = async () => {
      const { data, error } = await (supabase as any)
        .from("agent_state")
        .select("agent_name, config")
        .in("agent_name", TARGET_AGENTS);

      if (!alive) return;
      if (error) {
        toast({ title: "Mindset load failed", description: error.message });
        setLoading(false);
        return;
      }

      const mapped: Record<string, Record<string, any>> = {};
      for (const row of data || []) {
        mapped[row.agent_name] = (row.config || {}) as Record<string, any>;
      }

      setConfigByAgent(mapped);
      const incoming = mapped["Swarm Orchestrator"]?.operator_mindset ?? mapped["Orchestrator"]?.operator_mindset;
      setCurrentMindset(normalizeMindset(incoming));
      setLoading(false);
    };

    syncFromDb();

    const channel = supabase
      .channel("swarm-mindset-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_state" },
        (payload) => {
          if ((payload.new as any)?.agent_name !== "Swarm Orchestrator") return;
          const next = (payload.new as any)?.config?.operator_mindset;
          setCurrentMindset(normalizeMindset(next));
          setConfigByAgent((prev) => ({
            ...prev,
            "Swarm Orchestrator": { ...(prev["Swarm Orchestrator"] || {}), ...((payload.new as any)?.config || {}) }
          }));
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const updateMindset = async (next: Mindset) => {
    if (saving || next === currentMindset) return;

    setSaving(true);
    setCurrentMindset(next);
    const now = new Date().toISOString();

    const rows = TARGET_AGENTS.map((agentName) => {
      const baseConfig = configByAgent[agentName] || {};
      return {
        agent_name: agentName,
        metric_label: "operator mindset",
        metric_value: next,
        last_action: `Operator mindset set to ${next}`,
        last_action_at: now,
        updated_at: now,
        config: {
          ...baseConfig,
          operator_mindset: next,
          mindset_updated_at: now,
          control_source: "dashboard"
        }
      };
    });

    const { error } = await (supabase as any)
      .from("agent_state")
      .upsert(rows, { onConflict: "agent_name" });

    if (error) {
      setCurrentMindset(normalizeMindset(configByAgent["Swarm Orchestrator"]?.operator_mindset));
      toast({ title: "Mindset update failed", description: error.message });
      setSaving(false);
      return;
    }

    setConfigByAgent((prev) => {
      const nextMap = { ...prev };
      for (const name of TARGET_AGENTS) {
        nextMap[name] = {
          ...(nextMap[name] || {}),
          operator_mindset: next,
          mindset_updated_at: now,
          control_source: "dashboard"
        };
      }
      return nextMap;
    });

    toast({ title: "Swarm mindset updated", description: `${next[0].toUpperCase()}${next.slice(1)} profile is active.` });
    setSaving(false);
  };

  const onEnablePush = async () => {
    if (pushLoading) return;

    setPushLoading(true);
    const result = await enablePushNotifications();
    toast({ title: result.ok ? "Alerts enabled" : "Unable to enable alerts", description: result.message });
    setPushLoading(false);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Swarm Mindset</h3>
          <p className="mt-1 text-xs text-white/40">Push this profile to Supabase so orchestration behavior updates in real time.</p>
        </div>
        <button
          onClick={onEnablePush}
          disabled={pushLoading}
          type="button"
          className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-cyan-200 transition hover:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pushLoading ? "Enabling alerts..." : "Enable Push Alerts"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = currentMindset === option.value;
          return (
            <button
              key={option.value}
              onClick={() => updateMindset(option.value)}
              disabled={loading || saving}
              type="button"
              className={`rounded-xl border p-3 text-left transition ${
                isActive
                  ? "border-white/30 bg-white/10"
                  : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]"
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${option.accent}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-white">{option.label}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-white/50">{option.description}</p>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-white/35">
        Active profile: <span className={selected.accent}>{selected.label}</span>
      </p>
    </section>
  );
}
