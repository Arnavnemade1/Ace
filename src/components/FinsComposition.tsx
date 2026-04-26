import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";

export const FinsComposition = ({ 
    title, 
    ticker, 
    sentiment, 
}: { 
    title: string; 
    ticker: string;
    sentiment?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Animations
  const entrance = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [0, 40], [20, 0], { extrapolateRight: "clamp" });
  
  // Abstract "Beautiful View" - Moving gradients and light leaks
  const moveX = interpolate(Math.sin(frame / 60), [-1, 1], [-10, 10]);
  const moveY = interpolate(Math.cos(frame / 45), [-1, 1], [-10, 10]);

  // Dynamic colors based on sentiment
  const accentColor = sentiment === "positive" ? "#4ade80" : sentiment === "negative" ? "#f87171" : "#94a3b8";
  const glowColor = sentiment === "positive" ? "rgba(74, 222, 128, 0.2)" : sentiment === "negative" ? "rgba(248, 113, 113, 0.2)" : "rgba(148, 163, 184, 0.2)";

  return (
    <AbsoluteFill className="bg-[#020202] overflow-hidden font-sans">
      {/* Cinematic "View" Layers */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
            background: `radial-gradient(circle at ${50 + moveX}% ${50 + moveY}%, ${glowColor} 0%, transparent 80%)`,
        }}
      />
      
      {/* Abstract horizon/mountain-like light leak */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[60%] opacity-20 blur-[120px]"
        style={{
            background: `linear-gradient(to top, ${accentColor}, transparent)`,
            transform: `translateY(${moveY * 2}px)`
        }}
      />

      {/* Floating particles (simulated) */}
      {[...Array(12)].map((_, i) => (
          <div 
            key={i}
            className="absolute bg-white/20 rounded-full blur-[2px]"
            style={{
                width: 2 + (i % 4),
                height: 2 + (i % 4),
                left: `${(i * 13) % 100}%`,
                top: `${(i * 17) % 100}%`,
                opacity: interpolate(Math.sin((frame + i * 20) / 30), [-1, 1], [0.1, 0.5]),
                transform: `translateY(${Math.sin(frame / (40 + i)) * 20}px)`
            }}
          />
      ))}

      {/* Content: Minimal and Focused */}
      <div className="relative z-10 flex flex-col justify-center h-full px-32 space-y-12">
        <div 
            className="space-y-4"
            style={{ opacity: entrance, transform: `translateY(${textY}px)` }}
        >
            <div className="flex items-center gap-6">
                <div 
                    className="w-1.5 h-12 bg-white/10"
                    style={{ backgroundColor: accentColor }}
                />
                <div className="text-xl font-bold tracking-[0.6em] text-white/40 uppercase">
                    ${ticker}
                </div>
            </div>
            
            <h1 className="text-8xl font-black tracking-tight leading-[0.9] text-white max-w-5xl">
                {title.length > 60 ? title.slice(0, 60) + "..." : title}
            </h1>
        </div>

        <div 
            className="flex items-center gap-12"
            style={{ opacity: entrance }}
        >
            <div className="space-y-1">
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em]">Status</div>
                <div className="text-2xl font-bold text-white/80">SYNCHRONIZED</div>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="space-y-1">
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em]">Network</div>
                <div className="text-2xl font-bold" style={{ color: accentColor }}>ACE_FINS</div>
            </div>
        </div>
      </div>

      {/* Subtle Noise Texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
    </AbsoluteFill>
  );
};
