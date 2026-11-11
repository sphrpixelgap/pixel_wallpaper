import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone) { setInstalled(true); return; }
    setShowIos(ios);
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setShowIos(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (installed || (!installEvent && !showIos)) return null;
  const onClick = async () => {
    if (!installEvent) {
      window.alert("برای نصب در آیفون: دکمهٔ اشتراک‌گذاری مرورگر Safari را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.");
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };
  return <button className="install-app-button" onClick={() => void onClick()} aria-label="نصب وب‌اپ پیکسل والپیپر">{showIos ? <Smartphone size={14} /> : <Download size={14} />} نصب اپ</button>;
}
