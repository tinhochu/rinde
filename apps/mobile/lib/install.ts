/**
 * How this device can install Rinde to its home screen. The native app is already installed, so
 * there is nothing to offer; the web build (install.web.ts) answers for browsers.
 *   prompt: the browser can install it in one tap (Chrome, Edge, Samsung Internet).
 *   ios: Safari on iPhone/iPad, where the person adds it from the Share menu.
 *   android: an Android browser that hasn't offered one tap; the person installs it from its ⋮ menu.
 *   inapp: inside Instagram, Facebook, WhatsApp or another app's browser, which can't install; open it in the real browser first.
 */
export type InstallWay = "prompt" | "ios" | "android" | "inapp" | "none";

/** moved: Rinde was just opened from its old address (see public/index.html); say so once. */
/** Anonymous install counters (apps/web/src/server/installs.ts); the native app sends none. */
export type InstallEvent =
  | { event: "launch"; detail: "app" | "browser" }
  | { event: "installed"; detail: "prompt" | "menu" }
  | { event: "guide"; detail: "shown" | "snoozed" | "install-tap" | "copy-link" };
export function track(_e: InstallEvent, _way: InstallWay) {}
/** Counts this launch once a day: opened from the home-screen icon, or in a browser tab. */
export function trackLaunch(_way: InstallWay) {}

export function useInstall(): {
  way: InstallWay; install: () => Promise<boolean>; dismissed: boolean; dismiss: () => void; moved: boolean;
  /** The welcome guide opens on launch on a phone, unless it was put off in the last 3 days. */
  welcome: boolean; snooze: () => void; copyLink: () => Promise<boolean>;
} {
  return {
    way: "none", install: async () => false, dismissed: true, dismiss: () => undefined, moved: false,
    welcome: false, snooze: () => undefined, copyLink: async () => false,
  };
}
