import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";

export const FinsComposition = ({ 
    title, 
    ticker, 
    sentiment, 
    agentInsights,
    policyOutcome,
    confidence
}: { 
    title: string; 
    ticker: string;
    sentiment?: string;
    agentInsights?: string[];
    policyOutcome?: string;
    confidence?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animations
  const entrance = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [0, 40], [20, 0], { extrapolateRight: "clamp" });
  
  // Aurora Moving Background
  const moveX = interpolate(Math.sin(frame / 60), [-1, 1], [-15, 15]);
  const moveY = interpolate(Math.cos(frame / 45), [-1, 1], [-10, 10]);

  // Dynamic colors based on sentiment
  const sentimentColor = sentiment === "positive" ? "#4ade80" : sentiment === "negative" ? "#f87171" : "#94a3b8";
  const glowColor = sentiment === "positive" ? "rgba(74, 222, 128, 0.15)" : sentiment === "negative" ? "rgba(248, 113, 113, 0.15)" : "rgba(148, 163, 184, 0.15)";

  // Policy Entrance
  const policyEntrance = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="bg-[#020202] overflow-hidden font-sans">
      {/* Aurora Background Views */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
            background: `radial-gradient(circle at ${50 + moveX}% ${30 + moveY}%, rgba(139, 92, 246, 0.3) 0%, transparent 70%),
                         radial-gradient(circle at ${30 - moveX}% ${70 - moveY}%, rgba(74, 222, 128, 0.2) 0%, transparent 60%),
                         radial-gradient(circle at ${80 + moveX}% ${80 + moveY}%, rgba(236, 72, 153, 0.2) 0%, transparent 60%)`,
            filter: "blur(80px)"
        }}
      />
      
      {/* Content Container */}
      <div className="relative z-10 flex flex-col justify-between h-full p-24">
        
        {/* Top Header in Video */}
        <header className="flex justify-between items-start" style={{ opacity: entrance }}>
            <div className="space-y-1">
                <div className="text-[10px] font-mono tracking-[0.5em] text-white/30 uppercase font-bold">Network Confidence</div>
                <div className="text-4xl font-black text-white">{(confidence || 0.85).toFixed(2)}</div>
            </div>
            <div className="text-right space-y-1">
                <div className="text-[10px] font-mono tracking-[0.5em] text-white/30 uppercase font-bold">Security Identifier</div>
                <div className="text-4xl font-black" style={{ color: sentimentColor }}>${ticker}</div>
            </div>
        </header>

        {/* Center Content: Large Title & Insights */}
        <main className="flex flex-col gap-12" style={{ transform: `translateY(${textY}px)`, opacity: entrance }}>
            <h1 className="text-9xl font-black tracking-tight leading-[0.85] text-white max-w-6xl">
                {title.length > 50 ? title.slice(0, 50) + "..." : title}
            </h1>

            <div className="flex gap-12">
                <div className="flex-1 space-y-4">
                    <div className="text-[10px] font-mono tracking-[0.5em] text-white/40 uppercase font-bold">Neural Findings</div>
                    <div className="space-y-2">
                        {(agentInsights || [
                            "Identified material clusters in SEC disclosure.",
                            "Cross-referencing cautionary language with benchmarks.",
                            "Processing narrative tone against sector peers."
                        ]).map((insight, i) => (
                            <div 
                                key={i} 
                                className="text-lg text-white/60 font-light italic leading-snug border-l-2 border-white/10 pl-6"
                                style={{ opacity: interpolate(frame, [20 + i * 10, 50 + i * 10], [0, 1], { extrapolateRight: "clamp" }) }}
                            >
                                "{insight}"
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-[300px] space-y-4" style={{ opacity: policyEntrance }}>
                    <div className="text-[10px] font-mono tracking-[0.5em] text-white/40 uppercase font-bold">Policy Outcome</div>
                    <div className="p-8 border border-white/10 bg-white/[0.03] backdrop-blur-md">
                        <div className="text-2xl font-black text-white uppercase tracking-tighter">
                            {policyOutcome || "HOLD_BASELINE"}
                        </div>
                    </div>
                </div>
            </div>
        </main>

        {/* Bottom Footer in Video */}
        <footer className="flex justify-between items-end" style={{ opacity: entrance }}>
            <div className="flex items-center gap-12">
                <div className="text-[10px] font-mono tracking-[0.5em] text-white/20 uppercase">ACE_FINS_PROTOCOL_v2.4</div>
                <div className="h-0.5 w-64 bg-white/5 relative">
                    <div 
                        className="absolute top-0 h-full bg-white/20"
                        style={{ width: `${(frame / durationInFrames) * 100}%` }}
                    />
                </div>
            </div>
            <div className="text-[10px] font-mono tracking-[0.5em] text-white/20 uppercase">
                Synchronized // {new Date().toLocaleDateString()}
            </div>
        </footer>
      </div>

      {/* Subtle Noise */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
    </AbsoluteFill>
  );
};
