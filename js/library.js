/* library.js — books & articles list with filtering, search, tabs */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var cats = await LodranData.getCategories();
    var books = await LodranData.getBooks();
    var articles = await LodranData.getArticles();

    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    var state = {
      kind: "all",
      category: "all",
      query: "",
      tab: "books",
    };

    // Read ?category= from URL (set by home category cards)
    var params = new URLSearchParams(location.search);
    var preset = params.get("category");
    if (preset && catMap[preset]) state.category = preset;

    // Read #articles hash
    if (location.hash === "#articles") state.tab = "articles";

    // Populate category filter chips
    var catFilters = document.getElementById("categoryFilters");
    if (catFilters) {
      catFilters.innerHTML = cats.map(function (c) {
        return (
          '<label class="filter-chip-wrap"><input type="radio" name="category" value="' + c.id + '">' +
          "<span>" + Lodran.escapeHTML(c.name) + "</span></label>"
        );
      }).join("");
    }

    // Tabs
    function setTab(tab) {
      state.tab = tab;
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.tab === tab);
      });
      document.getElementById("booksGrid").classList.toggle("hidden", tab !== "books");
      document.getElementById("articlesGrid").classList.toggle("hidden", tab !== "articles");
      // Kind radio: when on a tab, "all" means show that kind only
      render();
    }

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { setTab(t.dataset.tab); });
    });

    // Counts on tabs
    document.getElementById("bookCount").textContent = "(" + books.length + ")";
    document.getElementById("articleCount").textContent = "(" + articles.length + ")";

    // Filter wiring
    document.querySelectorAll('input[name="kind"]').forEach(function (el) {
      el.addEventListener("change", function () {
        state.kind = el.value;
        render();
      });
    });
    document.querySelectorAll('input[name="category"]').forEach(function (el) {
      el.addEventListener("change", function () {
        state.category = el.value;
        render();
      });
    });

    var searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        state.query = searchInput.value.trim().toLowerCase();
        render();
      });
    }

    var clearBtn = document.getElementById("clearFilters");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.kind = "all"; state.category = "all"; state.query = "";
        document.querySelector('input[name="kind"][value="all"]').checked = true;
        document.querySelector('input[name="category"][value="all"]').checked = true;
        if (searchInput) searchInput.value = "";
        render();
      });
    }

    // Filter toggle for mobile
    var filterToggle = document.getElementById("filterToggle");
    var panel = document.getElementById("filterPanel");
    if (filterToggle && panel) {
      filterToggle.addEventListener("click", function () {
        panel.classList.toggle("expanded");
      });
    }

    // Apply initial state to radios
    function syncRadios() {
      var kr = document.querySelector('input[name="kind"][value="' + state.kind + '"]');
      if (kr) kr.checked = true;
      var cr = document.querySelector('input[name="category"][value="' + state.category + '"]');
      if (cr) cr.checked = true;
    }

    function matchesQuery(item, fields) {
      if (!state.query) return true;
      var q = state.query;
      return fields.some(function (f) {
        var v = item[f];
        if (v == null) return false;
        if (Array.isArray(v)) return v.some(function (t) { return String(t).toLowerCase().indexOf(q) !== -1; });
        return String(v).toLowerCase().indexOf(q) !== -1;
      });
    }

    function bookFields() { return ["title", "titleEn", "author", "authorEn", "description", "tags"]; }
    function articleFields() { return ["title", "titleEn", "author", "authorEn", "excerpt", "tags"]; }

    function filterBooks(list) {
      return list.filter(function (b) {
        var okCat = state.category === "all" || b.category === state.category;
        return okCat && matchesQuery(b, bookFields());
      });
    }
    function filterArticles(list) {
      return list.filter(function (a) {
        var okCat = state.category === "all" || a.category === state.category;
        return okCat && matchesQuery(a, articleFields());
      });
    }

    function render() {
      syncRadios();
      var summary = document.getElementById("resultSummary");
      var booksGrid = document.getElementById("booksGrid");
      var articlesGrid = document.getElementById("articlesGrid");
      var empty = document.getElementById("emptyState");

      // Determine which lists to render based on kind + tab
      var showBooks = (state.tab === "books") && (state.kind === "all" || state.kind === "books");
      var showArticles = (state.tab === "articles") && (state.kind === "all" || state.kind === "articles");

      // If kind restricts to one and tab is the other, switch tab automatically
      if (state.kind === "books" && state.tab === "articles") { setTab("books"); return; }
      if (state.kind === "articles" && state.tab === "books") { setTab("articles"); return; }

      var filteredBooks = filterBooks(books);
      var filteredArticles = filterArticles(articles);

      booksGrid.innerHTML = filteredBooks.map(function (b) {
        return Lodran.bookCard(b, catMap[b.category], books);
      }).join("");
      wireBookCards(booksGrid);
      articlesGrid.innerHTML = filteredArticles.map(function (a) {
        return Lodran.articleCard(a, catMap[a.category]);
      }).join("");
      Lodran.wireArticleCards(articlesGrid);

      // Summary
      var parts = [];
      parts.push(filteredBooks.length + " كتاب");
      parts.push(filteredArticles.length + " مقال");
      if (state.category !== "all" && catMap[state.category]) parts.push("في " + catMap[state.category].name);
      if (state.query) parts.push('تطابق "' + Lodran.escapeHTML(state.query) + '"');
      summary.textContent = parts.join(" · ");

      // Empty state for active grid
      var activeCount = state.tab === "books" ? filteredBooks.length : filteredArticles.length;
      empty.classList.toggle("hidden", activeCount !== 0);

      // Update category anchor
      if (state.category !== "all") {
        try { history.replaceState(null, "", "library.html?category=" + encodeURIComponent(state.category)); } catch (e) {}
      } else {
        try { history.replaceState(null, "", "library.html"); } catch (e) {}
      }
    }

    render();
  });

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
