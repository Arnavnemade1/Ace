import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

/**
 * Navigation: Minimalist editorial nav bar.
 * No icons, tight tracking, Space Grotesk feel.
 */

const Navigation = () => {
    const location = useLocation();

    const links = [
        { name: "Terminal", path: "/" },
        { name: "Arena", path: "/arena" },
        { name: "Oracle", path: "/oracle" },
        { name: "FINS", path: "/fins" },
        { name: "Analytics", path: "/analytics" },
    ];

    return (
        <nav className="fixed top-10 left-0 right-0 z-50 flex justify-center pointer-events-none px-6">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="pointer-events-auto h-12 bg-[#020202]/80 backdrop-blur-2xl border border-white/5 px-6 flex items-center gap-1 shadow-2xl"
            >
                <Link to="/" className="flex items-center gap-6 px-2 mr-4 group border-r border-white/5 h-full">
                    <span className="font-['Dancing_Script'] font-bold text-2xl tracking-normal text-white group-hover:scale-105 transition-transform">Ace</span>
                </Link>

                <div className="flex items-center gap-1">
                    {links.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`relative px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.3em] transition-all ${location.pathname === link.path
                                ? "text-white"
                                : "text-white/30 hover:text-white/80"
                                }`}
                        >
                            <span className="z-10 relative">{link.name}</span>
                            {location.pathname === link.path && (
                                <motion.div
                                    layoutId="navbar-pill"
                                    className="absolute bottom-0 left-4 right-4 h-px bg-[#d8c3a5]"
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
