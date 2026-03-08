import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

const Navigation = () => {
    const location = useLocation();

    const links = [
        { name: "Terminal", path: "/" },
        { name: "Arena", path: "/arena" },
        { name: "Oracle", path: "/oracle" },
        { name: "Analytics", path: "/analytics" },
    ];

    return (
        <nav className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none px-6">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="pointer-events-auto flex items-center gap-4 border border-white/10 bg-[#0f1110]/80 px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            >
                <Link to="/" className="px-3 py-2 group">
                    <span className="font-display text-xl tracking-tight text-white transition-opacity group-hover:opacity-80">Ace</span>
                </Link>

                <div className="h-6 w-px bg-white/10" />

                <div className="flex items-center gap-1">
                    {links.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`relative px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition-all ${location.pathname === link.path
                                ? "text-white"
                                : "text-white/40 hover:text-white/80"
                                }`}
                        >
                            <div className="relative z-10">{link.name}</div>
                            {location.pathname === link.path && (
                                <motion.div
                                    layoutId="navbar-pill"
                                    className="absolute inset-0 border border-white/10 bg-white/6 -z-0"
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
