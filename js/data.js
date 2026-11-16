/* data.js — Lodran data access layer
 *
 * A thin wrapper around the JSON content files. Everything the frontend
 * needs to render comes through here. Keeping all data access in one module
 * means a future migration to a real backend (SQLite/PostgreSQL via a small
 * API) only requires swapping the implementations of these functions;
 * the rest of the UI keeps calling the same names.
 */
(function (global) {
  "use strict";

  const DATA_BASE = "data/";

  // Tiny in-memory cache so repeated calls don't re-fetch.
  const cache = Object.create(null);

  async function fetchJSON(name) {
    if (cache[name]) return cache[name];
    const res = await fetch(DATA_BASE + name, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load " + name + " (" + res.status + ")");
    const json = await res.json();
    cache[name] = json;
    return json;
  }

  const LodranData = {
    async getCategories() {
      const data = await fetchJSON("categories.json");
      return data.categories || [];
    },
    async getBooks() {
      const data = await fetchJSON("books.json");
      return data.books || [];
    },
    async getArticles() {
      const data = await fetchJSON("articles.json");
      return data.articles || [];
    },
    async getGallery() {
      const data = await fetchJSON("gallery.json");
      return data.gallery || [];
    },
    async getQuotes() {
      const data = await fetchJSON("quotes.json");
      return data.quotes || [];
    },
    // Deterministic "quote of the day": pick by day-of-year so the same
    // quote shows all day for everyone, then rolls over at local midnight.
    // Falls back gracefully if quotes file is empty/missing.
    async getQuoteOfTheDay(refDate) {
      var quotes = await this.getQuotes();
      if (!quotes.length) return null;
      var now = refDate || new Date();
      var start = new Date(now.getFullYear(), 0, 0);
      var dayOfYear = Math.floor((now - start) / 86400000);
      var idx = ((dayOfYear % quotes.length) + quotes.length) % quotes.length;
      return quotes[idx];
    },
    async getCategoryById(id) {
      const cats = await this.getCategories();
      return cats.find((c) => c.id === id) || null;
    },
    async getBookById(id) {
      const books = await this.getBooks();
      return books.find((b) => b.id === id) || null;
    },
    // Full text of a book — kept in its own file/namespace so the catalog
    // (books.json, light & indexable) stays separate from the full text
    // (book-text.json, heavier). This mirrors how a real DB would split the
    // `books` metadata table from a `book_text` content table.
    async getBookText(id) {
      const data = await fetchJSON("book-text.json");
      const texts = data.texts || {};
      return texts[id] || null;
    },
    // Full body of an article. Mirrors getBookText but reads from
    // article-text.json (a separate file the editorial team can populate
    // gradually). When no entry exists for the id (most articles, currently),
    // returns null and callers fall back to the article.excerpt.
    async getArticleText(id) {
      try {
        const data = await fetchJSON("article-text.json");
        const texts = data.texts || {};
        return texts[id] || null;
      } catch (e) { return null; }
    },
    // Helper for count summaries across all collections.
    async getStats() {
      const [books, articles, gallery, categories] = await Promise.all([
        this.getBooks(), this.getArticles(), this.getGallery(), this.getCategories()
      ]);
      return { books: books.length, articles: articles.length, gallery: gallery.length, categories: categories.length };
    },
  };

  global.LodranData = LodranData;
})(window);
