#!/usr/bin/env python3
"""Import a plain-text book into data/book-text.json for the in-site reader.

Text format:
  - a line starting with "## " begins a new chapter (the rest is its title)
  - blank lines separate paragraphs
  - text before the first "## " goes into a chapter titled "المقدمة"

Usage:
  python3 tools/import_text.py b030 path/to/book.txt --source "ويكي مصدر"
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = os.path.join(ROOT, "data", "books.json")
TEXTS = os.path.join(ROOT, "data", "book-text.json")


def parse(raw):
    chapters, title, buf = [], "المقدمة", []

    def flush():
        paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", "\n".join(buf))]
        paras = [p for p in paras if p]
        if paras:
            chapters.append({"title": title, "paragraphs": paras})

    for line in raw.replace("\r\n", "\n").split("\n"):
        if line.startswith("## "):
            flush()
            title, buf = line[3:].strip(), []
        else:
            buf.append(line)
    flush()
    return chapters


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("book_id", help="id from data/books.json, e.g. b030")
    ap.add_argument("text_file", help="UTF-8 plain-text file")
    ap.add_argument("--source", help="where the text came from (kept for attribution)")
    a = ap.parse_args()

    with open(BOOKS, encoding="utf-8") as f:
        book = next((b for b in json.load(f)["books"] if b["id"] == a.book_id), None)
    if not book:
        sys.exit("No book with id %s in data/books.json" % a.book_id)
    with open(a.text_file, encoding="utf-8") as f:
        chapters = parse(f.read())
    if not chapters:
        sys.exit("No text found in %s" % a.text_file)

    with open(TEXTS, encoding="utf-8") as f:
        data = json.load(f)
    entry = {"id": book["id"], "title": book["title"], "author": book["author"], "chapters": chapters}
    if a.source:
        entry["source"] = a.source
    data.setdefault("texts", {})[book["id"]] = entry
    with open(TEXTS, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("%s: %d chapters, %d paragraphs" % (book["title"], len(chapters), sum(len(c["paragraphs"]) for c in chapters)))


if __name__ == "__main__":
    main()
