/* shelf.js - visual shelf map for Lodran
 *
 * Renders one horizontal-scrolling "shelf" row per category. Inside each row
 * books appear as vertical book-spines standing on a shelf board, color-coded
 * per category (reusing the same palette as the library cards). Clicking a
 * spine opens the in-site reader at that book, so reading-progress flows back.
 *
 * The layout is keyboard friendly: each spine is focusable, Enter opens it,
 * and arrow keys scroll the active row. Horizontal scroll uses native overflow
 * so touchpads/trackpads work without JS.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var layout = document.getElementById("shelfLayout");
    var loading = document.getElementById("shelfLoading");
    var legend = document.getElementById("shelfLegend");
    var statsLoading = document.getElementById("statsGrid");
    var savedGrid = document.getElementById("savedGrid");
    var savedEmpty = document.getElementById("savedEmpty");

    var cats = await LodranData.getCategories();
    var books = await LodranData.getBooks();

    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    // ---- Stats dashboard (Feature 19) ----
    renderStats(statsLoading, cats, catMap);

    // ---- Saved / bookmarks (Feature 5) ----
    renderSaved(savedGrid, savedEmpty, books, catMap);

    if (loading) loading.remove();

    // Build one shelf per category (even if empty shows a quiet note).
    var rowsHTML = cats.map(function (c) {
      var shelfBooks = books.filter(function (b) { return b.category === c.id; });
      var spinesHTML = shelfBooks.length
        ? shelfBooks.map(function (b, i) { return spineHTML(b, c, i); }).join("")
        : '<p class="shelf-empty">لا عناوين في هذا الرف بعد.</p>';
      var countLabel = shelfBooks.length + " عنوان";
      return (
        '<section class="shelf-row" data-cat="' + Lodran.escapeHTML(c.id) + '">' +
          '<div class="shelf-head">' +
            '<div class="shelf-head-main">' +
              '<span class="shelf-icn">' + Lodran.iconSVG(c.icon) + "</span>" +
              '<div>' +
                '<h2 class="shelf-title">' + Lodran.escapeHTML(c.name) + "</h2>" +
                (c.nameEn ? '<p class="shelf-title-en">' + Lodran.escapeHTML(c.nameEn) + "</p>" : "") +
              "</div>" +
            "</div>" +
            '<p class="shelf-count">' + countLabel + "</p>" +
          "</div>" +
          '<div class="shelf-track" tabindex="0" role="group" aria-label="مرّر رف ' + Lodran.escapeHTML(c.name) + '">' +
            '<div class="shelf-spines">' + spinesHTML + "</div>" +
            '<div class="shelf-board"></div>' +
          "</div>" +
        "</section>"
      );
    }).join("");

    layout.innerHTML = rowsHTML;

    // Legend: one chip per category colour (uses same palette class).
    if (legend) {
      legend.innerHTML = cats.map(function (c) {
        var count = books.filter(function (b) { return b.category === c.id; }).length;
        return (
          '<span class="shelf-legend-item">' +
            '<span class="shelf-legend-swatch card-0" data-cat="' + Lodran.escapeHTML(c.id) + '"></span>' +
            '<span class="shelf-legend-name">' + Lodran.escapeHTML(c.name) + " (" + count + ")</span>" +
          "</span>"
        );
      }).join("");
    }

    // The legend swatch needs the *category's* color, not card-0 for everyone.
    if (legend) {
      legend.querySelectorAll(".shelf-legend-swatch").forEach(function (sw) {
        var catId = sw.getAttribute("data-cat");
        var sample = books.find(function (b) { return b.category === catId; });
        if (sample) {
          sw.className = "shelf-legend-swatch " + Lodran.colorClassFor(sample, books);
        }
      });
    }

    wireSpines(layout);
  });

  // A single book "spine" — a tall vertical block, color-classed like the
  // library card, with the title rotated 90deg reading top-to-bottom (so it
  // reads naturally on an RTL shelf). The number is stamped at the top.
  // ---- Stats dashboard ----
  // Surfaces three passive numbers + a streak + per-category breakdown of
  // reading time. Everything comes from localStorage (Lodran.statsSummary()).
  function renderStats(hostEl, cats, catMap) {
    if (!hostEl) return;
    var s = Lodran.statsSummary();
    var minutes = s.minutes;
    var timeStr;
    if (minutes < 60) timeStr = minutes + " دقيقة";
    else if (minutes < 1440) {
      var h = Math.floor(minutes / 60), m = minutes % 60;
      timeStr = h + " سا " + (m ? m + " د" : "");
    } else {
      timeStr = Math.round((minutes / 60) * 10) / 10 + " ساعة";
    }

    // Per-category minutes — sort desc, only show pairs with activity.
    var pairs = Object.keys(s.totalsByCategory).map(function (k) {
      return [k, s.totalsByCategory[k]];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var breakdown = pairs.length
      ? pairs.map(function (p) {
          var m = Math.round(p[1] / 60000);
          var lbl = catMap[p[0]] ? catMap[p[0]].name : p[0];
          var max = pairs[0][1];
          var pct = max ? Math.max(3, Math.round((p[1] / max) * 100)) : 0;
          return (
            '<div class="stat-bar">' +
              '<span class="stat-bar-label">' + Lodran.escapeHTML(lbl) + "</span>" +
              '<span class="stat-bar-track"><span class="stat-bar-fill" style="width:' + pct + '%"></span></span>' +
              '<span class="stat-bar-val">' + m + " د</span>" +
            "</div>"
          );
        }).join("")
      : '<p class="reader-loading">لم تُسجَّل جلسات قراءةٍ بعد. افتح كتابًا — والباقي علينا.</p>';

    hostEl.innerHTML =
      '<div class="stats-tiles">' +
        '<div class="stat-tile"><div class="stat-tile-num">' + s.itemsOpened + "</div><div class=\"stat-tile-lbl\">\u0639\u0646\u0648\u0627\u0646 \u0642\u0631\u0623\u062A</div></div>" +
        '<div class="stat-tile"><div class="stat-tile-num">' + timeStr + "</div><div class=\"stat-tile-lbl\">\u0648\u0642\u062A \u0627\u0644\u0642\u0631\u0627\u0621\u0629</div></div>" +
        '<div class="stat-tile"><div class="stat-tile-num">' + s.streak + '</div><div class="stat-tile-lbl">\u0623\u064A\u0627\u0645 \u0645\u062A\u062A\u0627\u0644\u064A\u0629</div></div>' +
      "</div>" +
      '<div class="stats-breakdown">' + breakdown + "</div>";
  }

  // ---- Saved items grid ----
  function renderSaved(gridEl, emptyEl, books, catMap) {
    if (!gridEl) return;
    var all = Lodran.allBookmarks();
    var ids = Object.keys(all);
    if (!ids.length) {
      gridEl.innerHTML = "";
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");
    var savedBooks = ids.map(function (id) { return books.find(function (b) { return b.id === id; }); }).filter(Boolean);
    gridEl.innerHTML = savedBooks.length
      ? savedBooks.map(function (b) { return Lodran.bookCard(b, catMap[b.category], books); }).join("")
      : '<p class="reader-loading">العناوين المحفوظة (' + ids.length + ') لم تُعد في الكتالوج.</p>';
    if (savedBooks.length) wireBookCards(gridEl);
  }


  // A single book "spine" — a tall vertical block, color-classed like the
  // library card, with the title rotated 90deg reading top-to-bottom (so it
  // reads naturally on an RTL shelf). The number is stamped at the top.
  function spineHTML(book, cat, indexInCat) {
    var colCls = Lodran.colorClassFor(book);
    var number = book.number || book.id.replace(/[^0-9]/g, "") || "001";
    var numLabel = "#" + pad(String(number), 3);
    var spineStyle = spineHeightStyle(book, indexInCat);
    // We rotate the label via CSS so it stays legible. Putting a vertical
    // stack of number + title + author keeps the spine informative.
    return (
      '<button class="spine ' + colCls + ' ' + (spineStyle.extraClass || "") + '" ' +
        'style="' + spineStyle.style + '" ' +
        'data-book-id="' + Lodran.escapeHTML(book.id) + '" ' +
        'data-action="read-book" ' +
        'aria-label="افتح: ' + Lodran.escapeHTML(book.title) + " — " + Lodran.escapeHTML(book.author) + '" ' +
        'title="' + Lodran.escapeHTML(book.title) + " — " + Lodran.escapeHTML(book.author) + '">' +
        '<span class="spine-num">' + numLabel + "</span>" +
        '<span class="spine-title">' + Lodran.escapeHTML(book.title) + "</span>" +
        '<span class="spine-author">' + Lodran.escapeHTML(book.author) + "</span>" +
      "</button>"
    );
  }

  // Give each spine a slightly different height for a realistic shelf feel,
  // while staying inside a tidy range so they all sit on the same board.
  function spineHeightStyle(book, indexInCat) {
    // Base height follows page count (longer book = taller spine),
    // gently normalised, then offset by index so neighbours differ.
    var pages = book.pages || 200;
    var base = 210 + Math.min(70, Math.max(0, (pages - 150) / 10));
    var jitter = ((indexInCat % 3) - 1) * 6;
    var h = Math.round(base + jitter);
    // Width follows height a touch — but kept narrow like a real spine.
    var w = 44 + (((pages > 400) ? 8 : 0));
    return { style: "height:" + h + "px;width:" + w + "px;" };
  }

  function pad(n, width) { while (n.length < width) n = "0" + n; return n; }

  // Open the reader on click / Enter, mirroring book-card wiring elsewhere.
  function wireSpines(scope) {
    scope.querySelectorAll('[data-action="read-book"]').forEach(function (el) {
      var open = function () {
        var id = el.getAttribute("data-book-id");
        location.href = "reader.html?book=" + encodeURIComponent(id);
      };
      el.addEventListener("click", open);
    });
    // Arrow keys scroll the focused track horizontally (RTL: Right=prev page of items, Left=next).
    scope.querySelectorAll(".shelf-track").forEach(function (track) {
      track.addEventListener("keydown", function (e) {
        var amount = Math.max(track.clientWidth * 0.8, 200);
        if (e.key === "ArrowLeft") { track.scrollLeft += amount; e.preventDefault(); }
        else if (e.key === "ArrowRight") { track.scrollLeft -= amount; e.preventDefault(); }
      });
    });
  }
})();
