import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Activity, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";

const Navigation = () => {
    const location = useLocation();

    const links = [
        { name: "Terminal", path: "/", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
        { name: "Arena", path: "/arena", icon: <BrainCircuit className="w-3.5 h-3.5" /> },
        { name: "Analytics", path: "/analytics", icon: <Activity className="w-3.5 h-3.5" /> },
    ];

    return (
        <nav className="fixed top-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-6">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="pointer-events-auto h-12 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-full px-2 flex items-center gap-1 shadow-2xl"
            >
                <Link to="/" className="flex items-center gap-3 px-4 mr-2 group">
                    <span className="font-['Dancing_Script'] font-bold text-2xl tracking-normal text-white group-hover:scale-105 transition-transform">Ace</span>
                </Link>

                <div className="h-4 w-px bg-white/10 mx-1" />

                <div className="flex items-center gap-1">
                    {links.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`relative px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all ${location.pathname === link.path
                                ? "text-white"
                                : "text-white/40 hover:text-white/80"
                                }`}
                        >
                            <div className="flex items-center gap-2 z-10 relative">
                                {link.icon}
                                <span className="hidden sm:inline">{link.name}</span>
                            </div>
                            {location.pathname === link.path && (
                                <motion.div
                                    layoutId="navbar-pill"
                                    className="absolute inset-0 bg-white/10 rounded-full -z-0"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                        </Link>
                    ))}
                </div>
            </motion.div>
        </nav>
    );
};

export default Navigation;
