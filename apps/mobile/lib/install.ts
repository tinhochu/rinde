/**
 * How this device can install Rinde to its home screen. The native app is already installed, so
 * there is nothing to offer; the web build (install.web.ts) answers for browsers.
 *   prompt: the browser can install it in one tap (Chrome, Edge, Samsung Internet).
 *   ios: Safari on iPhone/iPad, where the person adds it from the Share menu.
 */
export type InstallWay = "prompt" | "ios" | "none";

export function useInstall(): { way: InstallWay; install: () => Promise<boolean>; dismissed: boolean; dismiss: () => void } {
  return { way: "none", install: async () => false, dismissed: true, dismiss: () => undefined };
}
