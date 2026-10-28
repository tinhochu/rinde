import { useEffect, useState } from "react";
import type { InstallWay } from "./install";

export type { InstallWay } from "./install";

// Chrome's install offer, kept by public/index.html because it can fire before the app mounts.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window { __rindeInstall?: InstallEvent }
  interface Navigator { getInstalledRelatedApps?: () => Promise<{ platform: string; url?: string }[]> }
}

const DISMISSED = "rinde-install-dismissed";
// When the welcome guide was last put off ("Ahora no"); it stays away for 3 days.
const SNOOZED = "rinde-install-snoozed";
const SNOOZE_MS = 3 * 24 * 3_600_000;
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

/** Instagram, Facebook, Messenger, WhatsApp, TikTok and other apps' built-in browsers can't install anything. */
function inApp() {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent);
}

/** A phone or tablet: the guide is for the home screen, not a desktop window. */
function handheld() {
  return navigator.maxTouchPoints > 0 && (window.matchMedia?.("(pointer: coarse)").matches ?? true);
}

function wayNow(): InstallWay {
  if (typeof window === "undefined" || standalone()) return "none";
  if (window.__rindeInstall) return "prompt";
  if (inApp()) return handheld() ? "inapp" : "none";
  if (apple()) return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "none";
}

function snoozedNow() {
  try {
    return Date.now() - Number(window.localStorage.getItem(SNOOZED) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
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
  const [welcome, setWelcome] = useState(() => typeof window !== "undefined" && handheld() && !snoozedNow());

  // Installed already but opened in the browser: Chrome on Android can tell (manifest related_applications).
  useEffect(() => {
    navigator.getInstalledRelatedApps?.()
      .then(apps => { if (apps.some(a => a.platform === "webapp")) { window.__rindeInstall = undefined; setWay("none"); } })
      .catch(() => undefined);
  }, []);

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

  /** "Ahora no": the guide closes now and stays away for 3 days. */
  function snooze() {
    setWelcome(false);
    try {
      window.localStorage.setItem(SNOOZED, String(Date.now()));
    } catch {
      // Closed for this visit only.
    }
  }

  /** For in-app browsers: the link to paste in Chrome or Safari. */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      return true;
    } catch {
      return false;
    }
  }

  return { way, install, dismissed, dismiss, moved, welcome, snooze, copyLink };
}
