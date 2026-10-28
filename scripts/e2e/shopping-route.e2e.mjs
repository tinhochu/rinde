#!/usr/bin/env node
// End-to-end: shoppers with a usual supermarket and a grocery list. Each one
//
//   1. writes a list, compares it, and checks every matched product is the item asked for and the
//      total adds up;
//   2. picks their store from their (emulated) location, plans the route on foot, and checks the
//      advice, the map, each stop's items and totals;
//   3. opens "Navegar" and checks the Google Maps and Waze links.
//
// The second shopper usually goes to Carulla and splits the list to save money: the compare step's
// "Ahorrar al máximo" must spread the list over more stores for less, and the route plan's
// "Carulla + another store" must save money net of the trip, with each item bought at one stop.
//
// Prices are live, so it checks shape and consistency, never amounts.
//
//   node scripts/e2e/shopping-route.e2e.mjs                     # Expo web on :19006 (API wherever it points)
//   E2E_BASE_URL=https://app.rinde.cool.chuventures.com node scripts/e2e/shopping-route.e2e.mjs
//
// Env: E2E_BASE_URL, E2E_CDP (attach to a running Chrome, e.g. http://127.0.0.1:9333), CHROME_PATH,
// E2E_OUT (screenshots; default a temp dir), E2E_LAT / E2E_LON (default Chapinero, Bogotá).
// Needs Node 22+ (global WebSocket) and Chrome.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.E2E_BASE_URL || "http://localhost:19006").replace(/\/$/, "");
const OUT = process.env.E2E_OUT || mkdtempSync(join(tmpdir(), "rinde-e2e-"));
const HERE = { latitude: Number(process.env.E2E_LAT || 4.6492), longitude: Number(process.env.E2E_LON || -74.0628) };

// What a shopper types, and what a matched product must look like for each line.
const BASICS = [
  { line: "1 litro de leche entera", is: /leche/i },
  { line: "30 huevos", is: /huevo/i },
  { line: "1 kilo de arroz", is: /arroz/i },
  { line: "500 g de café molido", is: /caf[eé]/i },
  { line: "1 kilo de pechuga de pollo", is: /pollo|pechuga/i },
];
// Staples where the stores' prices differ most (pasta and sugar cheapest at Éxito or Jumbo, oats at
// Carulla, the rest at D1), so spreading the list over stores pays.
const PANTRY = [
  { line: "pasta spaghetti 500 g", is: /pasta|spaghetti|espagueti/i },
  { line: "1 kilo de azúcar", is: /az[uú]car/i },
  { line: "500 g de avena", is: /avena/i },
];

const SHOPPERS = [
  { name: "D1 shopper", tag: "d1", chain: "D1", split: false, list: BASICS },
  { name: "Carulla shopper splits the list to save", tag: "split", chain: "Carulla", split: true, list: [...BASICS, ...PANTRY] },
];
// Online catalogs can miss an item; fewer priced than this means matching broke.
const minPriced = (list) => Math.ceil(list.length * 0.6);

mkdirSync(OUT, { recursive: true });
const peso = (text) => Number(String(text).replace(/[^\d]/g, ""));
const itemFor = (list, label) => list.find((i) => i.is.test(label));

// --- Chrome over CDP ---------------------------------------------------------------------------

async function chrome() {
  if (process.env.E2E_CDP) return { endpoint: process.env.E2E_CDP.replace(/\/$/, ""), close: () => {} };
  const bin = process.env.CHROME_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  if (!bin) throw new Error("Chrome not found: set CHROME_PATH or E2E_CDP");
  const profile = mkdtempSync(join(tmpdir(), "rinde-e2e-chrome-"));
  // Software WebGL so MapLibre draws headless; without it the page shows its SVG sketch instead.
  const proc = spawn(bin, ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  return { endpoint: `http://127.0.0.1:${port}`, close: () => { proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); } };
}

async function connect(endpoint) {
  const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) pending.get(m.id)?.(m); };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const close = async () => { ws.close(); await fetch(`${endpoint}/json/close/${target.id}`).catch(() => {}); };
  return { send, close };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the page ----------------------------------------------------------------------------------

