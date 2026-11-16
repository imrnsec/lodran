/* timeline.js — cultural timeline by year for Lodran
 *
 * Books are placed by book.year (publication year); articles by date year.
 * Items render on a vertical axis with markers — newest at the top. A filter
 * row narrows to a category. Clicking a book opens the reader; clicking an
 * article opens the library.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var root = document.getElementById("timeline");
    var filtersEl = document.getElementById("timelineFilters");
    if (!root) return;

    var cats = await LodranData.getCategories();
    var books = await LodranData.getBooks();
    var articles = await LodranData.getArticles();

    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    // Build a unified entry set [{ year, kind, title, subtitle, href, cover, category, raw }]
    var entries = [];
    books.forEach(function (b) {
      if (b.year) entries.push({
        year: b.year, kind: "book", title: b.title, subtitle: b.author,
        href: "reader.html?book=" + encodeURIComponent(b.id),
        category: b.category, raw: b, catLabel: catMap[b.category] ? catMap[b.category].name : ""
      });
    });
    articles.forEach(function (a) {
      if (a.date) {
        var y = new Date(a.date).getFullYear();
        if (!isNaN(y)) entries.push({
          year: y, kind: "article", title: a.title, subtitle: a.author,
          href: "library.html#articles", category: a.category, raw: a,
          catLabel: catMap[a.category] ? catMap[a.category].name : ""
        });
      }
    });

    // Group entries by year (descending).
    function groupAndSort() {
      var byYear = {};
      entries.forEach(function (e) { (byYear[e.year] = byYear[e.year] || []).push(e); });
      var years = Object.keys(byYear).map(Number).sort(function (a, b) { return b - a; });
      return { byYear: byYear, years: years };
    }

    var state = { category: "all" };

    // Filter chips
    var pills = ['<button class="gfilter active" data-cat="all">الكل</button>'];
    cats.forEach(function (c) {
      var n = entries.filter(function (e) { return e.category === c.id; }).length;
      if (n) pills.push('<button class="gfilter" data-cat="' + c.id + '">' + c.name + " (" + n + ")</button>");
    });
    filtersEl.innerHTML = pills.join("");
    filtersEl.querySelectorAll(".gfilter").forEach(function (b) {
      b.addEventListener("click", function () {
        filtersEl.querySelectorAll(".gfilter").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        state.category = b.dataset.cat;
        render();
      });
    });

    function entryHTML(e) {
      var colorCls = Lodran.colorClassFor(e.raw);
      var catStr = e.catLabel ? " · " + Lodran.escapeHTML(e.catLabel) : "";
      var kindIcon = e.kind === "book" ? "📖" : "✎";
      return (
        '<a class="tl-entry ' + colorCls + '" href="' + e.href + '">' +
          '<span class="tl-entry-kind">' + kindIcon + "</span>" +
          '<span class="tl-entry-body">' +
            '<span class="tl-entry-title">' + Lodran.escapeHTML(e.title) + "</span>" +
            '<span class="tl-entry-sub">' + Lodran.escapeHTML(e.subtitle) + catStr + "</span>" +
          "</span>" +
        "</a>"
      );
    }

    function render() {
      var g = groupAndSort();
      var html = '<div class="tl-axis"></div>';
      var any = false;
      g.years.forEach(function (y) {
        var items = g.byYear[y];
        if (state.category !== "all") items = items.filter(function (e) { return e.category === state.category; });
        if (!items.length) return;
        any = true;
        html +=
          '<div class="tl-year fade-in">' +
            '<div class="tl-year-marker">' +
              '<span class="tl-year-label">' + y + "</span>" +
              '<span class="tl-year-count">' + items.length + " عُنصر</span>" +
            "</div>" +
            '<div class="tl-year-items">' + items.map(entryHTML).join("") + "</div>" +
          "</div>";
      });
      root.innerHTML = html + (!any
        ? '<p class="empty-state">لا عناصر في هذا التصنيف على الخطّ الزمني بعد.</p>'
        : "");
    }

    render();
  });
})();
