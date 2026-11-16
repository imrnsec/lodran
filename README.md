# Lodran

**Lodran** is a non-profit cultural library and hub. It gathers books, articles,
and a gallery of cultural images across six threads of cultural life —
literature, history, philosophy, the arts, folklore, and language — and presents
them in a calm, readable, fully static website.

There are no user accounts, no comments, and no real-time interaction. A small
team of volunteers curates every item by hand. Content is stored in JSON files
that the frontend reads and renders dynamically.

---

## What's inside

```
lodran/
├── index.html          # Homepage: hero, categories, featured books, recent articles
├── library.html        # Books + articles with category/kind filters, tabs, search
├── gallery.html        # Masonry gallery with category filters + lightbox + slideshow
├── search.html         # Full-text fuzzy search across books/articles/gallery (Fuse.js)
├── timeline.html       # Cultural timeline by year
├── shelf.html          # Visual bookshelf map + bookmarks + reading-stats dashboard
├── reader.html         # In-site book reader with font/line-height controls + theme + notes
├── article.html        # Single-article view
├── about.html          # About Lodran
├── 404.html            # Custom not-found page
├── css/style.css       # Single stylesheet (responsive, calm palette, light/sepia/night themes)
├── js/
│   ├── data.js         # Data access layer (wraps the JSON files — swap point for a DB)
│   ├── app.js          # Shared header/footer/nav + theme/lang/bookmarks/notes/stats stores + SW
│   ├── fuse.min.js     # Bundled Fuse.js fuzzy-search library (no build step needed)
│   ├── home.js         # Homepage rendering
│   ├── library.js      # Library filtering & tabs
│   ├── gallery.js      # Gallery + lightbox + slideshow
│   ├── search.js       # Full-text search page
│   ├── timeline.js     # Year timeline view
│   ├── shelf.js        # Shelf map + saved items + stats dashboard
│   ├── reader.js       # In-site reader (prefs, sessions, notes)
│   ├── article.js      # Single-article view
│   └── pdf.min.js / pdf.worker.min.js  # Bundled PDF.js for books that ship as a PDF
├── data/               # All content, manually curated
│   ├── categories.json
│   ├── books.json
│   ├── articles.json
│   ├── book-text.json  # Full chapter text for the reader
│   ├── quotes.json     # Quote-of-the-day pool
│   └── gallery.json
├── assets/images/      # SVG covers, gallery images, logo, hero
├── sw.js                # Service worker (offline / PWA shell)
├── manifest.webmanifest # PWA install manifest
├── nginx/nginx.conf     # Nginx site config
├── tools/import_text.py # Import a plain-text book into data/book-text.json
├── .github/workflows/pages.yml  # Auto-deploy to GitHub Pages on push to main
├── Dockerfile          # Static site via nginx:alpine
├── docker-compose.yml  # Builds + serves on http://localhost:8080
└── .dockerignore
```

---

## Features

- **Calm reading experience** — Cormorant Garamond / Inter / Readex Pro typography on a
  sand-and-camel palette; respects `prefers-reduced-motion`.
- **In-site book reader** (reader.html) — paginated chapters, saved progress,
  font / line-height / theme controls, and per-book private notes.
- **Bookmarks / "read later"** — star any book card; saved items show on the
  shelf page. Stored locally (no account).
- **Reading stats** — open the shelf page to see how many titles you've read,
  total time, current day streak, and per-category minutes.
- **Full-text search** (search.html) — fuzzy + substring ranking across all
  books, articles, and gallery items. Shareable via `?q=`.
- **Cultural timeline** (timeline.html) — all dated items on a year axis,
  filterable by category.
- **Gallery slideshow** — open any photo and press the ▶ button (or the space
  bar) to autoplay.
- **Theme + language toggles** — light / sepia / night themes and Arabic /
  English direction, all persisted locally.
- **Offline / PWA** — a service worker caches the shell, data, and assets so
  Lodran opens without a network after the first visit. Install to home
  screen via the manifest.


---

## Run it with Docker

From the `lodran/` directory:

```bash
docker compose up --build -d
```

Then open:

```
http://localhost:8080
```

Stop:

```bash
docker compose down
```

Rebuild after editing content:

```bash
docker compose up --build -d
```

---

## Run it without Docker

Any static file server works, since it's a static site. For example:

```bash
python3 -m http.server 8080
# or
npx serve -l 8080
```

Note: the site fetches the JSON files at runtime, so opening `index.html`
directly via `file://` will fail CORS in most browsers — use a local server.

---

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the site on every push
to `main`. One-time setup: in the repository **Settings → Pages**, set
**Source** to **GitHub Actions**. The site then lives at
`https://<user>.github.io/lodran/`.

---

## Adding content

Edit the JSON files in `data/`:

- **`books.json`** — add an object to `books[]` with
  `id`, `title`, `titleAr` (optional), `author`, `category` (one of the IDs in
  `categories.json`), `year`, `language`, `cover`, `description`, `tags`.
- **`articles.json`** — add an object to `articles[]` with
  `id`, `title`, `titleAr`, `author`, `category`, `date`, `readTime`,
  `cover`, `excerpt`, `tags`.
- **`gallery.json`** — add an object to `gallery[]` with
  `id`, `title`, `titleAr`, `category`, `source` (an image path), `description`.
- **`categories.json`** — define categories (id, name, nameAr, description, icon).
  Icons available: `book`, `scroll`, `compass`, `palette`, `feather`, `abc`.

To add a book's full text for the reader, write it as plain text (a line
starting with `## ` begins a chapter, blank lines separate paragraphs) and run:

```bash
python3 tools/import_text.py b030 path/to/book.txt --source "where the text came from"
```

Only add texts you have the right to publish (public-domain or openly licensed).

Drop cover/gallery images under `assets/images/` (the defaults are SVG
placeholders). Rebuild the container to serve new assets.

---

## Designed to grow

Lodran is intentionally a static site, but the architecture is database-ready:

- All data access goes through `js/data.js`. The functions (`getBooks`,
  `getArticles`, `getGallery`, `getCategories`, `getCategoryById`, `getStats`)
  are the only contract between the UI and the data.
- Each JSON file corresponds naturally to a future table
  (`categories`, `books`, `articles`, `gallery`).
- If the project later needs user accounts, advanced search, or richer
  cataloguing, replace the `fetchJSON` calls in `data.js` with calls to a
  small API backed by SQLite (good for a single small server) or PostgreSQL
  (good once it needs to scale or run concurrent editors). The rest of the UI
  does not need to change.

---

## Design notes

- **Palette:** sand, camel, sage, and warm cream — calm and readable, with no
  harsh contrasts. Defined as CSS variables at the top of `css/style.css`.
- **Type:** Cormorant Garamond (display), Inter (UI), Amiri (Arabic). Loaded
  from Google Fonts.
- **Responsive:** tested layouts down to small phones; the masonry collapses
  3→2→1 columns, and the library's filter sidebar becomes a toggle on mobile.
- **Accessibility:** respects `prefers-reduced-motion`, keyboard-navigable
  lightbox (← → Esc), focus styles on search, and `loading="lazy"` on images.

---

## License / intent

Lodran is a non-profit, volunteer-maintained cultural project. Content
descriptions and metadata in the `data/` files are written for demonstration.
Replace them with curated entries of your own.
