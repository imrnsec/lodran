/* app.js - shared Lodran app: header, footer, navigation, icon registry, helpers
 *
 * Shared cross-page functionality:
 *   - layout (header/footer/nav)
 *   - icon + card rendering
 *   - localStorage stores for reader prefs, bookmarks, notes, reading stats
 *   - theme (light/sepia/night) + language (ar/en) toggles wired from the header
 *   - service worker registration (offline support — see sw.js)
 *   - keyboard-shortcut hint overlay (?)
 */
(function (global) {
  "use strict";

  // SVG icon set used across category cards and filters.
  var ICONS = {
    book: '<path d="M3 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15H5a2 2 0 0 1-2-2V5zm12 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4V5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
    scroll: '<path d="M6 3h9a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9l-2-3H4V6a3 3 0 0 1 2-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/><path d="M8 8h7M8 12h7M8 16h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    compass: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15.5 8.5l-2 5.5-5 1.5 2-5 5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7.4-9-7.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/><circle cx="8" cy="11" r="1.3" fill="currentColor"/><circle cx="12" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="11" r="1.3" fill="currentColor"/>',
    feather: '<path d="M20 4c-5 0-9 2-12 5l-3 3 3 3c3-3 5-7 12-8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/><path d="M8 16l4-4M5 19l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    abc: '<path d="M4 17V8l3 4 3-4v11M15 9h4v8M15 13h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
  };

  function iconSVG(name) {
    var body = ICONS[name] || ICONS.book;
    return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + body + "<\/svg>";
  }

  // Escape HTML special characters using Unicode escapes for entity strings
  // so they are never mangled by tooling/transports.
  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "\u0026amp;",
        "<": "\u0026lt;",
        ">": "\u0026gt;",
        '"': "\u0026quot;",
        "'": "\u0026#39;"
      }[c];
    });
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("ar-SD", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) { return iso; }
  }

  function currentPage() {
    var path = (location.pathname.split("/").pop() || "index.html");
    return path;
  }

  var NAV = [
    { href: "index.html", label: "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" },
    { href: "library.html", label: "\u0627\u0644\u0645\u0643\u062A\u0628\u0629" },
    { href: "shelf.html", label: "\u062E\u0631\u064A\u0637\u0629 \u0627\u0644\u0631\u0641\u0648\u0641" },
    { href: "timeline.html", label: "\u062E\u064A\u0637 \u0627\u0644\u0632\u0645\u0646" },
    { href: "gallery.html", label: "\u0627\u0644\u0645\u0639\u0631\u0636" },
    { href: "search.html", label: "\u0628\u062D\u062B" },
    { href: "about.html", label: "\u0639\u0646 \u0644\u064F\u062F\u0631\u0627\u0646" }
  ];

  function renderHeader() {
    var el = document.getElementById("siteHeader");
    if (!el) return;
    var page = currentPage();
    var links = NAV.map(function (n) {
      var active = (n.href === page) || (n.href === "index.html" && page === "");
      return '<a class="nav-link' + (active ? " active" : "") + '" href="' + n.href + '">' + n.label + "</a>";
    }).join("");
    var lang = currentLang();
    var langLabel = lang === "ar" ? "EN" : "ع";
    el.innerHTML =
      '<nav class="nav">' +
        '<a class="brand" href="index.html">' +
          '<img class="brand-mark" src="assets/images/logo.svg" alt="logo">' +
          "<span>\u0644\u064F\u062F\u0631\u0627\u0646</span>" +
        "</a>" +
        '<div class="nav-links" id="navLinks">' + links + "</div>" +
        '<div class="nav-tools">' +
          '<a class="nav-icon" href="search.html" aria-label="\u0628\u062D\u062B" title="\u0628\u062D\u062B">' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
          "</a>" +
          '<a class="nav-icon" href="shelf.html#saved" aria-label="\u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0627\u062A" title="\u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0627\u062A" id="navBookmarks">' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4h10v17l-5-4-5 4V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/></svg>' +
            '<span class="nav-badge hidden" id="navBookmarkBadge">0</span>' +
          "</a>" +
          '<button class="nav-icon" id="themeBtn" aria-label="\u0627\u0644\u0646\u0645\u0637" title="\u0627\u0644\u0644\u0648\u0646">' +
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>' +
          "</button>" +
          '<button class="nav-icon nav-lang" id="langBtn" aria-label="\u0627\u0644\u0644\u063A\u0629" title="\u0627\u0644\u0644\u063A\u0629">' + langLabel + "</button>" +
        "</div>" +
        '<button class="nav-toggle" id="navToggle" aria-label="menu">&#9776;</button>' +
      "</nav>";
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("navLinks");
    if (toggle && menu) {
      toggle.addEventListener("click", function () { menu.classList.toggle("open"); });
    }
    var themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", cycleTheme);
    var langBtn = document.getElementById("langBtn");
    if (langBtn) langBtn.addEventListener("click", toggleLang);
    updateBookmarkBadge();
  }

  function renderFooter() {
    var el = document.getElementById("siteFooter");
    if (!el) return;
    el.innerHTML =
      '<div class="footer-inner">' +
        '<div class="footer-col">' +
          '<div class="footer-brand">\u0644\u064F\u062F\u0631\u0627\u0646</div>' +
          '<p class="footer-tag">\u0645\u0643\u062A\u0628\u0629\u064C \u062B\u0642\u0627\u0641\u064A\u0629 \u063A\u064A\u0631 \u0631\u0628\u062D\u064A\u0629\u060C \u064A\u0639\u062A\u0646\u064A \u0628\u0647\u0627 \u0645\u062A\u0637\u0648\u0651\u0639\u0648\u0646.</p>' +
        "</div>" +
        '<div class="footer-col">' +
          "<h4>\u062A\u0635\u0641\u0651\u062D</h4>" +
          '<a href="library.html">\u0627\u0644\u0645\u0643\u062A\u0628\u0629</a>' +
          '<a href="shelf.html">\u062E\u0631\u064A\u0637\u0629 \u0627\u0644\u0631\u0641\u0648\u0641</a>' +
          '<a href="gallery.html">\u0627\u0644\u0645\u0639\u0631\u0636</a>' +
          '<a href="index.html">\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629</a>' +
        "</div>" +
        '<div class="footer-col">' +
          "<h4>\u0639\u0646</h4>" +
          '<a href="about.html">\u0639\u0646 \u0644\u064F\u062F\u0631\u0627\u0646</a>' +
        "</div>" +
      "</div>" +
      '<div class="footer-bottom">' +
        '<span>&copy; ' + new Date().getFullYear() + " \u0644\u064F\u062F\u0631\u0627\u0646 \u2014 \u0645\u0643\u0628\u0629\u064C \u063A\u064A\u0631 \u0631\u0628\u062D\u064A\u0629.</span>" +
        "<span>\u0645\u0648\u0642\u0639\u064C \u062B\u0627\u0628\u062A \u00B7 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0641\u064A \u0645\u0644\u0641\u0627\u062A JSON</span>" +
      "</div>";
  }

  // Colorful "Issue 00N" cards for books. Color index from position within category.
  var CARD_COLORS = 6;
  function colorClassFor(book, allBooks) {
    var sameCat = (allBooks || [book]).filter(function (b) { return b.category === book.category; });
    var idx = sameCat.indexOf(book);
    if (idx < 0) idx = 0;
    return "card-" + (idx % CARD_COLORS);
  }
  function pad(n, width) { n = String(n); while (n.length < width) n = "0" + n; return n; }

  // Reading progress (localStorage, keyed by book id). Used by book cards to
  // show a thin progress bar so readers can spot in-progress titles at a glance.
  var PROGRESS_KEY = "lodran.progress";
  function readAllProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function bookProgress(bookId) { return readAllProgress()[bookId] || null; }

  function bookCard(book, category, allBooks) {
    var cat = category || {};
    var colCls = colorClassFor(book, allBooks);
    var number = book.number || book.id.replace(/[^0-9]/g, "") || "001";
    var numLabel = "#" + pad(String(number), 3);
    var icn = iconSVG(cat.icon || "book");
    var titleEnLine = book.titleEn
      ? '<p style="font-family:var(--font-sans);font-size:.8rem;opacity:.75;margin:.1rem 0 .6rem">' + escapeHTML(book.titleEn) + "</p>"
      : "";
    // Optional progress bar (only if the user has started this book)
    var prog = bookProgress(book.id);
    var progBar = "";
    if (prog && prog.total) {
      var pct = Math.min(100, Math.round((prog.page / prog.total) * 100));
      progBar =
        '<div class="book-card-progress" title="صفحة ' + prog.page + " من " + prog.total + '">' +
          '<div class="book-card-progress-fill" style="width:' + pct + '%"></div>' +
        "</div>";
    }
    return (
      '<article class="book-card ' + colCls + ' fade-in" data-book-id="' + escapeHTML(book.id) + '" data-action="read-book" tabindex="0" role="button" aria-label="read: ' + escapeHTML(book.title) + '">' +
        '<button class="bookmark-star' + (isBookmark(book.id) ? " on" : "") + '" data-bookmark="' + escapeHTML(book.id) + '" type="button" aria-label="\u062D\u0641\u0638" title="\u062D\u0641\u0638 \u0644\u0650\u0644\u0627\u062D\u0642\u0627\u064B" aria-pressed="' + (isBookmark(book.id) ? "true" : "false") + '">\u2605</button>' +
        '<div class="book-card-top">' +
          '<span class="book-card-num">' + numLabel + " \u00B7 \u0644\u064F\u062F\u0631\u0627\u0646</span>" +
          '<span class="book-card-icn">' + icn + "</span>" +
        "</div>" +
        '<span class="book-card-catlabel">' + escapeHTML(cat.name || "") +
          (cat.nameEn ? '<span class="book-card-catlabel-en">' + escapeHTML(cat.nameEn) + "</span>" : "") +
        "</span>" +
        '<h3 class="book-card-title">' + escapeHTML(book.title) + "</h3>" +
        titleEnLine +
        '<p class="book-card-author">' + escapeHTML(book.author) + (book.year ? " \u00B7 " + escapeHTML(String(book.year)) : "") + "</p>" +
        '<div class="book-card-foot">' +
          '<span class="book-card-meta">' + (book.pages ? escapeHTML(String(book.pages)) + " \u0635\u0641\u062D\u0629" : escapeHTML(book.language || "")) + "</span>" +
          '<span class="book-card-read">' + (prog && prog.page > 1 ? "\u0623\u0643\u0645\u0644 \u21A9" : "\u0627\u0642\u0631\u0623 \u21A9") + "</span>" +
        "</div>" +
        progBar +
      "</article>"
    );
  }

  function articleCard(article, category) {
    var catName = category ? category.name : "";
    var catNameEn = category ? (category.nameEn || "") : "";
    var tags = (article.tags || []).slice(0, 3).map(function (t) {
      return '<span class="tag">#' + escapeHTML(t) + "</span>";
    }).join("");
    return (
      '<article class="card fade-in" data-article-id="' + escapeHTML(article.id) + '" data-action="read-article" tabindex="0" role="button" aria-label="read: ' + escapeHTML(article.title) + '">' +
        '<div class="card-cover card-cover-wide">' +
          '<img src="' + escapeHTML(article.cover) + '" alt="cover" loading="lazy">' +
        "</div>" +
        '<div class="card-body">' +
          (catName ? '<p class="card-cat">' + escapeHTML(catName) + (catNameEn ? '<span class="card-cat-en">' + escapeHTML(catNameEn) + "</span>" : "") + "</p>" : "") +
          '<h3 class="card-title">' + escapeHTML(article.title) + "</h3>" +
          (article.titleEn ? '<p class="card-title-sub">' + escapeHTML(article.titleEn) + "</p>" : "") +
          '<p class="card-meta">' + escapeHTML(article.author) + " \u00B7 " + formatDate(article.date) + " \u00B7 " + escapeHTML(String(article.readTime)) + " \u062F\u0642\u0627\u0626\u0642 \u0642\u0631\u0627\u0621\u0629</p>" +
          '<p class="card-desc">' + escapeHTML(article.excerpt) + "</p>" +
          (tags ? '<div class="card-tags">' + tags + "</div>" : "") +
        "</div>" +
      "</article>"
    );
  }

  // ---------------- Shared localStorage stores ----------------
  // Each is namespaced "lodran.*". All reader-facing persistence goes here
  // (no backend), so the project stays a static site with optional offline.

  // Common layout init for all pages (header + footer).
  function initLayout() {
    renderHeader();
    renderFooter();
  }

  function getStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch (e) { return fallback; }
  }
  function setStore(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // --- Theme (light / sepia / night) ---
  var THEME_KEY = "lodran.theme";
  function currentTheme() { return localStorage.getItem(THEME_KEY) || "light"; }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    var btn = document.getElementById("themeBtn");
    if (btn) btn.setAttribute("aria-pressed", theme === "night" ? "true" : "false");
  }
  function cycleTheme() {
    var order = ["light", "sepia", "night"];
    var next = order[(order.indexOf(currentTheme()) + 1) % order.length];
    applyTheme(next);
  }

  // --- Language (ar / en) ---
  // Toggle direction + lang attribute across the whole document. UI strings
  // (data-i18n pairs) get swapped if present; otherwise the toggle is mostly
  // about direction/typography and content fields show whatever the JSON has.
  var LANG_KEY = "lodran.lang";
  function currentLang() { return localStorage.getItem(LANG_KEY) || "ar"; }
  function applyLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === "en") ? "ltr" : "rtl";
    // Swap any data-i18n-en / data-i18n-ar elements in place.
    document.querySelectorAll("[data-i18n-ar]").forEach(function (el) {
      var v = (lang === "en") ? (el.getAttribute("data-i18n-en") || "") : el.getAttribute("data-i18n-ar") || "";
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-ar-ph]").forEach(function (el) {
      var v = (lang === "en") ? (el.getAttribute("data-i18n-en-ph") || "") : el.getAttribute("data-i18n-ar-ph") || "";
      if (v) el.setAttribute("placeholder", v);
    });
    var btn = document.getElementById("langBtn");
    if (btn) btn.textContent = (lang === "ar") ? "EN" : "\u0639";
  }
  function toggleLang() { applyLang(currentLang() === "ar" ? "en" : "ar"); }

  // --- Bookmarks (saved items) ---
  // Stored as a map keyed by book id: { id: { id, title, titleEn, author, ts } }
  var BM_KEY = "lodran.bookmarks";
  function allBookmarks() { return getStore(BM_KEY, {}); }
  function isBookmark(id) { return Object.prototype.hasOwnProperty.call(allBookmarks(), id); }
  function toggleBookmark(book) {
    var all = allBookmarks();
    if (all[book.id]) delete all[book.id];
    else all[book.id] = {
      id: book.id, title: book.title, titleEn: book.titleEn || "",
      author: book.author, category: book.category || "", ts: Date.now()
    };
    setStore(BM_KEY, all);
    updateBookmarkBadge();
    return !!all[book.id];
  }
  function updateBookmarkBadge() {
    var n = Object.keys(allBookmarks()).length;
    var badge = document.getElementById("navBookmarkBadge");
    if (badge) {
      badge.textContent = String(n);
      badge.classList.toggle("hidden", n === 0);
    }
  }

  // --- Personal notes ---
  // Stored as { item-id: [{ id, text, ts, start?, end? }] }  optional offsets
  // (character offsets) for text highlights in articles.
  var NOTES_KEY = "lodran.notes";
  function getNotes(itemId) {
    var all = getStore(NOTES_KEY, {});
    return all[itemId] || [];
  }
  function addNote(itemId, note) {
    var all = getStore(NOTES_KEY, {});
    if (!all[itemId]) all[itemId] = [];
    note.id = "n" + Date.now() + Math.floor(Math.random() * 1000);
    note.ts = Date.now();
    all[itemId].push(note);
    setStore(NOTES_KEY, all);
    return note;
  }
  function deleteNote(itemId, noteId) {
    var all = getStore(NOTES_KEY, {});
    if (!all[itemId]) return;
    all[itemId] = all[itemId].filter(function (n) { return n.id !== noteId; });
    if (!all[itemId].length) delete all[itemId];
    setStore(NOTES_KEY, all);
  }
  function updateNote(itemId, noteId, text) {
    var all = getStore(NOTES_KEY, {});
    if (!all[itemId]) return;
    all[itemId] = all[itemId].map(function (n) {
      return n.id === noteId ? Object.assign({}, n, { text: text, ts: Date.now() }) : n;
    });
    setStore(NOTES_KEY, all);
  }

  // --- Reading stats (per-item sessions + totals) ---
  // Schema: { sessions: [{ kind: "book"|"article", id, title, category, start, end, ms }],
  //           totalsByCategory: { history: ms, ... },
  //           lastOpened: ISO-date-string,  // for "reading streak"
  //           openedDays: ["2026-01-02", ...] // unique dates user read something
  //         }
  var STATS_KEY = "lodran.stats";
  function getStats() {
    return getStore(STATS_KEY, { sessions: [], totalsByCategory: {}, lastOpened: null, openedDays: [] });
  }
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = "0" + m;
    var day = String(d.getDate()); if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function recordOpen(kind, item) {
    // Called when an item is opened — sets lastOpened + adds today to openedDays
    // and bumps a "opened count" for the streak. Light-weight; full session
    // ms is recorded by recordSession below.
    var s = getStats();
    var t = todayStr();
    if (!s.openedDays) s.openedDays = [];
    if (s.openedDays.indexOf(t) === -1) s.openedDays.push(t);
    s.openedDays.sort();
    if (s.openedDays.length > 400) s.openedDays = s.openedDays.slice(-400);
    s.lastOpened = t;
    setStore(STATS_KEY, s);
  }
  function recordSession(kind, item, startMs, endMs) {
    var s = getStats();
    var ms = Math.max(0, endMs - startMs);
    if (!s.sessions) s.sessions = [];
    s.sessions.push({
      kind: kind, id: item.id, title: item.title || "",
      category: item.category || "", start: startMs, end: endMs, ms: ms
    });
    if (s.sessions.length > 800) s.sessions = s.sessions.slice(-800);
    var cat = item.category || "uncategorized";
    if (!s.totalsByCategory) s.totalsByCategory = {};
    s.totalsByCategory[cat] = (s.totalsByCategory[cat] || 0) + ms;
    setStore(STATS_KEY, s);
    return s;
  }
  function statsSummary() {
    var s = getStats();
    var totalMs = (s.sessions || []).reduce(function (acc, x) { return acc + (x.ms || 0); }, 0);
    var minutes = Math.round(totalMs / 60000);
    var itemsRead = (s.sessions || []).reduce(function (acc, x) {
      if (acc.indexOf(x.id) === -1) acc.push(x.id); return acc;
    }, []).length;
    // Streak: consecutive days ending today/yesterday.
    var streak = 0;
    var days = (s.openedDays || []).slice().sort();
    if (days.length) {
      var today = new Date(todayStr() + "T00:00:00");
      var cur = new Date(days[days.length - 1] + "T00:00:00");
      // If last opened is today or yesterday, count back consecutively.
      var diffDays = Math.round((today - cur) / 86400000);
      if (diffDays <= 1) {
        streak = 1;
        for (var i = days.length - 2; i >= 0; i--) {
          var a = new Date(days[i] + "T00:00:00");
          var b = new Date(days[i + 1] + "T00:00:00");
          if (Math.round((b - a) / 86400000) === 1) streak++;
          else break;
        }
      }
    }
    return {
      totalMs: totalMs, minutes: minutes,
      sessions: s.sessions || [],
      itemsOpened: itemsRead,
      totalsByCategory: s.totalsByCategory || {},
      streak: streak,
      openedDays: s.openedDays || []
    };
  }

  // --- Service worker registration (offline support) ---
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* silent */ });
    });
  }

  // Apply persisted theme/language very early (avoid a flash) — best-effort.
  // Read from localStorage directly so init order doesn't matter; the helper
  // functions also write, but that's idempotent.
  (function earlyApply() {
    var t = "light";
    try { t = localStorage.getItem(THEME_KEY) || "light"; } catch (e) {}
    document.documentElement.setAttribute("data-theme", t);
    var l = "ar";
    try { l = localStorage.getItem(LANG_KEY) || "ar"; } catch (e) {}
    document.documentElement.lang = l;
    document.documentElement.dir = (l === "en") ? "ltr" : "rtl";
  })();
  registerSW();


  // --- Clipboard + toast ---
  // Copy text to the clipboard with the modern async API, falling back to the
  // legacy execCommand path on older browsers. Shows a calm transient toast
  // (auto-dismiss ~2s).
  function copyToClipboard(text) {
    return new Promise(function (resolve) {
      function done(ok) { showToast(ok ? "تم نسخ الرابط" : "تعذّر النسخ — انسخه يدويًا"); resolve(ok); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
          fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-1000px";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          done(ok);
        } catch (e) { done(false); }
      }
    });
  }

  var toastTimer = null;
  function showToast(message) {
    var el = document.getElementById("lodranToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "lodranToast";
      el.className = "lodran-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  // Build a fully-qualified share URL for a path (so copied links work from
  // anywhere, not just same-page relative navigation).
  function shareURL(path) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, "");
    return base + path.replace(/^\.\//, "");
  }

  // Wire any share buttons within scope. Each <button data-share="..."> gets a
  // click handler that resolves the URL template (supports {id} placeholder)
  // and copies the absolute URL.
  function wireShare(scope) {
    (scope || document).querySelectorAll("[data-share]").forEach(function (btn) {
      if (btn.__lodranWired) return;
      btn.__lodranWired = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var tmpl = btn.getAttribute("data-share");
        var id = btn.getAttribute("data-share-id") || "";
        var path = tmpl.replace("{id}", encodeURIComponent(id));
        copyToClipboard(shareURL(path));
      });
    });
  }

  // Open the article page when an article card is clicked.
  function wireArticleCards(scope) {
    (scope || document).querySelectorAll('[data-action="read-article"]').forEach(function (el) {
      var open = function () {
        var id = el.getAttribute("data-article-id");
        window.open("article.html?id=" + encodeURIComponent(id), "_self");
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  // Wire any bookmark star buttons within the given scope so clicking the star
  // toggles saved state without firing the parent card's "open reader" click.
  function wireBookmarks(scope) {
    (scope || document).querySelectorAll("[data-bookmark]").forEach(function (btn) {
      if (btn.__lodranWired) return;
      btn.__lodranWired = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var id = btn.getAttribute("data-bookmark");
        // Light title/author are stored from the data attributes or follow-on getBookById
        var bookStub = { id: id, title: "", titleEn: "", author: "", category: "" };
        // If the parent card exposes a data-book-id and renders the title nearby,
        // we can pull them off sibling elements for a richer saved row.
        var card = btn.closest("[data-book-id]");
        if (card) {
          var t = card.querySelector(".book-card-title");
          var a = card.querySelector(".book-card-author");
          if (t) bookStub.title = t.textContent.trim();
          if (a) bookStub.author = a.textContent.split("\u00B7")[0].trim();
        }
        var on = toggleBookmark(bookStub);
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }

  global.Lodran = {
    iconSVG: iconSVG,
    escapeHTML: escapeHTML,
    formatDate: formatDate,
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    bookCard: bookCard,
    articleCard: articleCard,
    colorClassFor: colorClassFor,
    initLayout: initLayout,
    // theme + language
    currentTheme: currentTheme,
    applyTheme: applyTheme,
    cycleTheme: cycleTheme,
    currentLang: currentLang,
    applyLang: applyLang,
    toggleLang: toggleLang,
    // bookmarks
    allBookmarks: allBookmarks,
    isBookmark: isBookmark,
    toggleBookmark: toggleBookmark,
    updateBookmarkBadge: updateBookmarkBadge,
    wireBookmarks: wireBookmarks,
    wireArticleCards: wireArticleCards,
    // share + toast
    copyToClipboard: copyToClipboard,
    showToast: showToast,
    shareURL: shareURL,
    wireShare: wireShare,
    // notes
    getNotes: getNotes,
    addNote: addNote,
    deleteNote: deleteNote,
    updateNote: updateNote,
    // stats
    getStats: getStats,
    recordOpen: recordOpen,
    recordSession: recordSession,
    statsSummary: statsSummary,
    todayStr: todayStr,
    // storage primitives for power-users / future pages
    getStore: getStore,
    setStore: setStore
  };
})(window);