function page(send) {
  const js = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "page error");
    return r.result.value;
  };
  // `expression` must evaluate to something JSON-serializable (use !! for elements).
  const until = async (what, expression, ms = 30_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await js(expression).catch(() => null);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(500);
    }
  };
  // RN-web Pressables answer pointer events, not element.click(): press the middle of the element.
  const press = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(400);
  };
  const where = (finder) => `(() => { const el = ${finder}; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;
  // The innermost visible element whose text is exactly `text` (or starts with it); the last one wins,
  // so a screen's button beats its title.
  const byText = (text, prefix = false) => `[...document.querySelectorAll("div,span,a,button")].filter(d => d.offsetParent !== null && d.children.length === 0 && (${prefix ? `d.innerText?.trim().startsWith(${JSON.stringify(text)})` : `d.innerText?.trim() === ${JSON.stringify(text)}`})).at(-1)`;
  const click = async (text, { prefix = false, ms = 15_000 } = {}) => {
    const at = await until(`"${text}"`, where(byText(text, prefix)), ms);
    await press(at[0], at[1]);
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, "base64"));
  };
  const texts = (testId) => js(`JSON.stringify([...document.querySelectorAll('[data-testid="${testId}"]')].map(e => e.innerText.trim()))`).then(JSON.parse);
  return { js, until, press, where, click, shot, texts, byText };
}

// --- checks ------------------------------------------------------------------------------------

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ""} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function shop(p, send, shopper) {
  const shot = (name) => p.shot(`${shopper.tag}-${name}`);
  const LIST = shopper.list;
  const MIN_PRICED = minPriced(LIST);
  let planned = [];
  await step("Write the grocery list", async () => {
    await send("Page.navigate", { url: `${BASE}/plan` });
    await p.click("Pegar lista", { ms: 60_000 });
    const box = await p.until("the list box", p.where(`document.querySelector('textarea')`));
    await p.press(box[0], box[1]);
    await send("Input.insertText", { text: LIST.map((i) => i.line).join("\n") });
    await p.click("Agregar a mi lista");
    const summary = await p.until("the list", `(document.body.innerText.match(/Tu lista tiene (\\d+) productos?/) || [])[1]`);
    check(Number(summary) === LIST.length, `the list has ${summary} items, expected ${LIST.length}`);
    await shot("1-list");
    return `${summary} items`;
  });

  await step("Compare it: the right products, a total that adds up", async () => {
    await p.click("Continuar");
    await p.click("$300 mil");
    await p.click("Ver dónde rinde más");
    await p.until("the plan", `!!document.querySelector('[data-testid="plan-total"]')`, 150_000);
    await sleep(1000);
    const products = await p.texts("plan-line-product");
    const subs = await p.texts("plan-line-sub");
    const totals = (await p.texts("plan-line-total")).map(peso);
    const missing = await p.js(`(document.body.innerText.match(/Sin precio: ([^.]+)\\./) || [])[1] || ""`);
    planned = subs.map((sub, i) => ({ label: (sub.match(/para “(.+)”/) || [])[1] ?? "", product: products[i], total: totals[i] }));
    check(planned.length >= MIN_PRICED, `only ${planned.length} items got a price`);
    for (const line of planned) {
      const item = itemFor(LIST, line.label);
      check(item, `"${line.label}" isn't on the list`);
      check(item.is.test(line.product), `"${line.label}" was matched to "${line.product}"`);
      check(line.total > 0, `"${line.product}" has no price`);
    }
    for (const item of LIST) {
      const priced = planned.some((l) => item.is.test(l.label));
      check(priced || item.is.test(missing), `"${item.line}" is neither priced nor listed as missing`);
    }
    const total = peso(await p.js(`document.querySelector('[data-testid="plan-total"]').innerText`));
    const sum = totals.reduce((s, n) => s + n, 0);
    check(total === sum, `the total ${total} isn't the sum of its lines ${sum}`);
    await shot("2-plan");
    return `${planned.length}/${LIST.length} priced, total $${total.toLocaleString("es-CO")}${missing ? `; no price: ${missing}` : ""}`;
  });

  if (shopper.split) {
    await step("Split the list to save: \"Ahorrar al máximo\" uses more stores for less", async () => {
      const chips = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll('[role=radiogroup] [role=radio]')].map(e => e.innerText.split("\\n")))`));
      const max = chips.find((c) => c[0] === "Ahorrar al máximo");
      const fewer = chips.filter((c) => c !== max);
      check(max && / \+ /.test(max[2] ?? "") && fewer.length, `no split offered (options: ${chips.map((c) => c.join(" ")).join(" | ") || "none"})`);
      // Against the next best option (one store when one carries everything, else the recommendation).
      const next = fewer.sort((a, b) => peso(a[1]) - peso(b[1]))[0];
      check(peso(max[1]) < peso(next[1]), `the split ${max[1]} isn't cheaper than ${next[2]} ${next[1]}`);
      await p.click("Ahorrar al máximo");
      await sleep(800);
      const stores = await p.js(`document.querySelectorAll('[data-testid="plan-store"]').length`);
      check(stores >= 2, `the split plan shops at ${stores} store`);
      const total = peso(await p.js(`document.querySelector('[data-testid="plan-total"]').innerText`));
      const sum = (await p.texts("plan-line-total")).map(peso).reduce((a, n) => a + n, 0);
      check(total === peso(max[1]) && total === sum, `the split total ${total} doesn't match its option ${max[1]} or lines ${sum}`);
      await shot("2b-split");
      return `${max[2]} $${total.toLocaleString("es-CO")} vs ${next[2]} $${peso(next[1]).toLocaleString("es-CO")}: saves $${(peso(next[1]) - total).toLocaleString("es-CO")}`;
    });
  }

  let stopCount = 0;
  await step(`Pick their usual ${shopper.chain} from their location`, async () => {
    await p.click("Planear mi ruta");
    const chip = await p.until(`the ${shopper.chain} chip`, p.where(`document.querySelector('[role=radio][aria-label="${shopper.chain}"]')`));
    await p.press(chip[0], chip[1]);
    await p.click("Usar mi ubicación", { ms: 30_000 });
    const first = await p.until("nearby stores", p.where(`[...document.querySelectorAll('[role=radio]')].find(e => /\\d+ min/.test(e.innerText))`), 30_000);
    const name = await p.js(`[...document.querySelectorAll('[role=radio]')].find(e => /\\d+ min/.test(e.innerText)).innerText.replace(/\\n/g, " · ")`);
    await p.press(first[0], first[1]);
    await p.click("A pie");
    await shot("3-anchor");
    return name;
  });

  await step("Plan the route: advice, stops, items and totals", async () => {
    await p.click("Planear mi ruta");
    const which = await p.until("the advice", `document.querySelector('[data-testid="route-advice"]') ? "advice" : document.querySelector('[data-testid="route-question"]') ? "question" : null`, 150_000);
    if (which === "question") {
      await p.click("No");
      await p.until("the advice after answering", `!!document.querySelector('[data-testid="route-advice"]')`, 120_000);
    }
    const advice = await p.js(`document.querySelector('[data-testid="route-advice"]').innerText`);
    check(advice.split("\n").slice(1).join(" ").trim().length > 20, "the advice is empty");
    if (shopper.split) {
      // The shopper takes the two-store option that saves money, whatever Muse recommended.
      const options = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll('[data-testid="route-option"]')].map(e => e.innerText.split("\\n")))`));
      const pair = options.find((o) => o[0].startsWith(`${shopper.chain} + `) && /^Ahorras/.test(o[1] ?? ""));
      check(pair, `no second store saves money from this ${shopper.chain} (options: ${options.map((o) => o.join(" ")).join(" | ")})`);
      const xy = await p.js(p.where(`[...document.querySelectorAll('[data-testid="route-option"]')].find(e => e.innerText.startsWith(${JSON.stringify(pair[0])}))`));
      await p.press(xy[0], xy[1]);
      await sleep(1000);
    }
    const stops = await p.texts("route-stop-name");
    stopCount = stops.length;
    check(stops.length >= 1 && stops.length <= 2, `${stops.length} stops`);
    const labels = (await p.texts("route-line-label")).map((l) => l.replace(/^\d+ × /, ""));
    const products = await p.texts("route-line-product");
    const totals = (await p.texts("route-line-total")).map(peso);
    check(labels.length >= MIN_PRICED, `only ${labels.length} items on the route`);
    labels.forEach((label, i) => {
      const item = itemFor(LIST, label);
      check(item, `"${label}" on the route isn't on the list`);
      check(item.is.test(products[i]), `"${label}" on the route is "${products[i]}"`);
      check(totals[i] > 0, `"${products[i]}" on the route has no price`);
    });
    check(new Set(labels).size === labels.length, "an item is bought at two stops");
    let saving = "";
    if (shopper.split) {
      check(stops.length === 2, `the split route has ${stops.length} stops`);
      const perStop = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll('[data-testid="route-stop"]')].map(s => s.querySelectorAll('[data-testid="route-line"]').length))`));
      check(perStop.every((n) => n > 0), `a stop has nothing to buy (${perStop.join(", ")})`);
      const net = await p.js(`(document.body.innerText.match(/Ahorras (\\$\\s?[\\d.]+) netos/) || [])[1] || ""`);
      check(peso(net) > 0, "the split route shows no net saving");
      saving = `, saves ${net} net (${perStop.join(" + ")} items)`;
    }
    // Once the live check lands the totals settle; read them after it, or after a minute.
    await p.until("prices checked", `/Precios verificados ahora/.test(document.body.innerText)`, 60_000).catch(() => {});
    const settled = (await p.texts("route-line-total")).map(peso).reduce((s, n) => s + n, 0);
    const total = peso(await p.js(`document.querySelector('[data-testid="route-total"]').innerText`));
    check(total === settled, `the route total ${total} isn't the sum of its lines ${settled}`);
    return `${stops.join(" → ")}; ${labels.length} items, $${total.toLocaleString("es-CO")}${saving}`;
  });

  await step("The map shows the route", async () => {
    const kind = await p.until("the map", `document.querySelector('.maplibregl-canvas') ? "map" : document.querySelector('svg[aria-label="Esquema de la ruta"]') ? "sketch" : null`, 30_000);
    if (kind === "map") {
      const markers = await p.until("the stop markers", `document.querySelectorAll('.maplibregl-marker').length || null`, 20_000);
      check(markers >= stopCount, `${markers} markers for ${stopCount} stops`);
    }
    await p.js(`document.querySelector('.maplibregl-canvas, svg[aria-label="Esquema de la ruta"]').scrollIntoView({ block: "center" })`);
    await sleep(2500); // tiles
    await shot("4-route");
    return kind === "map" ? "MapLibre with OSM tiles" : "SVG sketch (no WebGL2)";
  });

  await step("Navegar hands off to Google Maps and Waze", async () => {
    await p.js(`window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }`);
    await p.click("Navegar");
    await p.click("Abrir en Google Maps (todas las paradas)");
    await p.click("Abrir en Waze", { prefix: true });
    const [google, waze] = JSON.parse(await p.js(`JSON.stringify(window.__opened)`)).map((u) => new URL(u));
    check(google?.host === "www.google.com" && google.pathname === "/maps/dir/", `not a Google Maps link: ${google}`);
    check(google.searchParams.get("travelmode") === "walking", `travel mode ${google.searchParams.get("travelmode")}`);
    check(/^-?\d+\.\d+,-?\d+\.\d+$/.test(google.searchParams.get("destination") ?? ""), "no destination");
    const waypoints = google.searchParams.get("waypoints")?.split("|").length ?? 0;
    check(waypoints === stopCount - 1, `${waypoints} waypoints for ${stopCount} stops`);
    check(waze?.host === "waze.com" && waze.searchParams.get("navigate") === "yes" && waze.searchParams.get("ll"), `not a Waze link: ${waze}`);
    await shot("5-navegar");
    return `${stopCount} stop${stopCount === 1 ? "" : "s"}, walking`;
  });
}

