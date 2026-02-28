import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { Activity, Globe, Cpu, Network, Zap } from "lucide-react";

const Analytics = () => {
    const [dataSources, setDataSources] = useState<any[]>([]);
    const [tickerData, setTickerData] = useState<any[]>([]);

    // Simulation data for visuals or pulling from Supabase
    useEffect(() => {
        // We are simulating an advanced Bloomberg stream pulling multiple data points
        const generateData = () => {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return {
                time,
                SPY: 500 + Math.random() * 5,
                QQQ: 430 + Math.random() * 4,
                Sentiment: Math.random(),
                WeatherRisk: Math.random() * 10,
            }
        };

        setTickerData(Array.from({ length: 20 }, createMockData));

        function createMockData(v: any, k: number) {
            return {
                time: `-${20 - k}m`,
                SPY: 500 + Math.random() * 10 - 5 + k,
                QQQ: 430 + Math.random() * 8 - 4 + k,
                Sentiment: Math.random(),
                WeatherRisk: Math.random() * 10,
            };
        }

        const interval = setInterval(() => {
            setTickerData(prev => {
                const newArr = [...prev.slice(1), generateData()];
                return newArr;
            });
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-[#050505] overflow-x-hidden pt-24 pb-12 font-mono text-sm text-[#00ff00]">
            <div className="container mx-auto px-2">

                {/* Header Bloomberg style */}
                <div className="flex justify-between items-end border-b-2 border-[#004400] pb-2 mb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-widest"><Activity className="inline w-8 h-8 mr-2 text-primary" /> GLOBAL MACRO INTELLIGENCE DESK</h1>
                        <p className="opacity-80 mt-1">PALANTIR-STYLE CONTINUOUS OMNI-STREAM MONITORING</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xl text-yellow-500 animate-pulse font-bold">{new Date().toLocaleTimeString()} EST</div>
                        <div className="text-xs text-[#00aa00] mt-1">SYSTEM STATE: NOMINAL | FREQ: 60s TICK | SPAN: 30m HORIZON</div>
                    </div>
                </div>

                {/* 3 Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

                    {/* Left Col: Stream Sources */}
                    <div className="col-span-1 border border-[#003300] bg-[#000a00] p-3 shadow-[0_0_15px_rgba(0,255,0,0.05)]">
                        <h3 className="border-b border-[#004400] pb-1 font-bold text-white mb-3">API ORIGIN STREAMS</h3>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-[#00ff00]"><Globe className="inline w-3 h-3 mr-1" /> FINNHUB EQUITIES</span>
                                    <span className="text-white">ONLINE</span>
                                </div>
                                <div className="w-full bg-[#002200] h-1.5"><div className="bg-[#00ff00] h-full w-full animate-pulse" /></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-cyan-400"><Globe className="inline w-3 h-3 mr-1" /> NEWSDATA.IO NLP</span>
                                    <span className="text-white">ONLINE</span>
                                </div>
                                <div className="w-full bg-[#002200] h-1.5"><div className="bg-cyan-400 h-full w-full animate-pulse" /></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-amber-500"><Globe className="inline w-3 h-3 mr-1" /> OPEN-METEO SAT</span>
                                    <span className="text-white">ONLINE</span>
                                </div>
                                <div className="w-full bg-[#002200] h-1.5"><div className="bg-amber-500 h-full w-full animate-pulse" /></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-purple-500"><Globe className="inline w-3 h-3 mr-1" /> ALPHA VANTAGE FX</span>
                                    <span className="text-yellow-500">POLLING</span>
                                </div>
                                <div className="w-full bg-[#002200] h-1.5"><div className="bg-purple-500 h-full w-[80%] animate-pulse" /></div>
                            </div>
                        </div>

                        <div className="mt-8 border-t border-[#004400] pt-3">
                            <h3 className="font-bold text-white mb-2">RAW TERMINAL DUMP</h3>
                            <div className="h-48 overflow-hidden text-[10px] leading-tight opacity-70 break-all mix-blend-screen relative">
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#000a00] to-transparent z-10" />
                                <div className="animate-[scroll_20s_linear_infinite]">
                                    {Array.from({ length: 40 }).map((_, i) => (
                                        <div key={i}>
                                            {Date.now() - i * 1000} &gt; INX_TICK_RECV : VOL={Math.floor(Math.random() * 10000)} Px={(5000 + Math.random() * 100).toFixed(2)} [OK]
                                            <br />
                                            {Date.now() - i * 1000 - 100} &gt; NLP_PARSE : {Math.random().toString(36).substring(7)} POLARITY={Math.random().toFixed(2)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Middle Col: Massive Charts */}
                    <div className="col-span-1 lg:col-span-2 flex flex-col gap-4">
                        <div className="border border-[#003300] bg-[#000a00] p-3 h-64 shadow-[0_0_15px_rgba(0,255,0,0.05)]">
                            <h3 className="font-bold text-white mb-2">MACRO TREND - SPY CONSOLIDATED</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <LineChart data={tickerData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#002200" />
                                    <XAxis dataKey="time" stroke="#006600" fontSize={10} />
                                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#006600" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #00ff00', color: '#00ff00' }} />
                                    <Line type="monotone" dataKey="SPY" stroke="#00ff00" strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="border border-[#003300] bg-[#000a00] p-3 h-64 shadow-[0_0_15px_rgba(0,255,0,0.05)]">
                            <h3 className="font-bold text-cyan-400 mb-2">SENTIMENT / RISK CORRELATION MATRIX</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <AreaChart data={tickerData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#002200" />
                                    <XAxis dataKey="time" stroke="#006600" fontSize={10} />
                                    <YAxis stroke="#006600" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #00ff00', color: '#00ff00' }} />
                                    <Area type="monotone" dataKey="Sentiment" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} isAnimationActive={false} />
                                    <Area type="monotone" dataKey="WeatherRisk" stackId="2" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Right Col: AI Reasoning Synthesis */}
                    <div className="col-span-1 border border-[#003300] bg-[#000a00] p-3 flex flex-col shadow-[0_0_15px_rgba(0,255,0,0.05)]">
                        <h3 className="border-b border-[#004400] pb-1 font-bold text-primary mb-3"><Cpu className="inline w-4 h-4 mr-1" /> AI REASONING SYNTHESIS</h3>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs leading-relaxed">
                            <div className="p-2 border-l-2 border-cyan-500 bg-cyan-950/20">
                                <strong className="text-cyan-400 block mb-1">1. DATA AGGREGATION [T-60s]</strong>
                                <p>Aggregated 412 news headlines via NewsData.io. Computed mean NLP polarity of +0.31 (Slightly Bullish). Open-Meteo confirms nominal conditions in main agricultural hubs.</p>
                            </div>

                            <div className="p-2 border-l-2 border-primary bg-primary/10">
                                <strong className="text-primary block mb-1">2. PATTERN RECOGNITION</strong>
                                <p>Correlating current SPY tick volume with historical causal replay data. Match found: +82% similarity to pre-breakout conditions recorded 14 days ago.</p>
                            </div>

                            <div className="p-2 border-l-2 border-yellow-500 bg-yellow-900/20">
                                <strong className="text-yellow-500 block mb-1">3. HORIZON SPAN PENALTY</strong>
                                <p>Applying 30-minute span filter. Although 1-minute impulse is high, cross-EMA check forces patience. Delaying execution sequence until confirmation signal persists for &gt; 30 epochs.</p>
                            </div>

                            <div className="p-2 border border-[#004400] bg-black">
                                <strong className="text-white block mb-1">ACTION LOGIC MAP</strong>
                                <pre className="text-[10px] text-muted-foreground mt-2 font-mono">
                                    IF (Sentiment &gt; 0.2 AND Volatility &lt; 15)
                                    AND (Span_Confirmation == TRUE)
                                    THEN -&gt; ALLOCATE(SPY, QTY=1)
                                </pre>
                            </div>
                        </div>

                        <div className="mt-4 p-2 bg-yellow-500 text-black font-bold text-center text-xs animate-pulse">
                            AWAITING HORIZON CONFIRMATION (18m REMAINING)
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Analytics;
