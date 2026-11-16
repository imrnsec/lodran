/* home.js — homepage rendering for Lodran */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var cats = await LodranData.getCategories();
    var books = await LodranData.getBooks();
    var articles = await LodranData.getArticles();

    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    // Category grid
    var catGrid = document.getElementById("categoryGrid");
    if (catGrid) {
      catGrid.innerHTML = cats.map(function (c) {
        var count = books.filter(function (b) { return b.category === c.id; }).length +
          articles.filter(function (a) { return a.category === c.id; }).length;
        var countLabel = count + " عنصر";
        return (
          '<a class="cat-card fade-in" href="library.html?category=' + encodeURIComponent(c.id) + '">' +
            '<div class="cat-icon">' + Lodran.iconSVG(c.icon) + "</div>" +
            '<h3 class="cat-name">' + Lodran.escapeHTML(c.name) + "</h3>" +
            (c.nameEn ? '<p class="cat-name-en">' + Lodran.escapeHTML(c.nameEn) + "</p>" : "") +
            '<p class="cat-desc">' + Lodran.escapeHTML(c.description) + "</p>" +
            '<p class="cat-count">' + countLabel + "</p>" +
          "</a>"
        );
      }).join("");
    }

    // Featured: first 4 books (most recent by year desc)
    var featured = books.slice().sort(function (a, b) { return b.year - a.year; }).slice(0, 4);
    var featuredGrid = document.getElementById("featuredGrid");
    if (featuredGrid) {
      featuredGrid.innerHTML = featured.map(function (b) {
        return Lodran.bookCard(b, catMap[b.category], books);
      }).join("");
      wireBookCards(featuredGrid);
    }

    // Recent articles: first 3 by date desc
    var recent = articles.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    }).slice(0, 3);
    var articleGrid = document.getElementById("articleGrid");
    if (articleGrid) {
      articleGrid.innerHTML = recent.map(function (a) {
        return Lodran.articleCard(a, catMap[a.category]);
      }).join("");
      Lodran.wireArticleCards(articleGrid);
    }

    // Quote of the day (deterministic by local day-of-year)
    try {
      var q = await LodranData.getQuoteOfTheDay();
      var qText = document.getElementById("quoteText");
      var qAttr = document.getElementById("quoteAttrib");
      var qAttrEn = document.getElementById("quoteAttribEn");
      if (q && qText) {
        qText.textContent = q.text;
        if (qAttr) qAttr.textContent = q.attrib ? "— " + q.attrib : "";
        if (qAttrEn) qAttrEn.textContent = q.attribEn || "";
        // Hide attribution lines if empty rather than leave blank lines
        if (qAttr && !q.attrib) qAttr.style.display = "none";
        if (qAttrEn && !q.attribEn) qAttrEn.style.display = "none";
      } else if (qText) {
        // No quotes available — hide the whole section quietly
        var qod = document.getElementById("quoteOfDay");
        if (qod) qod.style.display = "none";
      }
    } catch (e) {
      var qodFail = document.getElementById("quoteOfDay");
      if (qodFail) qodFail.style.display = "none";
    }
  });

  // Open the reader in a new tab/host page when a book card is clicked.
  function wireBookCards(scope) {
    scope.querySelectorAll('[data-action="read-book"]').forEach(function (el) {
      var open = function () {
        var id = el.getAttribute("data-book-id");
        window.open("reader.html?book=" + encodeURIComponent(id), "_self");
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
    Lodran.wireBookmarks(scope);
  }
})();