async function run() {
  const browser = await chrome();
  const { send, close } = await connect(browser.endpoint);
  const p = page(send);
  console.log(`Rinde E2E against ${BASE} (screenshots in ${OUT})`);
  try {
    await send("Page.enable");
    await send("Network.enable");
    // The PWA's service worker would serve a cached bundle; always test what the server ships.
    await send("Network.setBypassServiceWorker", { bypass: true });
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const origin = new URL(BASE).origin;
    await send("Browser.grantPermissions", { origin, permissions: ["geolocation"] }).catch(() => {});
    await send("Emulation.setGeolocationOverride", { ...HERE, accuracy: 30 });

    for (const shopper of SHOPPERS) {
      console.log(`\n${shopper.name}`);
      // Each shopper starts from an empty device: no saved list, travel mode or plan.
      await send("Storage.clearDataForOrigin", { origin, storageTypes: "local_storage,indexeddb,cache_storage,service_workers" });
      await shop(p, send, shopper);
    }
  } catch {
    await p.shot("failure").catch(() => {});
  } finally {
    await close();
    browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nFAILED (${results.length - failed}/${results.length} steps passed). Screenshot: ${join(OUT, "failure.png")}` : `\nPASSED ${results.length}/${results.length} steps.`);
  process.exit(failed || results.length < 6 * SHOPPERS.length ? 1 : 0);
}

await run();
