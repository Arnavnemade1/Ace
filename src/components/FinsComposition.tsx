import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";
import { motion } from "framer-motion";

export const FinsComposition = ({ 
    title, 
    summary, 
    ticker, 
    sentiment, 
    confidence, 
    agents 
}: { 
    title: string; 
    summary: string; 
    ticker: string;
    sentiment?: string;
    confidence?: number;
    agents?: string[];
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Animations
  const spr = spring({ frame, fps, stiffness: 100, damping: 20 });
  const entrance = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const textBlur = interpolate(frame, [0, 40], [20, 0], { extrapolateRight: "clamp" });
  
  // Background pulse
  const pulse = interpolate(Math.sin(frame / 20), [-1, 1], [0.8, 1.2]);

  // Dynamic colors
  const accentColor = sentiment === "positive" ? "#93d24a" : sentiment === "negative" ? "#ff8362" : "#d8c3a5";
  const glowColor = sentiment === "positive" ? "rgba(147,210,74,0.3)" : sentiment === "negative" ? "rgba(255,131,98,0.3)" : "rgba(216,195,165,0.3)";

  return (
    <AbsoluteFill className="bg-[#020202] overflow-hidden">
      {/* Dynamic Background Glow */}
      <div 
        className="absolute inset-0 opacity-40 blur-[160px]"
        style={{
            background: `radial-gradient(circle at 50% 50%, ${glowColor} 0%, transparent 70%)`,
            transform: `scale(${pulse})`
        }}
      />

      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative z-10 p-24 h-full flex flex-col justify-between">
        <header className="flex justify-between items-start">
            <div 
                className="space-y-2"
                style={{ opacity: entrance, transform: `translateX(${interpolate(frame, [0, 30], [-20, 0], { extrapolateRight: "clamp" })}px)` }}
            >
                <div className="text-[10px] font-mono tracking-[0.6em] text-white/30 uppercase italic">
                    // FINS_NEURAL_RECAP_ACTIVE
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 border border-white/20 bg-white/5 flex items-center justify-center">
                        <span className="text-3xl font-black font-display text-white">{ticker.slice(0, 1)}</span>
                    </div>
                    <div className="text-5xl font-black font-display text-white tracking-tighter">
                        {ticker}
                    </div>
                </div>
            </div>

            <div 
                className="text-right space-y-4"
                style={{ opacity: entrance }}
            >
                <div className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase">Network Confidence</div>
                <div 
                    className="text-6xl font-black font-display tracking-tighter"
                    style={{ color: accentColor, textShadow: `0 0 40px ${glowColor}` }}
                >
                    {(confidence || 0.85).toFixed(2)}
                </div>
            </div>
        </header>

        <main className="max-w-5xl space-y-10">
            <div 
                className="space-y-4"
                style={{ 
                    opacity: entrance, 
                    filter: `blur(${textBlur}px)`,
                    transform: `translateY(${interpolate(frame, [0, 40], [40, 0], { extrapolateRight: "clamp" })}px)`
                }}
            >
                <div 
                    className="text-sm font-mono tracking-[0.4em] uppercase"
                    style={{ color: accentColor }}
                >
                    Filing Interpretation Summary
                </div>
                <h1 className="text-8xl font-black font-display tracking-tighter leading-[0.85] uppercase text-white">
                    {title}
                </h1>
            </div>

            <p 
                className="text-3xl text-white/50 font-light leading-snug max-w-4xl italic"
                style={{ opacity: interpolate(frame, [20, 50], [0, 1], { extrapolateRight: "clamp" }) }}
            >
                "{summary}"
            </p>
        </main>

        <footer className="flex justify-between items-end">
            <div 
                className="flex gap-20"
                style={{ opacity: entrance }}
            >
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Active Agents</div>
                    <div className="flex gap-4">
                        {(agents || ["FilingStructurer", "RiskEvaluator", "SentimentAnalyst"]).map((agent, i) => (
                            <div key={agent} className="px-3 py-1 border border-white/10 bg-white/[0.02] text-[10px] font-mono text-white/40">
                                {agent}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-6 text-[10px] font-mono text-white/20 tracking-[0.5em] uppercase">
                <div className="h-0.5 w-40 bg-white/5 relative">
                    <div 
                        className="absolute top-0 h-full bg-white/20"
                        style={{ width: `${(frame / durationInFrames) * 100}%` }}
                    />
                </div>
                <span>Frame_{frame}</span>
            </div>
        </footer>
      </div>

      {/* Cinematic Overlays */}
      <div className="absolute inset-0 pointer-events-none border-[40px] border-black/20" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-transparent to-black opacity-40" />
    </AbsoluteFill>
  );
};
