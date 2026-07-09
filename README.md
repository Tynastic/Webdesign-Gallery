# MediaWiki Designs

Copy-paste layouts for MediaWiki main pages and templates. No extensions required.

**Live gallery:** https://YOURNAME.github.io/mediawiki-designs/

## Designs

| Design | Preview | Files |
|---|---|---|
| Champlain Group — Intelligence Archive | [Preview](https://YOURNAME.github.io/mediawiki-designs/preview/champlain-main-page/) | [`designs/champlain-main-page/`](designs/champlain-main-page/) |

## How to use a design

1. Open the design's folder and read its `README.md`.
2. Paste the `.css` file into `MediaWiki:Common.css` on your wiki.
3. Create any `Template:` pages listed, pasting the matching `.wiki` file.
4. Paste `MainPage.wiki` into your Main Page (edit source), then swap in your own
   image filenames and links.

Click **Raw** on any file to get clean, unformatted text to copy.

## Repo layout

    designs/<name>/    the actual copyable files (.css, .wiki) + install README
    preview/<name>/    static HTML preview, loads the same .css people copy
    index.html         the gallery landing page

The preview links to the real stylesheet rather than a copy, so a preview can
never drift out of sync with the code being distributed.

## Adding a design

Duplicate a folder in `designs/` and `preview/`, then add a card to `index.html`.

## License

CC BY 4.0 — use, adapt, and remix with attribution.
