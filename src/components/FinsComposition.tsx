import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { motion } from "framer-motion";

export const FinsComposition = ({ title, summary, ticker }: { title: string; summary: string; ticker: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [0, 20], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="bg-[#020202] flex items-center justify-center p-20 text-[#f4efe6]">
      <div 
        style={{ 
          opacity, 
          transform: `translateY(${y}px)`,
          fontFamily: "Space Grotesk, sans-serif"
        }}
        className="max-w-4xl space-y-10"
      >
        <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-white/10 flex items-center justify-center font-black text-2xl border border-white/20">
                {ticker.charAt(0)}
            </div>
            <div className="text-[10px] font-mono tracking-[0.4em] text-white/30 uppercase italic">
                // FINS_INTELLIGENCE_RECAP
            </div>
        </div>
        
        <h1 className="text-7xl font-black tracking-tighter leading-[0.85] uppercase">
            {title}
        </h1>
        
        <p className="text-2xl text-white/40 font-light leading-relaxed">
            {summary}
        </p>
        
        <div className="pt-10 flex gap-20">
            <div className="space-y-1">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Symbol</div>
                <div className="text-xl font-bold text-[#93d24a] tracking-tight">${ticker}</div>
            </div>
            <div className="space-y-1">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Status</div>
                <div className="text-xl font-bold text-[#d8c3a5] tracking-tight">FUSED</div>
            </div>
            <div className="space-y-1">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Source</div>
                <div className="text-xl font-bold text-white/60 tracking-tight">SEC_EDGAR</div>
            </div>
        </div>
      </div>
      
      {/* Ace Spectrum Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#8b5cf6] blur-[120px] opacity-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#00ff41] blur-[120px] opacity-10" />
    </AbsoluteFill>
  );
};
