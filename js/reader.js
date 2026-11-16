/* reader.js - in-site book reader for Lodran
 *
 * Opens a book by id (?book=ID), renders its chapters as paginated "pages"
 * (one chapter per page), and provides simple prev/next + keyboard nav.
 * Closing returns to the library. All content comes from LodranData so the
 * data source can later move to a real DB without touching this view.
 *
 * Reading progress is stored locally per book id in localStorage under
 * "lodran.progress" as a map { bookId: { page: N, total: T, ts: <ms> } }.
 * On reopen, if a saved position exists, a "continue" prompt appears.
 */
(function () {
  "use strict";

  var PROGRESS_KEY = "lodran.progress";
  // Reader prefs (font size %, line-height unitless). Persisted, applied live.
  var PREFS_KEY = "lodran.readerPrefs";
  var DEFAULT_PREFS = { fontScale: 100, lineHeight: 2.1 };

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveProgress(bookId, page, total) {
    var all = loadProgress();
    all[bookId] = { page: page, total: total, ts: Date.now() };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function getProgress(bookId) {
    return loadProgress()[bookId] || null;
  }
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      return Object.assign({}, DEFAULT_PREFS, p || {});
    } catch (e) { return Object.assign({}, DEFAULT_PREFS); }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function applyReaderStyles(paper) {
    var paperEl = paper || document.getElementById("readerPaper");
    if (!paperEl) return;
    var p = loadPrefs();
    paperEl.style.fontSize = p.fontScale + "%";
    paperEl.style.lineHeight = String(p.lineHeight);
    var fl = document.getElementById("fontSizeLabel");
    var lh = document.getElementById("lhLabel");
    if (fl) fl.textContent = p.fontScale + "%";
    if (lh) lh.textContent = p.lineHeight.toFixed(1);
  }

  // Find up to N related books for a given book: prefer same category, then
  // overlapping tags, then by nearest publication year. Returns the chosen
  // books with the current book itself excluded, and deduped.
  function findRelated(book, allBooks, opts) {
    opts = opts || {};
    var want = opts.count || 4;
    if (!book || !allBooks || !allBooks.length) return [];
    var id = book.id;
    var sameCategory = allBooks.filter(function (b) {
      return b.id !== id && b.category === book.category;
    });
    function score(b) {
      var s = 0;
      if (b.category === book.category) s += 100;
      (b.tags || []).forEach(function (t) {
        if ((book.tags || []).indexOf(t) !== -1) s += 25;
      });
      var by = b.year || 0, ty = book.year || 0;
      if (by && ty) s += Math.max(0, 20 - Math.abs(by - ty));
      return s;
    }
    // Best-match same-category items first.
    sameCategory.sort(function (a, b) { return score(b) - score(a); });
    var picked = sameCategory.slice(0, want);

    // If fewer than `want` from the same category, fall back to other
    // categories, scored by tag overlap + year proximity.
    if (picked.length < want) {
      var usedIds = {};
      picked.forEach(function (b) { usedIds[b.id] = true; });
      var others = allBooks.filter(function (b) {
        return b.id !== id && !usedIds[b.id];
      }).map(function (b) { return { b: b, s: score(b) }; })
        .sort(function (a, b) { return b.s - a.s; });
      while (picked.length < want && others.length) {
        picked.push(others.shift().b);
      }
    }
    return picked;
  }

  /* ---------------- PDF.js reader ----------------
   * Renders a book's PDF in an in-site canvas. Reading progress (per-page)
   * lives in the same lodran.progress store as the text reader, keyed by
   * book id, so the card progress bar + "continue reading" prompt still
   * work uniformly. A zoom control (in the existing toolbar) scales the page.
   */
  var PDF_SCALE_STEP = 0.20;
  var PDF_SCALE_MIN = 0.5;
  var PDF_SCALE_MAX = 3.0;

  async function startPDFReader(book) {
    // Configure the worker (bundled locally for offline & same-origin fetch).
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
    } catch (e) { /* fall through to render error */ }

    var paper = document.getElementById("readerPaper");
    var stage = document.getElementById("readerStage");
    var viewer = document.getElementById("pdfViewer");
    var canvas = document.getElementById("pdfCanvas");
    var loadingEl = document.getElementById("pdfLoading");
    var errorEl = document.getElementById("pdfError");
    var retry = document.getElementById("pdfRetry");
    var info = document.getElementById("readerPageInfo");
    var prevBtn = document.getElementById("readerPrev");
    var nextBtn = document.getElementById("readerNext");
    var progressFill = document.getElementById("readerProgressFill");
    var zoomMinus = document.getElementById("pdfZoomMinus");
    var zoomPlus = document.getElementById("pdfZoomPlus");
    var zoomLabel = document.getElementById("pdfZoomLabel");
    var zoomGroup = document.getElementById("pdfZoomGroup");
    var zoomDivider = document.getElementById("pdfZoomDivider");

    // Hide the text-reader paper; show the PDF viewer + zoom controls.
    if (paper) paper.classList.add("hidden");
    if (viewer) viewer.classList.remove("hidden");
    if (zoomGroup) zoomGroup.classList.remove("hidden");
    if (zoomDivider) zoomDivider.classList.remove("hidden");

    // Reading-progress state (shares the lodran.progress store with text reader).
    var saved = getProgress(book.id) || { page: 1, total: book.pages || 0 };
    var startedAtPage = 1;

    var pdfDoc = null;
    var currentPage = 1;
    var scale = 1.2;        // starting zoom (matches default label "120%")
    var rendering = false;
    var pendingPage = null;

    function setLoading(on) { if (loadingEl) loadingEl.classList.toggle("hidden", !on); }
    function showError(on) {
      if (errorEl) errorEl.classList.toggle("hidden", !on);
      if (loadingEl) loadingEl.classList.add("hidden");
    }

    async function loadDoc() {
      setLoading(true); showError(false);
      try {
        // Wait for PDF.js to be ready (script may still be downloading)
        var waited = 0;
        while (typeof pdfjsLib === "undefined" && waited < 4000) {
          await new Promise(function (r) { setTimeout(r, 100); }); waited += 100;
        }
        if (typeof pdfjsLib === "undefined") { throw new Error("pdfjs missing"); }
        pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
        var task = pdfjsLib.getDocument({ url: book.pdfPath });
        pdfDoc = await task.promise;
        // First time we see the real page count, persist it for the progress bar.
        var total = pdfDoc.numPages || book.pages || 0;
        saveProgress(book.id, saved.page || 1, total);
        startedAtPage = Math.max(1, Math.min(total, saved.page || 1));
        currentPage = startedAtPage;
        updateZoomLabel();
        await renderPage(currentPage);
        // After loading, if the user had a saved position beyond page 1, show
        // a brief "resumed at page N" toast (non-blocking).
        if (startedAtPage > 1) Lodran.showToast("تُتابع من الصفحة " + startedAtPage);
      } catch (e) {
        showError(true);
      }
    }

    async function renderPage(num) {
      if (!pdfDoc || rendering) { pendingPage = num; return; }
      rendering = true;
      setLoading(false); showError(false);
      try {
        var page = await pdfDoc.getPage(num);
        var viewport = page.getViewport({ scale: scale });
        var ctx = canvas.getContext("2d");
        var ratio = window.devicePixelRatio || 1;
        // Use device pixel ratio for crispness on retina, capped at 2.
        var drawScale = scale * Math.min(2, ratio);
        var dv = page.getViewport({ scale: drawScale });
        canvas.width = dv.width;
        canvas.height = dv.height;
        canvas.style.width = (viewport.width / scale * scale) + "px";
        canvas.style.height = (viewport.height / scale * scale) + "px";
        canvas.style.maxWidth = "100%";
        canvas.style.height = "auto";
        await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: drawScale }) }).promise;
        currentPage = num;
        info.textContent = "صفحة " + num + " من " + (pdfDoc.numPages || book.pages || 0);
        prevBtn.disabled = num === 1;
        nextBtn.disabled = num === pdfDoc.numPages;
        if (progressFill) {
          var pct = pdfDoc.numPages ? ((num) / pdfDoc.numPages) * 100 : 0;
          progressFill.style.width = pct.toFixed(1) + "%";
        }
        saveProgress(book.id, num, pdfDoc.numPages || book.pages || 0);
        try { history.replaceState(null, "", "reader.html?book=" + encodeURIComponent(book.id) + "&page=" + num); } catch (e) {}
      } catch (e) {
        showError(true);
      } finally {
        rendering = false;
        if (pendingPage !== null) { var n = pendingPage; pendingPage = null; renderPage(n); }
      }
    }

    function step(delta) {
      if (!pdfDoc) return;
      var n = Math.max(1, Math.min(pdfDoc.numPages, currentPage + delta));
      if (n !== currentPage) renderPage(n);
    }
    function setScale(s) {
      scale = Math.max(PDF_SCALE_MIN, Math.min(PDF_SCALE_MAX, Math.round(s * 100) / 100));
      updateZoomLabel();
      renderPage(currentPage);
    }
    function updateZoomLabel() {
      if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + "%";
    }

    prevBtn.addEventListener("click", function () { step(-1); });
    nextBtn.addEventListener("click", function () { step(1); });
    if (zoomMinus) zoomMinus.addEventListener("click", function () { setScale(scale - PDF_SCALE_STEP); });
    if (zoomPlus) zoomPlus.addEventListener("click", function () { setScale(scale + PDF_SCALE_STEP); });
    if (retry) retry.addEventListener("click", function (e) { e.preventDefault(); loadDoc(); });

    // Keyboard nav (RTL aware — but PDFs are usually page-numbered left→right).
    document.addEventListener("keydown", function (e) {
      if (e.target === document.getElementById("readerNoteNew")) return;
      if (e.key === "Escape") {
        var notes = document.getElementById("readerNotesPanel");
        if (notes && notes.classList.contains("open")) return;
        document.getElementById("readerBack").click();
      }
      else if (e.key === "ArrowRight") step(1);    // Left/Right map to page++
      else if (e.key === "ArrowLeft") step(-1);
    });

    // Re-render at the new size when the window is resized (debounced).
    var rsTimer = null;
    window.addEventListener("resize", function () {
      if (rsTimer) clearTimeout(rsTimer);
      rsTimer = setTimeout(function () { if (pdfDoc) renderPage(currentPage); }, 200);
    });

    // Save progress on tab close / navigation away.
    window.addEventListener("beforeunload", function () {
      if (pdfDoc) saveProgress(book.id, currentPage, pdfDoc.numPages || book.pages || 0);
    });

    await loadDoc();
  }

  // Render the "من نفس الرف" section below the reader. Uses small `related-card`
  // previews with title, category, and year. Clicking opens the reader for that id.
  function renderRelated(book) {
    var section = document.getElementById("relatedSection");
    var grid = document.getElementById("relatedGrid");
    if (!section || !grid) return;
    LodranData.getBooks().then(function (allBooks) {
      var cats_promise = LodranData.getCategories();
      cats_promise.then(function (cats) {
        var catMap = {};
        cats.forEach(function (c) { catMap[c.id] = c; });
        var related = findRelated(book, allBooks, { count: 4 });
        if (!related.length) { section.hidden = true; return; }
        section.hidden = false;
        grid.innerHTML = related.map(function (b) {
          var cat = catMap[b.category] || {};
          var yearLine = b.year ? " · " + b.year : "";
          return (
            '<a class="related-card fade-in" href="reader.html?book=' + encodeURIComponent(b.id) + '">' +
              '<span class="related-card-cat">' + Lodran.escapeHTML(cat.name || "") + "</span>" +
              '<span class="related-card-title">' + Lodran.escapeHTML(b.title) + "</span>" +
              '<span class="related-card-sub">' + Lodran.escapeHTML(b.author) + yearLine + "</span>" +
            "</a>"
          );
        }).join("");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var paper = document.getElementById("readerPaper");
    var titleEl = document.getElementById("readerBookTitle");
    var authorEl = document.getElementById("readerBookAuthor");
    var crumb = document.getElementById("crumbBook");
    var prevBtn = document.getElementById("readerPrev");
    var nextBtn = document.getElementById("readerNext");
    var info = document.getElementById("readerPageInfo");
    var backBtn = document.getElementById("readerBack");
    var progressFill = document.getElementById("readerProgressFill");

    // Toolbar controls
    var fontMinus = document.getElementById("fontMinus");
    var fontPlus = document.getElementById("fontPlus");
    var lhMinus = document.getElementById("lhMinus");
    var lhPlus = document.getElementById("lhPlus");
    // Notes panel
    var notesToggle = document.getElementById("readerNotesToggle");
    var notesPanel = document.getElementById("readerNotesPanel");
    var notesClose = document.getElementById("readerNotesClose");
    var noteNew = document.getElementById("readerNoteNew");
    var noteSave = document.getElementById("readerNoteSave");
    var notesList = document.getElementById("readerNotesList");
    var notesBadge = document.getElementById("readerNotesBadge");

    applyReaderStyles();

    var params = new URLSearchParams(location.search);
    var bookId = params.get("book");

    if (!bookId) {
      paper.innerHTML = '<p class="reader-loading">لم يُحدَّد كتاب. <a href="library.html">العودة إلى المكتبة</a>.</p>';
      titleEl.textContent = "لا كتاب";
      authorEl.textContent = "";
      return;
    }

    var book = await LodranData.getBookById(bookId);
    var text = await LodranData.getBookText(bookId);

    if (!book) {
      paper.innerHTML = '<p class="reader-loading">لم يُعثر على الكتاب. <a href="library.html">العودة إلى المكتبة</a>.</p>';
      titleEl.textContent = "كتاب غير موجود";
      authorEl.textContent = "";
      return;
    }

    titleEl.textContent = book.title;
    authorEl.textContent = book.author + (book.year ? " · " + book.year : "");
    crumb.textContent = book.title;
    document.title = book.title + " — القارئ — لُدران";

    // Wire share button with this book's id, then pass share id.
    var shareBtn = document.getElementById("readerShare");
    if (shareBtn) {
      shareBtn.setAttribute("data-share-id", book.id);
      Lodran.wireShare(shareBtn.parentElement);
    }

    // ---- Feature 3: "من نفس الرف" — related items ----
    renderRelated(book);

    // Record an "open" for reading stats + start a reading session timer.
    Lodran.recordOpen("book", book);
    var sessionStart = Date.now();
    window.addEventListener("beforeunload", function () {
      Lodran.recordSession("book", book, sessionStart, Date.now());
    });

    // ---- PDF.js branch ----
    // If this book has a real PDF file, render it in the in-site PDF viewer
    // and skip the paginated-text flow. Reading progress is keyed by book id
    // just like the text reader (stored in lodran.progress) so "continue
    // reading" and the per-card progress bar still work uniformly.
    if (book.pdfPath && typeof pdfjsLib !== "undefined" && pdfjsLib) {
      await startPDFReader(book);
      return;
    }
    // If a pdfPath was declared but PDF.js failed to load (offline, blocked),
    // surface the fallback text reader instead of a blank page.
    if (book.pdfPath && typeof pdfjsLib === "undefined") {
      paper.innerHTML =
        '<p class="reader-loading">لا يمكن تحميل عارض PDF الآن (ربما لا يوجد اتصال، أو لم يُحمَّل نصّ المكتبة). ' +
        '<a href="' + Lodran.escapeHTML(book.pdfPath) + '" target="_blank" rel="noopener">افتح الملف مباشرة</a> ' +
        'أو <a href="library.html">عُد إلى المكتبة</a>.</p>';
      applyReaderStyles();
      return;
    }

    // Build the page list from book-text.json, falling back to catalogue copy.
    var pages = [];
    if (text && text.chapters && text.chapters.length) {
      text.chapters.forEach(function (ch) {
        var paras = (ch.paragraphs || []).map(function (p) {
          return "<p>" + Lodran.escapeHTML(p) + "</p>";
        }).join("");
        pages.push({ heading: Lodran.escapeHTML(ch.title || ""), html: paras });
      });
    } else {
      pages.push({
        heading: "لمحة",
        html: "<p>" + Lodran.escapeHTML(book.description || "لا يوجد نصٌّ متاحٌ لهذا الكتاب بعد.") + "</p>"
      });
    }

    var idx = 0;
    var resumed = false;

    // Continue prompt: show if there is saved progress that isn't page 1.
    function showContinuePrompt(saved) {
      if (!saved || saved.page <= 1 || saved.total !== pages.length) return;
      var prompt = document.createElement("div");
      prompt.className = "reader-continue";
      var pct = Math.round((saved.page / saved.total) * 100);
      prompt.innerHTML =
        '<div class="reader-continue-text">توقفتَ عند الصفحة ' + saved.page + " من " + saved.total +
        " (" + pct + "%).</div>" +
        '<div class="reader-continue-actions">' +
          '<button class="reader-btn reader-continue-yes" id="continueYes">أكمل من حيث توقفت</button>' +
          '<button class="reader-btn reader-continue-no" id="continueNo">البدء من جديد</button>' +
        "</div>";
      paper.innerHTML = "";
      paper.appendChild(prompt);
      document.getElementById("continueYes").addEventListener("click", function () {
        idx = Math.max(0, Math.min(pages.length - 1, (saved.page || 1) - 1));
        resumed = true;
        render();
      });
      document.getElementById("continueNo").addEventListener("click", function () {
        idx = 0;
        render();
      });
    }

    function render() {
      var p = pages[idx];
      var head = p.heading ? '<h2>' + p.heading + "</h2>" : "";
      paper.innerHTML = head + p.html;
      paper.scrollTop = 0;
      info.textContent = "صفحة " + (idx + 1) + " من " + pages.length;
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === pages.length - 1;
      // Progress bar fill
      if (progressFill) {
        var pct = pages.length ? ((idx + 1) / pages.length) * 100 : 0;
        progressFill.style.width = pct.toFixed(1) + "%";
      }
      // Save progress for this book
      saveProgress(bookId, idx + 1, pages.length);
      try { history.replaceState(null, "", "reader.html?book=" + encodeURIComponent(bookId) + "&page=" + (idx + 1)); } catch (e) {}
      applyReaderStyles();
      renderNotes();
    }

    function go(delta) {
      var n = Math.max(0, Math.min(pages.length - 1, idx + delta));
      if (n !== idx) { idx = n; render(); }
    }

    prevBtn.addEventListener("click", function () { go(-1); });
    nextBtn.addEventListener("click", function () { go(1); });
    backBtn.addEventListener("click", function () { location.href = "library.html"; });

    document.addEventListener("keydown", function (e) {
      // Don't capture when typing in the notes textarea.
      if (e.target === noteNew) return;
      if (e.key === "ArrowLeft") go(1);     // RTL: left arrow = next
      else if (e.key === "ArrowRight") go(-1);
      else if (e.key === "Escape") {
        if (notesPanel && notesPanel.getAttribute("aria-hidden") === "false") closeNotes();
        else backBtn.click();
      }
    });

    // ---- Font + line-height + theme toolbar wiring ----
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
    fontMinus.addEventListener("click", function () { bumpFont(-5); });
    fontPlus.addEventListener("click", function () { bumpFont(5); });
    lhMinus.addEventListener("click", function () { bumpLH(-0.1); });
    lhPlus.addEventListener("click", function () { bumpLH(0.1); });
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      b.addEventListener("click", function () {
        Lodran.applyTheme(b.getAttribute("data-set-theme"));
      });
    });

    // ---- Notes panel ----
    function openNotes() {
      notesPanel.classList.add("open");
      notesPanel.setAttribute("aria-hidden", "false");
      renderNotes();
    }
    function closeNotes() {
      notesPanel.classList.remove("open");
      notesPanel.setAttribute("aria-hidden", "true");
    }
    function renderNotes() {
      if (!notesList) return;
      var list = Lodran.getNotes(bookId);
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
        : '<p class="reader-note-empty">لا ملاحظاتٍ بعد على هذا الكتاب.</p>';
      notesList.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          Lodran.deleteNote(bookId, b.getAttribute("data-del"));
          renderNotes();
        });
      });
    }
    if (notesToggle) notesToggle.addEventListener("click", function () {
      if (notesPanel.classList.contains("open")) closeNotes();
      else openNotes();
    });
    if (notesClose) notesClose.addEventListener("click", closeNotes);
    if (noteSave) noteSave.addEventListener("click", function () {
      var v = (noteNew.value || "").trim();
      if (!v) return;
      Lodran.addNote(bookId, { text: v });
      noteNew.value = "";
      renderNotes();
    });

    // Decide where to start: ?page= query wins, else saved progress triggers prompt, else page 1.
    var resume = parseInt(params.get("page"), 10);
    var saved = getProgress(bookId);

    if (!isNaN(resume)) {
      idx = Math.max(0, Math.min(pages.length - 1, resume - 1));
      render();
    } else if (saved && saved.page > 1 && saved.total === pages.length) {
      showContinuePrompt(saved);
    } else {
      render();
    }
  });
})();
