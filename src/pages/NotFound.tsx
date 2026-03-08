import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#101312] px-6 pt-32 text-[#f4efe6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(206,172,114,0.1),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(107,138,177,0.14),transparent_24%),linear-gradient(180deg,#101312_0%,#0b0d0d_100%)]" />
      <div className="relative z-10 mx-auto max-w-[92rem] border-t border-white/10 pt-6">
        <div className="grid gap-10 xl:grid-cols-[0.58fr_0.42fr]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-white/34">Route Error</div>
            <h1 className="mt-6 font-display text-6xl leading-[0.9] tracking-[-0.05em] md:text-8xl">404</h1>
            <p className="mt-6 max-w-3xl text-xl leading-9 text-white/58">
              The route <span className="text-white/82">{location.pathname}</span> does not exist in the current application surface.
            </p>
          </div>
          <div className="border border-white/8 bg-black/10 p-6">
            <div className="text-[10px] uppercase tracking-[0.26em] text-white/30">Recovery</div>
            <p className="mt-4 text-base leading-8 text-white/60">
              Use the primary navigation to return to a live route, or jump straight back to the main terminal.
            </p>
            <a
              href="/"
              className="mt-8 inline-flex border border-white/12 px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white transition-colors hover:bg-white/6"
            >
              Return to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
