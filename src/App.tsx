import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from "./components/Navigation";
import Index from "./pages/Index";
import AgentArena from "./pages/AgentArena";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import Fins from "./pages/Fins";

import { FloatingStatusBar } from "./components/FloatingStatusBar";
import { HandshakeOverlay } from "./components/HandshakeOverlay";
import Oracle from "./pages/Oracle";
import EyeOfGod from "./pages/EyeOfGod";
import PwaInstallButton from "./components/PwaInstallButton";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Navigation />
        <HandshakeOverlay />
        <FloatingStatusBar />
        <PwaInstallButton />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/arena" element={<AgentArena />} />
          <Route path="/oracle" element={<Oracle />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/eye-of-god" element={<EyeOfGod />} />
          <Route path="/fins" element={<Fins />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
