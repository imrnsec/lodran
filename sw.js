/* sw.js — Lodran service worker
 *
 * A small, intentionally-cache-first strategy that makes Lodran work offline.
 * Strategy:
 *   - Pre-cache the shell (HTML pages + core JS/CSS + font-fallback CSS) at
 *     install so the site opens offline after the first online visit.
 *   - Runtime caching:
 *       * JSON data  → cache-first (data is small and changes rarely; the
 *         cache busts when SW version bumps and re-installs).
 *       * Same-origin images (covers, gallery) → cache-first.
 *       * Google Fonts requests → stale-while-revalidate (best-effort; if the
 *         network is gone we still serve what we have, otherwise we fall back
 *         to system fonts defined in css/style.css).
 *   - navigation requests for HTML → network-first, falling back to cache so
 *     updated content shows when online but the shell still opens offline.
 *
 * Bump CACHE_VERSION whenever you ship a release and want clients to refresh
 * their precache + take over faster.
 */
var CACHE_VERSION = "lodran-v2";
var SHELL_CACHE = CACHE_VERSION + "-shell";
var DATA_CACHE = CACHE_VERSION + "-data";
var IMG_CACHE = CACHE_VERSION + "-img";
var FONT_CACHE = CACHE_VERSION + "-fonts";

var SHELL_ASSETS = [
  "./",
  "./index.html",
  "./library.html",
  "./gallery.html",
  "./shelf.html",
  "./reader.html",
  "./search.html",
  "./timeline.html",
  "./about.html",
  "./404.html",
  "./css/style.css",
  "./js/data.js",
  "./js/app.js",
  "./js/home.js",
  "./js/library.js",
  "./js/gallery.js",
  "./js/shelf.js",
  "./js/reader.js",
  "./js/search.js",
  "./js/timeline.js",
  "./data/categories.json",
  "./data/books.json",
  "./data/articles.json",
  "./data/book-text.json",
  "./data/quotes.json",
  "./data/gallery.json",
  "./assets/images/logo.svg",
  "./assets/images/hero.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // addAll is all-or-nothing; some assets (timeline.html, search.html) may
      // not exist yet on older clients, so add individually and tolerate fails.
      return Promise.all(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* ignore missing */ });
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.indexOf(CACHE_VERSION) !== 0; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // HTML navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match("./index.html");
        });
      })
    );
    return;
  }

  // JSON data files: cache-first.
  if (url.pathname.indexOf("/data/") === 0 || url.pathname.endsWith(".json")) {
    e.respondWith(
      caches.open(DATA_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
        });
      })
    );
    return;
  }

  // Google Fonts: stale-while-revalidate.
  if (url.hostname.indexOf("fonts.googleapis.com") !== -1 ||
      url.hostname.indexOf("fonts.gstatic.com") !== -1) {
    e.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var net = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || net;
        });
      })
    );
    return;
  }

  // Same-origin images (covers + gallery): cache-first.
  if (url.origin === self.location.origin &&
      /\.(?:svg|png|jpe?g|webp|gif)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
        });
      })
    );
    return;
  }

  // Same-origin static shell assets (js/css): cache-first.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
            var clone = res.clone();
            caches.open(SHELL_CACHE).then(function (c) { c.put(req, clone); });
          }
          return res;
        }).catch(function () { return cached; });
      })
    );
  }
});
