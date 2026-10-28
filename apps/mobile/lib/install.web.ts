import { useEffect, useState } from "react";
import type { InstallWay } from "./install";

export type { InstallWay } from "./install";

// Chrome's install offer, kept by public/index.html because it can fire before the app mounts.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window { __rindeInstall?: InstallEvent }
}

const DISMISSED = "rinde-install-dismissed";
// Set by public/index.html when this device's data arrived from Rinde's old address.
const MOVED = "rinde-moved-notice";

/** Opened from the home screen icon (or a desktop app window): already installed. */
function standalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad, including iPads that report themselves as a Mac. */
function apple() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function wayNow(): InstallWay {
  if (typeof window === "undefined" || standalone()) return "none";
  if (window.__rindeInstall) return "prompt";
  return apple() ? "ios" : "none";
}

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useInstall() {
  const [way, setWay] = useState<InstallWay>(wayNow);
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED));
  // Read once per launch and cleared right away: the notice shows on this visit only.
  const [moved] = useState(() => readFlag(MOVED));

  useEffect(() => {
    if (!moved) return;
    try {
      window.localStorage.removeItem(MOVED);
    } catch {
      // Shown again next visit; harmless.
    }
  }, [moved]);

  useEffect(() => {
    const update = () => setWay(wayNow());
    const installed = () => { window.__rindeInstall = undefined; setWay("none"); };
    window.addEventListener("rinde-installable", update);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("rinde-installable", update);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  /** Shows the browser's own install dialog. True when the person accepted it. */
  async function install() {
    const offer = window.__rindeInstall;
    if (!offer) return false;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    // An offer can be used once; Chrome sends a new one later if the person said no.
    window.__rindeInstall = undefined;
    setWay(wayNow());
    return outcome === "accepted";
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // Hidden for this visit only.
    }
  }

  return { way, install, dismissed, dismiss, moved };
}
