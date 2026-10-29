#!/usr/bin/env node
// Records docs/demo-script.md against the real app in a phone-sized headless Chrome, as an mp4 with
// no sound (the narration is added over it). Taps show as a fading ring so viewers can follow. While the
// app waits on the stores, Muse or the map, the video plays at 4x (FAST_WAIT); everything else at 1.5x
// (SPEED), because headless Chrome is slower than a phone.
//
//   node scripts/demo/record-demo.mjs                 # https://app.rinde.cool.chuventures.com
//   DEMO_BASE_URL=http://localhost:19006 DEMO_OUT=/tmp/demo node scripts/demo/record-demo.mjs
//
// Run it twice: the first run warms the price and route caches, so the second shows the app at speed.
// Env: DEMO_BASE_URL, DEMO_OUT (default docs/demo), DEMO_LAT / DEMO_LON (default Chapinero, Bogotá),
// CHROME_PATH. Needs Node 22+, Chrome and ffmpeg.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.DEMO_BASE_URL || "https://app.rinde.cool.chuventures.com").replace(/\/$/, "");
const OUT = process.env.DEMO_OUT || join(process.cwd(), "docs", "demo");
const HERE = { latitude: Number(process.env.DEMO_LAT || 4.6492), longitude: Number(process.env.DEMO_LON || -74.0628) };
const LIST = readFileSync(join(process.cwd(), "docs", "demo-script.md"), "utf8").match(/## The list[^`]*```\n([\s\S]*?)```/)[1].trim().split("\n");
// Items the shopper can live without, as the demo script switches them off.
const OPTIONAL = [/caf[eé]/i, /pl[aá]tano/i, /at[uú]n/i];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const frames = mkdtempSync(join(tmpdir(), "rinde-demo-frames-"));

async function chrome() {
  const bin = process.env.CHROME_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  if (!bin) throw new Error("Chrome not found: set CHROME_PATH");
  const profile = mkdtempSync(join(tmpdir(), "rinde-demo-chrome-"));
  // Software WebGL so the route map draws headless.
  const proc = spawn(bin, ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 300 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  return { endpoint: `http://127.0.0.1:${port}`, close: () => { proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); } };
}

async function connect(endpoint, onEvent) {
  const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) pending.get(m.id)?.(m); else onEvent(m); };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, close: () => ws.close() };
}

// --- recording: Chrome's screencast frames, each with its time, then ffmpeg at a steady 30 fps ------
// (Headless Chrome's screencast sends 1x frames whatever the pixel density; a screenshot keeps the 2x.)

