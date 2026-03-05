import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Activity, Award, Brain, Clock3, Crosshair, Flag, Globe, Radar, ShieldCheck, Skull, Sparkles, Target, TrendingUp } from "lucide-react";

interface Regime {
    regime_type: string;
    confidence: number;
    macro_factors: any;
    created_at: string;
}

interface AgentLifecycle {
    id: string;
    persona: string;
    status: "born" | "active" | "retired";
    regime_affinity: string;
    spawn_time: string;
    death_time: string | null;
    death_reason: string | null;
    task?: string;
    specialization?: string;
    created_at?: string;
}

const REGIME_COLORS: Record<string, string> = {
    "high-vol-reversion": "#f97316",
    "low-vol-trend": "#22c55e",
    "quiet-accumulation": "#38bdf8",
    "crisis-transition": "#ef4444",
    "commodity-supercycle": "#eab308",
};

const ICONS = [Brain, Target, TrendingUp, ShieldCheck, Radar, Sparkles, Crosshair, Globe];
const LINEUP_ROLES = ["Captain", "Co-Captain", "Tactical Lead", "Execution Lead", "Risk Anchor"];

function hashText(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function pickIcon(name: string, specialization?: string) {
    const idx = hashText(`${name}|${specialization || ""}`) % ICONS.length;
    return ICONS[idx] || Brain;
}

function parseMission(task?: string) {
    const mission = String(task || "").trim();
    const deliverable = mission.match(/Deliverable:\s*([^.]*)/i)?.[1]?.trim();
    const success = mission.match(/Success:\s*([^.]*)/i)?.[1]?.trim();
    const handoff = mission.match(/Handoff:\s*([^.]*)/i)?.[1]?.trim();
    const summary = mission.replace(/\s*Deliverable:.*$/i, "").trim() || "Adaptive mission assigned by the captain.";
    return { summary, deliverable, success, handoff };
}

function isGenericPersonaName(name?: string) {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return true;
    return /(momentum|intraday|trader|scalper|chaser|sniper|harvester|hunter|agent\s*\d*)/.test(n);
}

function personaLabel(agent: Pick<AgentLifecycle, "persona" | "id" | "regime_affinity" | "specialization">) {
    const original = String(agent.persona || "").trim();
    if (!isGenericPersonaName(original)) return original;

    const left = ["Vector", "Atlas", "Signal", "Pulse", "Flux", "Kernel", "Aegis", "Vertex"];
    const right = ["Protocol", "Relay", "Sentinel", "Circuit", "Ledger", "Forge", "Pilot", "Matrix"];
    const seed = hashText(`${agent.id}|${agent.regime_affinity}|${agent.specialization || ""}`);
    return `${left[seed % left.length]} ${right[(seed >> 3) % right.length]} ${agent.id.slice(0, 4).toUpperCase()}`;
}

function timeSince(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.max(1, Math.floor(ms / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

export default function RegimeDashboard() {
    const [currentRegime, setCurrentRegime] = useState<Regime | null>(null);
    const [agents, setAgents] = useState<AgentLifecycle[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [selectedAgentLogs, setSelectedAgentLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchingLogs, setFetchingLogs] = useState(false);

    useEffect(() => {
        const fetchState = async () => {
            const { data: regimeData } = await (supabase as any)
                .from("market_regimes")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
            if (regimeData) setCurrentRegime(regimeData as Regime);

            const { data: agentData } = await (supabase as any)
                .from("agent_lifecycles")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(30);
            if (agentData) setAgents(agentData as AgentLifecycle[]);
            setLoading(false);
        };

        fetchState();

        const regimeSub = supabase
            .channel("regime_updates")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_regimes" }, (payload) => {
                setCurrentRegime(payload.new as Regime);
            })
            .subscribe();

        const agentSub = supabase
            .channel("agent_updates")
            .on("postgres_changes", { event: "*", schema: "public", table: "agent_lifecycles" }, async () => {
                const { data } = await (supabase as any)
                    .from("agent_lifecycles")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(30);
                if (data) setAgents(data as AgentLifecycle[]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(regimeSub);
            supabase.removeChannel(agentSub);
        };
    }, []);

    const activeAgents = useMemo(
        () => agents.filter((a) => a.status !== "retired").sort((a, b) => new Date(b.spawn_time).getTime() - new Date(a.spawn_time).getTime()),
        [agents]
    );
    const retiredAgents = useMemo(
        () => agents.filter((a) => a.status === "retired").sort((a, b) => new Date(b.spawn_time).getTime() - new Date(a.spawn_time).getTime()).slice(0, 8),
        [agents]
    );

    useEffect(() => {
        if (selectedAgentId) return;
        if (activeAgents.length > 0) setSelectedAgentId(activeAgents[0].id);
        else if (retiredAgents.length > 0) setSelectedAgentId(retiredAgents[0].id);
    }, [activeAgents, retiredAgents, selectedAgentId]);

    const selectedAgent = useMemo(
        () => agents.find((a) => a.id === selectedAgentId) || null,
        [agents, selectedAgentId]
    );

    useEffect(() => {
        const fetchAgentLogs = async () => {
            if (!selectedAgent) return;
            setFetchingLogs(true);
            const { data } = await supabase
                .from("agent_logs")
                .select("*")
                .or(`agent_name.eq.${selectedAgent.persona},message.ilike.%${selectedAgent.persona}%`)
                .order("created_at", { ascending: false })
                .limit(6);
            setSelectedAgentLogs(data || []);
            setFetchingLogs(false);
        };
        fetchAgentLogs();
    }, [selectedAgent]);

    if (loading) {
        return <div className="h-64 flex items-center justify-center text-white/40">Loading lineup...</div>;
    }

    const regimeName = currentRegime?.regime_type?.replace(/-/g, " ").toUpperCase() || "UNKNOWN";
    const confidence = Math.round((currentRegime?.confidence || 0) * 100);
    const regimeColor = currentRegime ? REGIME_COLORS[currentRegime.regime_type] || "#22d3ee" : "#22d3ee";

    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#071019] via-[#06070b] to-[#11111a] p-6 md:p-10">
            <div className="pointer-events-none absolute -top-28 -left-20 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.35em] text-cyan-300/70">Oracle Franchise</p>
                    <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">Starting Lineup</h2>
                    <p className="mt-2 max-w-2xl text-sm text-white/55">
                        Live roster cards, with a full resume for each agent including mission mandate, deliverables, and execution trail.
                    </p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/45">Current Regime</div>
                    <div className="mt-1 flex items-center gap-3">
                        <span className="text-sm font-bold" style={{ color: regimeColor }}>{regimeName}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-white/75">{confidence}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${confidence}%`, backgroundColor: regimeColor }} />
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.22em] text-white/45">
                            <Award className="h-4 w-4 text-emerald-300" />
                            Active Five
                        </div>
                        <div className="text-xs font-mono text-white/40">{activeAgents.length} active</div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {activeAgents.slice(0, 6).map((agent, index) => {
                            const label = personaLabel(agent);
                            const Icon = pickIcon(label, agent.specialization);
                            const mission = parseMission(agent.task);
                            const isSelected = selectedAgentId === agent.id;
                            return (
                                <motion.button
                                    key={agent.id}
                                    whileHover={{ y: -4 }}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${isSelected ? "border-cyan-300/60 bg-cyan-500/10" : "border-white/10 bg-black/35 hover:border-white/25"}`}
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-white/60">
                                            {LINEUP_ROLES[index] || `Unit ${index + 1}`}
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            Ready
                                        </span>
                                    </div>
                                    <div className="mb-2 flex items-center gap-3">
                                        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                                            <Icon className="h-5 w-5 text-cyan-200" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="truncate text-lg font-bold text-white">{label}</h3>
                                            <p className="truncate text-xs text-white/45">{agent.specialization || "Adaptive market operations"}</p>
                                        </div>
                                    </div>
                                    <p className="line-clamp-2 text-sm text-white/70">{mission.summary}</p>
                                    <div className="mt-3 text-[11px] font-mono text-white/40">Tenure: {timeSince(agent.spawn_time)}</div>
                                </motion.button>
                            );
                        })}
                        {activeAgents.length === 0 && (
                            <div className="col-span-full rounded-2xl border border-white/10 bg-black/25 p-8 text-center text-white/35">
                                No active lineup available.
                            </div>
                        )}
                    </div>

                    <div className="mt-7">
                        <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.22em] text-white/45">
                            <Skull className="h-4 w-4 text-rose-300" />
                            Bench History
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {retiredAgents.map((agent) => {
                                const label = personaLabel(agent);
                                const isSelected = selectedAgentId === agent.id;
                                return (
                                    <button
                                        key={agent.id}
                                        onClick={() => setSelectedAgentId(agent.id)}
                                        className={`rounded-xl border px-4 py-3 text-left transition ${isSelected ? "border-rose-300/55 bg-rose-500/10" : "border-white/10 bg-black/25 hover:border-white/25"}`}
                                    >
                                        <div className="truncate text-sm font-bold text-white/80">{label}</div>
                                        <div className="mt-1 truncate text-xs text-white/45">{agent.death_reason || "Retired from rotation"}</div>
                                    </button>
                                );
                            })}
                            {retiredAgents.length === 0 && (
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/35">
                                    No retired members yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4">
                    <div className="sticky top-24 rounded-2xl border border-white/15 bg-black/45 p-5 backdrop-blur-md">
                        <div className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.22em] text-white/45">
                            <Flag className="h-4 w-4 text-cyan-300" />
                            Agent Resume
                        </div>

                        {!selectedAgent ? (
                            <div className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-white/35">
                                Select a lineup card to open the resume.
                            </div>
                        ) : (
                            <>
                                <div className="mb-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-4">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/45">{selectedAgent.status === "retired" ? "Retired" : "Starting Lineup"}</div>
                                    <h3 className="mt-1 text-xl font-black text-white">{personaLabel(selectedAgent)}</h3>
                                    <p className="mt-1 text-xs text-white/55">{selectedAgent.specialization || "Adaptive market operations"}</p>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <ResumeRow label="Regime Affinity" value={selectedAgent.regime_affinity.replace(/-/g, " ")} />
                                    <ResumeRow label="Joined" value={new Date(selectedAgent.spawn_time).toLocaleString()} />
                                    <ResumeRow label="Tenure" value={timeSince(selectedAgent.spawn_time)} />
                                </div>

                                <div className="my-4 h-px bg-white/10" />
                                <ResumeBlock icon={Target} title="Mission Statement" body={parseMission(selectedAgent.task).summary} />
                                <ResumeBlock icon={Activity} title="Deliverable" body={parseMission(selectedAgent.task).deliverable || "Not specified"} />
                                <ResumeBlock icon={ShieldCheck} title="Success Metric" body={parseMission(selectedAgent.task).success || "Not specified"} />
                                <ResumeBlock icon={Clock3} title="Handoff Chain" body={parseMission(selectedAgent.task).handoff || "Orchestrator"} />

                                <div className="my-4 h-px bg-white/10" />
                                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Recent Notes</div>
                                <div className="mt-2 space-y-2">
                                    {fetchingLogs && <div className="text-xs text-white/30">Loading notes...</div>}
                                    {!fetchingLogs && selectedAgentLogs.length === 0 && <div className="text-xs text-white/30">No recent notes available.</div>}
                                    {selectedAgentLogs.map((log, i) => (
                                        <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-2">
                                            <div className="text-[10px] font-mono text-cyan-200/70">{new Date(log.created_at).toLocaleTimeString()}</div>
                                            <div className="mt-1 line-clamp-2 text-xs text-white/70">{log.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ResumeRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">{label}</span>
            <span className="max-w-[58%] truncate text-right text-xs font-semibold text-white/85">{value}</span>
        </div>
    );
}

function ResumeBlock({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                <Icon className="h-3.5 w-3.5 text-cyan-200/80" />
                {title}
            </div>
            <p className="text-xs leading-relaxed text-white/75">{body}</p>
        </div>
    );
}
