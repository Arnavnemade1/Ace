import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  const iosStandalone = (window.navigator as any).standalone === true;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || mediaStandalone;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export default function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast({ title: "Ace installed", description: "Launch it from your home screen or dock." });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canShow = useMemo(() => {
    if (installed) return false;
    if (deferredPrompt) return true;
    return typeof window !== "undefined" && isIosSafari();
  }, [deferredPrompt, installed]);

  if (!canShow) return null;

  const onInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setDeferredPrompt(null);
      return;
    }

    toast({
      title: "Install on iPhone/iPad",
      description: "Open Share in Safari, then tap Add to Home Screen."
    });
  };

  return (
    <button
      onClick={onInstall}
      className="fixed bottom-5 right-5 z-[80] rounded-full border border-cyan-400/40 bg-black/80 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 backdrop-blur-xl transition hover:border-cyan-300 hover:text-white"
      type="button"
    >
      <span className="inline-flex items-center gap-2">
        <Download className="h-3.5 w-3.5" />
        Install Ace
      </span>
    </button>
  );
}