const shots = [];
let send;
const FAST_WAIT = 4;
const SPEED = Number(process.env.DEMO_SPEED || 1.5);
let waiting = false;
// Runs a wait (live checks, Muse, map tiles) and plays it fast in the video.
const fast = async (promise) => { waiting = true; try { return await promise; } finally { waiting = false; } };
// Chrome pushes a frame whenever the page repaints; each is written with its time and acknowledged.
const onEvent = (m) => {
  if (m.method !== "Page.screencastFrame" || !recording) return;
  const { data, metadata, sessionId } = m.params;
  const file = join(frames, `${String(shots.length).padStart(6, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  shots.push({ file, t: metadata.timestamp, fast: waiting });
  send("Page.screencastFrameAck", { sessionId }).catch(() => {});
};
let recording = null;
function startRecording() {
  // Asking for twice the CSS size keeps the frames at the 2x device pixels.
  recording = () => send("Page.stopScreencast");
  return send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
}

function encode(path) {
  const list = shots.map((s, i) => `file '${s.file}'\nduration ${Math.max(0.001, ((shots[i + 1]?.t ?? s.t + 2) - s.t) / (s.fast ? FAST_WAIT : SPEED)).toFixed(3)}`).join("\n");
  const concat = join(frames, "frames.txt");
  writeFileSync(concat, `${list}\nfile '${shots.at(-1).file}'\n`);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", path], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

// --- the page --------------------------------------------------------------------------------

function page() {
  const js = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "page error");
    return r.result.value;
  };
  const until = async (what, expression, ms = 30_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await js(expression).catch(() => null);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  };
  // RN-web Pressables answer pointer events: press the middle of the element, and show a ring there.
  const press = async ([x, y]) => {
    await js(`(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid rgba(20,90,60,.85);background:rgba(20,90,60,.18);pointer-events:none;z-index:2147483647;transition:transform 1s ease-out,opacity 1s ease-out"; document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = "scale(1.6)"; d.style.opacity = "0"; }); setTimeout(() => d.remove(), 1300); })()`);
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(500);
  };
  // Scrolls the element into view smoothly, then returns its centre.
  const where = (finder) => `(async () => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: "center", behavior: "smooth" }); await new Promise(r => setTimeout(r, 700)); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;
  const byText = (text, prefix = false) => `[...document.querySelectorAll("div,span,a,button")].filter(d => d.offsetParent !== null && d.children.length === 0 && (${prefix ? `d.innerText?.trim().startsWith(${JSON.stringify(text)})` : `d.innerText?.trim() === ${JSON.stringify(text)}`})).at(-1)`;
  const tap = async (text, { prefix = false, ms = 20_000 } = {}) => press(await until(`"${text}"`, where(byText(text, prefix)), ms));
  const has = (text) => js(`!!(${byText(text)})`);
  // Reads the page slowly, as a presenter scrolling with a thumb.
  const glide = async (px, ms = 1600) => {
    await js(`(() => { const s = [...document.querySelectorAll("div")].filter(d => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY !== "visible" && d.offsetParent !== null).sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement; s.scrollBy({ top: ${px}, behavior: "smooth" }); })()`);
    await sleep(ms);
  };
  return { js, until, press, where, byText, tap, has, glide };
}

const t0 = Date.now();
const beat = (what) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${what}`);

async function demo(p) {
  // 0:15 Open the app; the install sheet slides up.
  // Load once off camera, so the video opens on the app, not a blank page.
  await send("Page.navigate", { url: BASE });
  await p.until("the app", `/Explorar/.test(document.body.innerText)`, 60_000);
  await send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "local_storage,indexeddb" });
  await send("Page.reload");
  await p.until("the app", `/Explorar/.test(document.body.innerText)`, 60_000);
  await startRecording();
  await sleep(2500);
  if (await p.until("the install sheet", `!!(${p.byText("Ahora no")})`, 8000).catch(() => false)) await p.tap("Ahora no");
  await sleep(1200);

  // 0:30 The list, pasted as people write it; three items marked as ones they can live without.
  beat("recording");
  // A tap during the first render can be lost; tap the tab again until the plan screen opens.
  for (let i = 0; i < 4 && !(await p.has("Pegar lista")); i++) {
    await p.tap("Mi plan", { ms: 30_000 });
    await p.until("the plan screen", `!!(${p.byText("Pegar lista")})`, 10_000).catch(() => {});
  }
  await sleep(1000);
  await p.tap("Pegar lista", { ms: 60_000 });
  await p.press(await p.until("the list box", p.where(`document.querySelector('textarea')`)));
  await send("Input.insertText", { text: LIST.join("\n") });
  await sleep(800);
  beat("list typed");
  await p.tap("Agregar a mi lista");
  await p.until("the list", `/Tu lista tiene \\d+ productos?/.test(document.body.innerText)`);
  await sleep(1500);
  beat("list added");
  for (const re of OPTIONAL) {
    beat(`toggle ${re}`);
    const row = `[...document.querySelectorAll('[aria-label$=". Editar"]')].find(e => ${re}.test(e.getAttribute("aria-label")))`;
    await p.press(await p.until(`the ${re} row`, p.where(row)));
    await sleep(600);
    await p.press(await p.until("the Imprescindible switch", p.where(`[...document.querySelectorAll('[aria-label="Imprescindible"]')].find(e => e.offsetParent !== null || e.getClientRects().length)`)));
    await sleep(700);
    await p.press(await p.until(`the ${re} row`, p.where(row)));
    await sleep(500);
  }

  // 0:50 Budget and plan: live checks at each store, then the plan.
  beat("toggles done");
  await p.tap("Continuar");
  await sleep(1000);
  await p.tap("Semanal");
  await p.tap("$150 mil");
  await sleep(600);
  beat("budget set");
  await p.tap("Ver dónde rinde más");
  await fast(p.until("the plan", `!!document.querySelector('[data-testid="plan-total"]')`, 150_000));
  await sleep(2500);
  await p.glide(420, 2200);
  await p.glide(420, 2200);

  // 1:30 Over budget: accept proposals until the plan fits.
  for (const what of [/caf[eé]/i, /pl[aá]tano/i, /at[uú]n/i]) {
    if (!(await p.js(`/Te pasas por/.test(document.body.innerText)`))) break;
    // The proposal whose title names the item, whatever its exact wording.
    const title = `[...document.querySelectorAll("div,span")].filter(d => d.offsetParent !== null && d.children.length === 0 && /^(Quitar|Llevar|Cambiar)/.test(d.innerText?.trim() ?? "") && ${what}.test(d.innerText)).at(0)`;
    const accept = `(() => { const t = ${title}; if (!t) return null; let el = t; while (el && ![...el.querySelectorAll("div,span")].some(d => d.innerText?.trim() === "Aceptar")) el = el.parentElement; return el && [...el.querySelectorAll("div,span")].filter(d => d.children.length === 0 && d.innerText?.trim() === "Aceptar")[0]; })()`;
    const at = await p.until(`the ${what} proposal`, p.where(accept), 20_000).catch(() => null);
    console.log(at ? `accepting the ${what} proposal` : `no ${what} proposal`);
    if (!at) break;
    beat(`proposal ${what}`);
    await sleep(1200);
    await p.press(at);
    await fast(p.until("the recalculated plan", `!/Verificando/.test(document.body.innerText)`, 90_000).catch(() => {}));
    await sleep(2500);
  }
  await p.js(`document.querySelector('[data-testid="plan-total"]')?.scrollIntoView({ block: "center", behavior: "smooth" })`);
  await sleep(3000);

  // 2:00 The trip from the usual Carulla, on foot: advice, the two-store option, the map, Navegar.
  beat("route");
  // The plan can still be settling after the last proposal; tap again until the route screen opens.
  const chip = `document.querySelector('[role=radio][aria-label="Carulla"]')`;
  for (let i = 0; i < 3 && !(await p.js(`!!${chip}`)); i++) {
    await p.tap("Planear mi ruta");
    await p.until("the route screen", `!!${chip}`, 15_000).catch(() => {});
  }
  await p.press(await fast(p.until("the Carulla chip", p.where(chip), 60_000)));
  await p.tap("Usar mi ubicación", { ms: 30_000 });
  await p.press(await p.until("nearby stores", p.where(`[...document.querySelectorAll('[role=radio]')].find(e => /\\d+ min/.test(e.innerText))`), 30_000));
  await p.tap("A pie");
  await sleep(600);
  await p.tap("Planear mi ruta");
  const which = await fast(p.until("the advice", `document.querySelector('[data-testid="route-advice"]') ? "advice" : document.querySelector('[data-testid="route-question"]') ? "question" : null`, 150_000));
  if (which === "question") { await sleep(1500); await p.tap("No"); await p.until("the advice", `!!document.querySelector('[data-testid="route-advice"]')`, 120_000); }
  await p.js(`document.querySelector('[data-testid="route-advice"]').scrollIntoView({ block: "start", behavior: "smooth" })`);
  await sleep(5000);
  const pair = `[...document.querySelectorAll('[data-testid="route-option"]')].find(e => /^Carulla \\+ /.test(e.innerText))`;
  if (await p.js(`!!(${pair})`)) { await p.press(await p.until("the two-store option", p.where(pair))); await sleep(2000); }
  await fast(p.until("the map", `!!document.querySelector('.maplibregl-canvas, svg[aria-label="Esquema de la ruta"]')`, 30_000).catch(() => {}));
  await p.js(`document.querySelector('.maplibregl-canvas, svg[aria-label="Esquema de la ruta"]')?.scrollIntoView({ block: "center", behavior: "smooth" })`);
  await sleep(4000);
  await p.glide(500, 2500);
  await p.js(`window.open = () => null`);
  beat("navegar");
  await p.tap("Navegar");
  await sleep(3500);
}

const browser = await chrome();
const conn = await connect(browser.endpoint, onEvent);
send = conn.send;
const p = page();
const out = join(OUT, "rinde-demo.mp4");
try {
  await send("Page.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Browser.grantPermissions", { origin: new URL(BASE).origin, permissions: ["geolocation"] }).catch(() => {});
  await send("Emulation.setGeolocationOverride", { ...HERE, accuracy: 30 });
  const started = Date.now();
  await demo(p);
  await recording?.();
  console.log(`recorded ${shots.length} frames over ${((Date.now() - started) / 1000).toFixed(0)} s`);
  encode(out);
  console.log(`wrote ${out}`);
} catch (e) {
  console.error(`stopped: ${e instanceof Error ? e.message : e}`);
  const r = await send("Page.captureScreenshot", { format: "png" }).catch(() => null);
  if (r) writeFileSync(join(OUT, "record-failure.png"), Buffer.from(r.data, "base64"));
  await recording?.();
  if (shots.length > 10) { encode(join(OUT, "rinde-demo-partial.mp4")); console.log("wrote the partial recording"); }
  process.exitCode = 1;
} finally {
  conn.close();
  browser.close();
  rmSync(frames, { recursive: true, force: true });
}
