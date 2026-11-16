/* search.js - full-text search across books/articles/gallery using Fuse.js */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var input = document.getElementById("searchInput");
    var count = document.getElementById("searchCount");
    var results = document.getElementById("searchResults");

    var cats = await LodranData.getCategories();
    var books = await LodranData.getBooks();
    var articles = await LodranData.getArticles();
    var gallery = await LodranData.getGallery();
    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    // Build a flat searchable corpus.
    var corpus = [];
    books.forEach(function (b) {
      corpus.push({
        kind: "book", kindLabel: "كتاب", id: b.id, title: b.title,
        titleEn: b.titleEn || "", subtitle: b.author || "",
        excerpt: b.description || "", tags: (b.tags || []).join(" "),
        extra: (b.year ? String(b.year) : ""), category: b.category, raw: b
      });
    });
    articles.forEach(function (a) {
      corpus.push({
        kind: "article", kindLabel: "مقالة", id: a.id, title: a.title,
        titleEn: a.titleEn || "", subtitle: a.author || "",
        excerpt: a.excerpt || "", tags: (a.tags || []).join(" "),
        extra: (a.readTime ? a.readTime + " د" : ""), category: a.category, raw: a
      });
    });
    gallery.forEach(function (g) {
      corpus.push({
        kind: "gallery", kindLabel: "صورة", id: g.id, title: g.title,
        titleEn: g.titleEn || "", subtitle: "",
        excerpt: g.description || "", tags: "", extra: "", category: g.category, raw: g
      });
    });

    // Fuse options: keys with weights (title > excerpt > tags > extra).
    var fuse = new Fuse(corpus, {
      keys: [
        { name: "title", weight: 0.45 },
        { name: "titleEn", weight: 0.25 },
        { name: "subtitle", weight: 0.04 },
        { name: "excerpt", weight: 0.18 },
        { name: "tags", weight: 0.07 },
        { name: "extra", weight: 0.01 }
      ],
      threshold: 0.30,        // stricter than default 0.6 — only close matches
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeScore: true,
      ignoreFieldNorm: true,
      useExtendedSearch: false // disable '|=' operators; we want simple fuzzy matching
    });

    var state = { query: "", kind: "all" };

    document.querySelectorAll('input[name="kind"]').forEach(function (el) {
      el.addEventListener("change", function () { state.kind = el.value; render(); });
    });

    input.addEventListener("input", function () {
      state.query = input.value.trim();
      render();
    });

    // Read ?q= from URL so other pages can deep-link into a search.
    var params = new URLSearchParams(location.search);
    var preset = params.get("q");
    if (preset) { input.value = preset; state.query = preset; render(); }

    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function highlight(text, q) {
      if (!q) return Lodran.escapeHTML(text);
      var esc = Lodran.escapeHTML(text);
      // Whole-word-ish highlight: split query into tokens by whitespace; for
      // each token, escape regex special chars and wrap matches.
      var tokens = q.split(/\s+/).filter(Boolean).map(escapeRe);
      if (!tokens.length) return esc;
      var re = new RegExp("(" + tokens.join("|") + ")", "gi");
      return esc.replace(re, "<mark>$1</mark>");
    }

    function resultCard(item) {
      var cat = catMap[item.category] || {};
      var catName = cat.name || "";
      var title = highlight(item.title || "", state.query);
      var subtitle = highlight(item.subtitle || "", state.query);
      var excerpt = highlight(item.excerpt || "", state.query);
      var tags = (item.raw.tags || []).slice(0, 5).map(function (t) {
        return '<span class="tag">#' + Lodran.escapeHTML(t) + "</span>";
      }).join("");

      var href = "#";
      var cover = "";
      if (item.kind === "book") { href = "reader.html?book=" + encodeURIComponent(item.id); }
      else if (item.kind === "article") { href = "library.html#articles"; }
      else if (item.kind === "gallery") {
        href = "gallery.html";
        cover = item.raw.source ? '<div class="search-result-cover"><img src="' + Lodran.escapeHTML(item.raw.source) + '" alt="" loading="lazy"></div>' : "";
      }

      return (
        '<article class="search-result" data-kind="' + item.kind + '">' +
          (cover || "") +
          '<div class="search-result-body">' +
            '<p class="card-cat">' + Lodran.escapeHTML(item.kindLabel) + (catName ? " · " + Lodran.escapeHTML(catName) : "") + "</p>" +
            '<h3><a href="' + href + '">' + title + "</a></h3>" +
            (item.titleEn ? '<p class="card-title-sub">' + Lodran.escapeHTML(item.titleEn) + "</p>" : "") +
            (subtitle ? '<p class="card-meta">' + subtitle + (item.extra ? " · " + Lodran.escapeHTML(item.extra) : "") + "</p>" : "") +
            (excerpt ? '<p class="card-desc">' + excerpt + "</p>" : "") +
            (tags ? '<div class="card-tags">' + tags + "</div>" : "") +
          "</div>" +
        "</article>"
      );
    }

    function render() {
      var q = state.query;
      if (!q) {
        results.innerHTML = '<p class="empty-state">اكتب كلمةً للبحث عنها في أرجاء لُدران.</p>';
        count.textContent = "ابدأ بالكتابة…";
        return;
      }
      // Always include exact substring matches (case-insensitive) — Fuse is
      // fuzzy and may miss obvious ones; a direct includes() guarantees them.
      var ql = q.toLowerCase();
      var sureHits = corpus.filter(function (item) {
        var hay = (
          (item.title || "") + " " + (item.titleEn || "") + " " +
          (item.subtitle || "") + " " + (item.excerpt || "") + " " +
          (item.tags || "") + " " + (item.extra || "")
        ).toLowerCase();
        return hay.indexOf(ql) !== -1;
      });
      // Union of sureHits + Fuse results, dedup by id, ordering fuzzy-score
      // first then substring ones afterwards.
      var seen = {};
      var fuzzyIds = [];
      var fuzzy = fuse.search(q).filter(function (h) {
        if (seen[h.item.id]) return false;
        seen[h.item.id] = true; fuzzyIds.push(h.item.id); return true;
      }).map(function (h) { return h.item; });
      var extras = sureHits.filter(function (item) {
        if (seen[item.id]) return false; seen[item.id] = true; return true;
      });
      var hits = fuzzy.concat(extras);
      if (state.kind !== "all") hits = hits.filter(function (h) { return h.kind === state.kind; });
      count.textContent = hits.length + " نتيجة";
      results.innerHTML = hits.length
        ? hits.map(function (item) { return resultCard(item); }).join("")
        : '<p class="empty-state">لا نتائجَ مطابقة. جرّب صياغةً مختلفة.</p>';
      try { history.replaceState(null, "", "search.html?q=" + encodeURIComponent(q)); } catch (e) {}
    }
  });
})();
