/* article.js — single-article view for Lodran
 *
 * Opens a single article by ?id=ID, renders its excerpt + body (currently the
 * excerpt serves as the lede; article long-form text could be added later via
 * data/article-text.json mirroring book-text.json). Supports deep-linking, a
 * share button, font/line-height/theme controls, and a related-items section.
 */
(function () {
  "use strict";

  var PREFS_KEY = "lodran.readerPrefs";
  var DEFAULT_PREFS = { fontScale: 100, lineHeight: 2.1 };

  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      return Object.assign({}, DEFAULT_PREFS, p || {});
    } catch (e) { return Object.assign({}, DEFAULT_PREFS); }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function applyReaderStyles() {
    var paperEl = document.getElementById("articlePaper");
    if (!paperEl) return;
    var p = loadPrefs();
    paperEl.style.fontSize = p.fontScale + "%";
    paperEl.style.lineHeight = String(p.lineHeight);
    var fl = document.getElementById("fontSizeLabel");
    var lh = document.getElementById("lhLabel");
    if (fl) fl.textContent = p.fontScale + "%";
    if (lh) lh.textContent = p.lineHeight.toFixed(1);
  }

  // Find related items across both books and articles: same category first,
  // tags overlapping second, year/date proximity as a tie-breaker.
  function findRelatedMixed(article, allArticles, allBooks) {
    if (!article) return [];
    var id = article.id;
    var candidates = [];
    allArticles.forEach(function (a) {
      if (a.id === id) return;
      candidates.push({ kind: "article", raw: a });
    });
    allBooks.forEach(function (b) { candidates.push({ kind: "book", raw: b }); });

    var aYear = article.date ? new Date(article.date).getFullYear() : null;
    function score(c) {
      var r = c.raw;
      var s = 0;
      if (r.category === article.category) s += 100;
      (r.tags || []).forEach(function (t) {
        if ((article.tags || []).indexOf(t) !== -1) s += 25;
      });
      if (aYear) {
        var by = r.year || (r.date ? new Date(r.date).getFullYear() : null);
        if (by) s += Math.max(0, 20 - Math.abs(by - aYear));
      }
      return s;
    }
    candidates.sort(function (a, b) { return score(b) - score(a); });
    return candidates.slice(0, 4);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();
    applyReaderStyles();

    var paper = document.getElementById("articlePaper");
    var titleEl = document.getElementById("articleTitle");
    var authorEl = document.getElementById("articleAuthor");
    var crumb = document.getElementById("crumbArticle");
    var backBtn = document.getElementById("articleBack");
    var shareBtn = document.getElementById("articleShare");

    // Notes panel (same as the book reader)
    var notesToggle = document.getElementById("articleNotesToggle");
    var notesPanel = document.getElementById("readerNotesPanel");
    var notesClose = document.getElementById("readerNotesClose");
    var noteNew = document.getElementById("readerNoteNew");
    var noteSave = document.getElementById("readerNoteSave");
    var notesList = document.getElementById("readerNotesList");
    var notesBadge = document.getElementById("readerNotesBadge");

    // Toolbar
    document.getElementById("fontMinus").addEventListener("click", function () { bumpFont(-5); });
    document.getElementById("fontPlus").addEventListener("click", function () { bumpFont(5); });
    document.getElementById("lhMinus").addEventListener("click", function () { bumpLH(-0.1); });
    document.getElementById("lhPlus").addEventListener("click", function () { bumpLH(0.1); });
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      b.addEventListener("click", function () { Lodran.applyTheme(b.getAttribute("data-set-theme")); });
    });
    function bumpFont(delta) {
      var p = loadPrefs();
      p.fontScale = Math.min(160, Math.max(80, p.fontScale + delta));
      savePrefs(p); applyReaderStyles();
    }
    function bumpLH(delta) {
      var p = loadPrefs();
      p.lineHeight = Math.min(3.0, Math.max(1.4, Math.round((p.lineHeight + delta) * 10) / 10));
      savePrefs(p); applyReaderStyles();
    }

    var params = new URLSearchParams(location.search);
    var artId = params.get("id");

    if (!artId) {
      paper.innerHTML = '<p class="reader-loading">لم تُحدَّد مقالة. <a href="library.html#articles">العودة إلى المكتبة</a>.</p>';
      titleEl.textContent = "لا مقالة";
      authorEl.textContent = "";
      return;
    }

    var articles = await LodranData.getArticles();
    var article = articles.find(function (a) { return a.id === artId; });
    if (!article) {
      paper.innerHTML = '<p class="reader-loading">لم تُعثر على المقالة. <a href="library.html#articles">العودة إلى المكتبة</a>.</p>';
      titleEl.textContent = "مقالة غير موجودة";
      authorEl.textContent = "";
      return;
    }

    titleEl.textContent = article.title;
    var authorLine = article.author;
    if (article.date) authorLine += " · " + Lodran.formatDate(article.date);
    if (article.readTime) authorLine += " · " + article.readTime + " دقائق";
    authorEl.textContent = authorLine;
    crumb.textContent = article.title;
    document.title = article.title + " — لُدران";

    // Record for stats. Session timer logs ms on the article page too.
    Lodran.recordOpen("article", article);
    var sessionStart = Date.now();
    window.addEventListener("beforeunload", function () {
      Lodran.recordSession("article", article, sessionStart, Date.now());
    });

    // Wire the share button with this article's id.
    if (shareBtn) {
      shareBtn.setAttribute("data-share-id", article.id);
      Lodran.wireShare(shareBtn.parentElement);
    }

    // Render body. We currently rely on the excerpt as the lede, plus we
    // pull the article body from the article-text.json file when present.
    var bodyHTML = "";
    var text = await LodranData.getArticleText(article.id).catch(function () { return null; });
    if (text && text.paragraphs && text.paragraphs.length) {
      bodyHTML = text.paragraphs.map(function (p) {
        return "<p>" + Lodran.escapeHTML(p) + "</p>";
      }).join("");
    } else {
      // Fallback: build a few thoughtful paragraphs from the excerpt + tags,
      // so the article page never looks empty while waiting for full body text.
      bodyHTML =
        '<p class="article-lede">' + Lodran.escapeHTML(article.excerpt || "") + "</p>" +
        "<p>" + Lodran.escapeHTML("هذا نصٌّ تجريبيٌّ للمقالة؛ عند جاهزية نصّها الكامل يعوّضه فريق التحرير.") + "</p>";
    }

    var coverHTML = article.cover
      ? '<img class="article-cover" src="' + Lodran.escapeHTML(article.cover) + '" alt="' + Lodran.escapeHTML(article.title) + '">'
      : "";

    paper.innerHTML =
      coverHTML +
      (article.titleEn ? '<p class="article-title-en">' + Lodran.escapeHTML(article.titleEn) + "</p>" : "") +
      bodyHTML;
    applyReaderStyles();

    // ---- Notes panel (mirrors the reader) ----
    function openNotes() { notesPanel.classList.add("open"); notesPanel.setAttribute("aria-hidden", "false"); renderNotes(); }
    function closeNotes() { notesPanel.classList.remove("open"); notesPanel.setAttribute("aria-hidden", "true"); }
    function renderNotes() {
      var list = Lodran.getNotes(article.id);
      if (notesBadge) {
        notesBadge.textContent = String(list.length);
        notesBadge.classList.toggle("hidden", list.length === 0);
      }
      notesList.innerHTML = list.length
        ? list.map(function (n) {
            return (
              '<div class="reader-note" data-note-id="' + n.id + '">' +
                '<p class="reader-note-text">' + Lodran.escapeHTML(n.text) + "</p>" +
                '<p class="reader-note-meta">' + new Date(n.ts).toLocaleString("ar-SD") + " " +
                  '<button class="reader-note-del" data-del="' + n.id + '" aria-label="حذف">حذف</button>' +
                "</p>" +
              "</div>"
            );
          }).join("")
        : '<p class="reader-note-empty">لا ملاحظاتٍ بعد على هذه المقالة.</p>';
      notesList.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          Lodran.deleteNote(article.id, b.getAttribute("data-del"));
          renderNotes();
        });
      });
    }
    notesToggle.addEventListener("click", function () {
      if (notesPanel.classList.contains("open")) closeNotes(); else openNotes();
    });
    notesClose.addEventListener("click", closeNotes);
    noteSave.addEventListener("click", function () {
      var v = (noteNew.value || "").trim();
      if (!v) return;
      Lodran.addNote(article.id, { text: v });
      noteNew.value = "";
      renderNotes();
    });
    document.addEventListener("keydown", function (e) {
      if (e.target === noteNew) return;
      if (e.key === "Escape") {
        if (notesPanel.classList.contains("open")) closeNotes();
        else backBtn.click();
      }
    });

    // Keyboard: Escape → back (when notes closed)
    backBtn.addEventListener("click", function () { location.href = "library.html#articles"; });

    // ---- Feature 3: "مرتبط بهذا الموضوع" — related items (articles + books) ----
    renderRelated(article);
    function renderRelated(article) {
      var section = document.getElementById("relatedSection");
      var grid = document.getElementById("relatedGrid");
      if (!section || !grid) return;
      var cats = LodranData.getCategories();
      var books = LodranData.getBooks();
      Promise.all([cats, books]).then(function (results) {
        var catMap = {};
        (results[0] || []).forEach(function (c) { catMap[c.id] = c; });
        var related = findRelatedMixed(article, articles, results[1]);
        if (!related.length) { section.hidden = true; return; }
        section.hidden = false;
        grid.innerHTML = related.map(function (c) {
          var r = c.raw;
          var cat = catMap[r.category] || {};
          var href, yearLine, kindLabel;
          if (c.kind === "article") {
            href = "article.html?id=" + encodeURIComponent(r.id);
            yearLine = r.date ? " · " + new Date(r.date).getFullYear() : "";
            kindLabel = "مقالة";
          } else {
            href = "reader.html?book=" + encodeURIComponent(r.id);
            yearLine = r.year ? " · " + r.year : "";
            kindLabel = "كتاب";
          }
          return (
            '<a class="related-card fade-in" href="' + href + '">' +
              '<span class="related-card-kind">' + Lodran.escapeHTML(kindLabel) + "</span>" +
              '<span class="related-card-cat">' + Lodran.escapeHTML(cat.name || "") + "</span>" +
              '<span class="related-card-title">' + Lodran.escapeHTML(r.title) + "</span>" +
              '<span class="related-card-sub">' + Lodran.escapeHTML(r.author) + yearLine + "</span>" +
            "</a>"
          );
        }).join("");
      });
    }
  });
})();
