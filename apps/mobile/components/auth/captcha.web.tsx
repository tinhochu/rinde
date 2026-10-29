import { useEffect, useRef } from "react";
import { View, type ViewInstance } from "react-native";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile: usually passes on its own, and asks for a tap only when it's unsure. Each token
 * works once, so the form remounts this (new `key`) after every request that used one.
 */
export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const box = useRef<ViewInstance>(null);
  useEffect(() => {
    let id: string | null = null;
    let live = true;
    loadTurnstile()
      .then(t => {
        if (!live || !box.current) return;
        id = t.render(box.current as unknown as HTMLElement, {
          sitekey: siteKey,
          language: "es",
          appearance: "interaction-only",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      live = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  return <View ref={box} style={{ alignItems: "center" }} />;
}
