// Page behavior after load: the language links, and the hero's live comparison (one common product
// priced at two or more stores, read from Rinde's catalog when the page loads). Prices are shown exactly as the API returns them, never stored;
// on any failure the explanatory text already in the page stays.
(function () {
  var STAPLES = ["huevos", "arroz", "leche", "aceite"];
  var BUDGET_MS = 4000;

  var en = document.documentElement.lang === "en";
  var t = en
    ? { cheapest: "cheapest", stamp: "Cheapest", diff: "Difference", seen: "seen", receipt: "receipt", units: "units", foot: "Pulled live from Rinde's catalog as this page loaded.", label: "Live price comparison" }
    : { cheapest: "la más barata", stamp: "Más barato", diff: "Diferencia", seen: "visto", receipt: "factura", units: "unidades", foot: "Consultado en vivo en el catálogo de Rinde al abrir esta página.", label: "Comparación de precios en vivo" };

  var money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  var ago = new Intl.RelativeTimeFormat(en ? "en" : "es", { numeric: "always", style: "short" });
  var number = new Intl.NumberFormat("es-CO");

  function price(value) {
    return money.format(value) + (en ? " COP" : "");
  }

  function age(iso) {
    var minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return ago.format(-minutes, "minute");
    var hours = Math.round(minutes / 60);
    if (hours < 48) return ago.format(-hours, "hour");
    return ago.format(-Math.round(hours / 24), "day");
  }

  function pack(product) {
    if (!product.pack) return "";
    if (product.unit === "und") return number.format(product.pack) + " " + t.units;
    if (product.pack >= 1000) return number.format(product.pack / 1000) + (product.unit === "g" ? " kg" : " l");
    return number.format(product.pack) + " " + product.unit;
  }

  /** Of the products priced at two or more stores, the one with the biggest difference. */
  function pick(products) {
    var compared = products.filter(function (p) {
      var stores = {};
      p.offers.forEach(function (o) { stores[o.store] = true; });
      return Object.keys(stores).length >= 2;
    });
    compared.sort(function (a, b) { return b.spread - a.spread; });
    return compared[0] || null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render(box, product) {
    var offers = product.offers.slice().sort(function (a, b) { return a.price - b.price; });
    var seen = {};
    offers = offers.filter(function (o) { return seen[o.store] ? false : (seen[o.store] = true); });

    var body = el("div", "live");
    body.appendChild(el("h2", null, product.name));
    var size = pack(product);
    if (size) body.appendChild(el("p", "meta", size));
    body.appendChild(el("hr"));

    var list = el("ul", "rows");
    offers.forEach(function (offer, i) {
      var row = el("li", i === 0 ? "best" : "");
      var store = el("span", "store", offer.store);
      if (i === 0) {
        var sr = el("span", "sr", ", " + t.cheapest);
        store.appendChild(sr);
      }
      row.appendChild(store);
      row.appendChild(el("span", "price", price(offer.price)));
      var when = t.seen + " " + age(offer.observedAt) + (offer.source === "receipt" ? " (" + t.receipt + ")" : "");
      row.appendChild(el("span", "age", when));
      if (i === 0) {
        var stamp = el("span", "stamp", t.stamp);
        stamp.setAttribute("aria-hidden", "true");
        row.appendChild(stamp);
      }
      list.appendChild(row);
    });
    body.appendChild(list);

    if (offers.length >= 2) {
      body.appendChild(el("hr"));
      var diff = el("p", "diff");
      diff.appendChild(el("span", null, t.diff));
      diff.appendChild(el("span", null, price(offers[offers.length - 1].price - offers[0].price)));
      body.appendChild(diff);
    }
    body.appendChild(el("p", "foot", t.foot));

    // The receipt is taller than its placeholder; keep whatever the visitor is looking at in place.
    var below = document.querySelector("main > section");
    var before = below.getBoundingClientRect().top;
    box.replaceChildren(body);
    if (window.scrollY > 0) window.scrollBy(0, below.getBoundingClientRect().top - before);
    box.setAttribute("aria-label", t.label);
    box.classList.add("printing");
  }

  async function run() {
    var box = document.getElementById("compare");
    var api = document.querySelector('meta[name="rinde-api"]');
    if (!box || !api || !window.fetch || !window.AbortController) return;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, BUDGET_MS);
    try {
      for (var i = 0; i < STAPLES.length; i++) {
        var response = await fetch(api.content + "/api/catalog?query=" + encodeURIComponent(STAPLES[i]), { signal: controller.signal });
        if (!response.ok) continue;
        var data = await response.json();
        var product = pick(Array.isArray(data.products) ? data.products : []);
        if (product) {
          render(box, product);
          return;
        }
      }
    } catch (_) {
      // Network error or over budget: the explanatory text stays.
    } finally {
      clearTimeout(timer);
    }
  }

  run();

  // The language switch keeps the visitor on the same section.
  var switcher = document.querySelector("a[hreflang]");
  if (switcher) {
    switcher.addEventListener("click", function () {
      var current = "";
      document.querySelectorAll("section[id]").forEach(function (section) {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.3) current = section.id;
      });
      switcher.href = switcher.href.split("#")[0] + (current ? "#" + current : "");
    });
  }

  // On the Spanish page, a browser that prefers English over Spanish gets a link to /en/.
  var hint = document.getElementById("read-en");
  if (hint) {
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]).map(function (l) { return l.toLowerCase(); });
    var firstEn = langs.findIndex(function (l) { return l.indexOf("en") === 0; });
    var firstEs = langs.findIndex(function (l) { return l.indexOf("es") === 0; });
    if (firstEn !== -1 && (firstEs === -1 || firstEn < firstEs)) hint.hidden = false;
  }

  // Browsers that still run the old app's service worker pick up its replacement.
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }
})();
