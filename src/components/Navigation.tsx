import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Eye, Activity, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";

const Navigation = () => {
    const location = useLocation();

    const links = [
        { name: "Live Dashboard", path: "/", icon: <LayoutDashboard className="w-4 h-4" /> },
        { name: "Agent Arena", path: "/arena", icon: <BrainCircuit className="w-4 h-4" /> },
        { name: "Bloomberg Analytics", path: "/analytics", icon: <Activity className="w-4 h-4" /> },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/20">
            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-display font-black text-2xl tracking-tighter">ACE</span>
                </div>

                <div className="flex items-center gap-1 md:gap-4">
                    {links.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === link.path
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <div className="flex items-center gap-2 z-10 relative">
                                {link.icon}
                                <span className="hidden md:inline">{link.name}</span>
                            </div>
                            {location.pathname === link.path && (
                                <motion.div
                                    layoutId="navbar-indicator"
                                    className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md -z-0"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
