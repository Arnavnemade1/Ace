import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { enablePushNotifications } from "@/lib/pwa/push";

type Mindset = "defensive" | "balanced" | "aggressive";

const TARGET_AGENTS = ["Swarm Orchestrator", "Orchestrator"];

const OPTIONS: Array<{
  value: Mindset;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    value: "defensive",
    label: "Defensive",
    description: "Higher cash buffer, tighter conviction threshold, fewer open positions.",
    accent: "text-[#93d24a]"
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Default profile with moderate sizing and diversification safeguards.",
    accent: "text-[#d8c3a5]"
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Larger position sizing with relaxed conviction threshold and faster rotation.",
    accent: "text-[#ff8362]"
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
      const { data, error } = await (supabase as any).from("agent_state").select("agent_name, config").in("agent_name", TARGET_AGENTS);
      if (!alive) return;
      if (error) {
        toast({ title: "Mindset load failed", description: error.message });
        setLoading(false);
        return;
      }
      const mapped: Record<string, Record<string, any>> = {};
      for (const row of data || []) mapped[row.agent_name] = (row.config || {}) as Record<string, any>;
      setConfigByAgent(mapped);
      const incoming = mapped["Swarm Orchestrator"]?.operator_mindset ?? mapped["Orchestrator"]?.operator_mindset;
      setCurrentMindset(normalizeMindset(incoming));
      setLoading(false);
    };
    syncFromDb();

    const channel = supabase.channel("swarm-mindset-sync").on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_state" }, (payload) => {
      if ((payload.new as any)?.agent_name !== "Swarm Orchestrator") return;
      const next = (payload.new as any)?.config?.operator_mindset;
      setCurrentMindset(normalizeMindset(next));
      setConfigByAgent((prev) => ({ ...prev, "Swarm Orchestrator": { ...(prev["Swarm Orchestrator"] || {}), ...((payload.new as any)?.config || {}) } }));
    }).subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
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
        config: { ...baseConfig, operator_mindset: next, mindset_updated_at: now, control_source: "dashboard" }
      };
    });

    const { error } = await (supabase as any).from("agent_state").upsert(rows, { onConflict: "agent_name" });
    if (error) {
      setCurrentMindset(normalizeMindset(configByAgent["Swarm Orchestrator"]?.operator_mindset));
      toast({ title: "Mindset update failed", description: error.message });
      setSaving(false);
      return;
    }
    setConfigByAgent((prev) => {
      const nextMap = { ...prev };
      for (const name of TARGET_AGENTS) nextMap[name] = { ...(nextMap[name] || {}), operator_mindset: next, mindset_updated_at: now, control_source: "dashboard" };
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
    <section className="bg-[#020202] border border-white/5 p-8 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase font-bold italic">// Orchestration Logic</div>
          <h3 className="text-3xl font-display font-black tracking-tighter uppercase">Swarm Mindset</h3>
          <p className="text-[11px] text-white/30 tracking-wide uppercase max-w-sm">Push a profile to the neural collective to update orchestration behavior in real time.</p>
        </div>
        <button
          onClick={onEnablePush}
          disabled={pushLoading}
          className="px-6 py-3 border border-white/10 text-[9px] font-mono tracking-[0.3em] uppercase hover:bg-white/5 transition-all disabled:opacity-20"
        >
          {pushLoading ? "ENABLING_ALERTS..." : "ENABLE_PUSH_ALERTS"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const isActive = currentMindset === option.value;
          return (
            <button
              key={option.value}
              onClick={() => updateMindset(option.value)}
              disabled={loading || saving}
              className={`p-6 border text-left transition-all space-y-4 ${
                isActive ? "border-[#d8c3a5] bg-[#d8c3a5]/5" : "border-white/5 bg-white/[0.01] hover:border-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-black uppercase tracking-widest ${isActive ? "text-white" : "text-white/40"}`}>{option.label}</span>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#d8c3a5] shadow-[0_0_8px_#d8c3a5]" />}
              </div>
              <p className="text-[11px] leading-relaxed text-white/30 tracking-tight uppercase">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="pt-6 border-t border-white/[0.03] flex items-center justify-between">
        <div className="text-[10px] font-mono tracking-[0.4em] text-white/10 uppercase italic">
          Active_Profile // <span className={selected.accent}>{selected.label}</span>
        </div>
        <div className="text-[9px] font-mono text-white/5 uppercase tracking-[0.2em]">
          Mode: {saving ? "WRITING_TO_POSTGRES..." : "PERSISTENT_SYNC"}
        </div>
      </div>
    </section>
  );
}
