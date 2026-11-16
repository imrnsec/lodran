/* gallery.js — masonry gallery with category filters and lightbox */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    await Lodran.initLayout();

    var items = await LodranData.getGallery();
    var cats = await LodranData.getCategories();
    var catMap = {};
    cats.forEach(function (c) { catMap[c.id] = c; });

    var state = { category: "all" };

    // Filter pills
    var filtersEl = document.getElementById("galleryFilters");
    if (filtersEl) {
      var pills = [
        '<button class="gfilter active" data-cat="all">الكل</button>'
      ];
      cats.forEach(function (c) {
        var n = items.filter(function (i) { return i.category === c.id; }).length;
        if (n > 0) pills.push('<button class="gfilter" data-cat="' + c.id + '">' + c.name + "</button>");
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
    }

    // Masonry render
    var grid = document.getElementById("masonryGrid");
    var summary = document.getElementById("resultSummary");
    var empty = document.getElementById("emptyState");

    // Softer caption orders via stable pseudo-random ordering for visual interest
    function seedFrom(str) {
      var h = 2166136261 >>> 0;
      for (var i = 0; i < str.length; i++) { h = (h ^ str.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
      return h;
    }
    // Deterministic small tilt for the moodboard feel; bandwidth of -3..+3deg
    function tiltFor(item, idx) {
      var s = seedFrom(item.id + ":" + idx);
      return (((s % 700) / 100) - 3.5).toFixed(2);
    }

    function render() {
      var list = items.filter(function (i) {
        return state.category === "all" || i.category === state.category;
      });

      grid.innerHTML = list.map(function (item, idx) {
        var cat = catMap[item.category];
        var catName = cat ? cat.name : "";
        var tilt = tiltFor(item, idx);
        // ~1/3 are made narrower so the column rhythm breathes
        var sizeCls = (idx % 3 === 1) ? "w-sm" : "";
        return (
          '<figure class="masonry-item ' + sizeCls + ' fade-in" data-id="' + item.id + '" style="--tilt:' + tilt + 'deg">' +
            '<img src="' + Lodran.escapeHTML(item.source) + '" alt="' + Lodran.escapeHTML(item.title) + '" loading="lazy" decoding="async" onerror="this.style.opacity=0">' +
            '<figcaption class="masonry-cap">' +
              "<h4>" + Lodran.escapeHTML(item.title) + "</h4>" +
              "<span>" + Lodran.escapeHTML(catName) + "</span>" +
            "</figcaption>" +
          "</figure>"
        );
      }).join("");

      if (summary) {
        summary.textContent = list.length + " عمل";
        if (state.category !== "all" && catMap[state.category]) {
          summary.textContent += " في " + catMap[state.category].name;
        }
      }
      empty.classList.toggle("hidden", list.length !== 0);

      // Bind lightbox open
      grid.querySelectorAll(".masonry-item").forEach(function (el) {
        el.addEventListener("click", function () {
          openLightbox(el.dataset.id);
        });
      });
    }

    // ---- Lightbox ----
    var lb = document.getElementById("lightbox");
    var lbImg = document.getElementById("lightboxImg");
    var lbTitle = document.getElementById("lightboxTitle");
    var lbDesc = document.getElementById("lightboxDesc");
    var lbClose = document.getElementById("lightboxClose");
    var lbBackdrop = document.getElementById("lightboxBackdrop");
    var lbPrev = document.getElementById("lightboxPrev");
    var lbNext = document.getElementById("lightboxNext");
    var lbSlideshow = document.getElementById("lightboxSlideshow");
    var lbCounter = document.getElementById("lightboxCounter");
    var lbShare = document.getElementById("lightboxShare");
    var currentList = [];
    var currentIdx = 0;
    var slideshowTimer = null;
    var SLIDESHOW_MS = 4000;

    function currentListFilter() {
      return items.filter(function (i) {
        return state.category === "all" || i.category === state.category;
      });
    }

    function openLightbox(id) {
      currentList = currentListFilter();
      currentIdx = currentList.findIndex(function (i) { return i.id === id; });
      showCurrent();
      lb.classList.add("open");
      lb.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function showCurrent() {
      if (currentIdx < 0 || currentIdx >= currentList.length) return;
      var item = currentList[currentIdx];
      lbImg.src = item.source;
      lbImg.alt = item.title;
      lbTitle.textContent = item.title;
      lbDesc.textContent = item.description || "";
      lbPrev.style.display = currentList.length > 1 ? "grid" : "none";
      lbNext.style.display = currentList.length > 1 ? "grid" : "none";
      if (lbCounter && currentList.length) lbCounter.textContent = (currentIdx + 1) + " / " + currentList.length;
    }

    function closeLightbox() {
      stopSlideshow();
      lb.classList.remove("open");
      lb.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function step(delta) {
      if (!currentList.length) return;
      currentIdx = (currentIdx + delta + currentList.length) % currentList.length;
      showCurrent();
    }

    // ---- Slideshow autoplay (Feature 18) ----
    function startSlideshow() {
      stopSlideshow();
      if (currentList.length < 2) return;
      if (lbSlideshow) lbSlideshow.innerHTML = "&#10073;";
      slideshowTimer = setInterval(function () { step(1); }, SLIDESHOW_MS);
    }
    function stopSlideshow() {
      if (slideshowTimer) { clearInterval(slideshowTimer); slideshowTimer = null; }
      if (lbSlideshow) lbSlideshow.innerHTML = "&#9654;";
    }
    function toggleSlideshow() {
      if (slideshowTimer) stopSlideshow();
      else startSlideshow();
    }

    lbClose.addEventListener("click", closeLightbox);
    lbBackdrop.addEventListener("click", closeLightbox);
    lbPrev.addEventListener("click", function () { step(-1); });
    lbNext.addEventListener("click", function () { step(1); });
    if (lbSlideshow) lbSlideshow.addEventListener("click", toggleSlideshow);
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggleSlideshow(); }
    });

    // Pause slideshow when tab hidden, resume when visible (timer keeps clean).
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopSlideshow();
    });


    render();
  });
})();
