import { WebView } from "react-native-webview";

// The web app's address, which the Turnstile site lists as an allowed hostname.
const WEB_ORIGIN = "https://app.rinde.cool.chuventures.com";

/**
 * Cloudflare Turnstile on the phone, inside a small web view. Turnstile checks the page's hostname, so
 * the page claims the app's web address (listed in the Turnstile site) as its base URL. Each token works
 * once, so the form remounts this (new `key`) after every request that used one.
 */
export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head>
<body style="margin:0;display:flex;justify-content:center;background:transparent">
<div class="cf-turnstile" data-sitekey="${siteKey}" data-language="es" data-callback="done" data-expired-callback="lost" data-error-callback="lost"></div>
<script>
function done(t){window.ReactNativeWebView.postMessage(t)}
function lost(){window.ReactNativeWebView.postMessage("")}
</script></body></html>`;
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html, baseUrl: WEB_ORIGIN }}
      onMessage={e => onToken(e.nativeEvent.data || null)}
      style={{ height: 70, backgroundColor: "transparent" }}
      scrollEnabled={false}
    />
  );
}
