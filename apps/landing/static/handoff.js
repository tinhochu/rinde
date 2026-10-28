// Runs in <head>, before the page paints. Rinde's app used to live on this origin and its data
// (device session, cart, favorites...) is still in this origin's localStorage. Installed icons
// still open here, so they are forwarded to the app, carrying that data in the URL fragment,
// which never reaches a server. The app imports it only if it has no data of its own.
(function (root) {
  var PREFIX = "rinde-";
  var DONE = "rinde-handoff-done";
  var MAX = 65536;
  // Dropped first when the data is too big; the session and cart always go.
  var EXPENDABLE = ["rinde-searches", "rinde-picks", "rinde-seen-badges", "rinde-draft", "rinde-favorites"];
  var KEEP_MS = 30 * 24 * 3600 * 1000;

  function appKeys(storage) {
    var keys = [];
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (key && key.indexOf(PREFIX) === 0 && key !== DONE) keys.push(key);
    }
    return keys;
  }

  function collect(storage) {
    var data = {};
    appKeys(storage).forEach(function (key) { data[key] = storage.getItem(key); });
    return data;
  }

  function encode(data) {
    var bytes = new TextEncoder().encode(JSON.stringify(data));
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** The encoded data, trimmed under MAX by dropping expendable keys; null if it still doesn't fit. */
  function pack(data) {
    var copy = Object.assign({}, data);
    var encoded = encode(copy);
    for (var i = 0; encoded.length > MAX && i < EXPENDABLE.length; i++) {
      delete copy[EXPENDABLE[i]];
      encoded = encode(copy);
    }
    return encoded.length > MAX ? null : encoded;
  }

  /** Where to send someone opening the app from here; hands the data over once. */
  function handoffUrl(app, storage, now) {
    if (storage.getItem(DONE)) return app + "/";
    var data = collect(storage);
    if (Object.keys(data).length === 0) return app + "/";
    var packed = pack(data);
    storage.setItem(DONE, String(now));
    return packed ? app + "/#rinde-handoff=" + packed : app + "/";
  }

  /** The old copy is kept 30 days after the handoff as a backup, then removed. */
  function expire(storage, now) {
    var done = storage.getItem(DONE);
    if (done === null || now - Number(done) < KEEP_MS) return;
    appKeys(storage).forEach(function (key) { storage.removeItem(key); });
  }

  root.rindeHandoff = { collect: collect, encode: encode, pack: pack, handoffUrl: handoffUrl, expire: expire, MAX: MAX };
  if (typeof document === "undefined") return;

  try {
    var app = document.querySelector('meta[name="rinde-app"]').content;
    var storage = window.localStorage;
    expire(storage, Date.now());
    var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (standalone) {
      window.location.replace(handoffUrl(app, storage, Date.now()));
      return;
    }
    // A visitor with old app data takes it along when they open the app from this page.
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a[data-open-app]");
      if (!link || storage.getItem(DONE) || appKeys(storage).length === 0) return;
      event.preventDefault();
      window.location.assign(handoffUrl(app, storage, Date.now()));
    });
  } catch (_) {
    // Storage blocked or unavailable: links work as plain links.
  }
})(this);
