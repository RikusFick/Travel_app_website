# Site languages

The website is in English plus nine languages: Deutsch, Français, Español, Italiano, Português, Русский, 日本語, 中文（简体） and हिन्दी. These are the Earwise app languages with audio. English stays at the current URLs, and every other language lives under its own folder, such as `/fr/louvre/` or `/hi/guides/france/`.

## One template

The English pages, `css/style.css` and `js/*.js` are the only template. Do not edit anything inside `de/`, `fr/`, `es/`, `it/`, `pt/`, `ru/`, `ja/`, `zh/`, `hi/` or `js/i18n/` by hand. These folders are generated.

To change a feature or a layout:

1. Edit the English page, or the shared CSS or JS, as before.
2. If you add or change visible text, add the English text as a key to each `i18n/strings/<lang>.json`, with its translation. In JS, wrap the text with `T("…")` (`window.earwiseT`). Use `{name}` for the parts that get filled in.
3. Run `python3 tools/i18n/build.py`. The script rebuilds every language, the header language picker, the hreflang links, `sitemap.xml` and `js/i18n/`.
4. Commit the English change and the regenerated files together.

`python3 tools/i18n/build.py --missing` lists text that still shows in English on a translated page. Text with no translation falls back to English, so a missing key never breaks a page.

## Where text comes from

| File | What it holds |
| --- | --- |
| `i18n/languages.json` | The language list, its picker order, flags and URL folders |
| `i18n/strings/<lang>.json` | Interface text, keyed by the exact English text |
| `i18n/guides/<lang>.json` | Guide names, taglines and stop text from the approved translated audio scripts (`tools/i18n/import_scripts.py`) |

Each guide's stop text and read-along come from the translated script for that language, so they match the translated recording. A guide or stop without a translated script stays in English.

The privacy, terms and credits pages keep their English body. They get a short translated note saying so. `404.html` stays English.

Pages under `tips/<article>/` keep their English article body in every language, with a short note that the page is in English. The Travel tips hub at `/tips/` is translated as a normal page. The header, footer and language picker are translated, and the pages are listed in every language in `sitemap.xml`.

## Adding a travel-tips article

1. Write the English article at `tips/<id>/index.html`, using the same header, footer and layout as the existing tips pages.
2. Add one object to `data/tips.json`: `id`, `href`, `title`, `teaser`, `country`, `image`, `imageAlt`, and `guides` (the guide folder names that should show a “Read before you go” card).
3. Run `python3 tools/i18n/build.py`. This rebuilds the hub grid and country filter from the JSON, adds or updates the card on the mapped English guide pages, generates every language, and updates `sitemap.xml`.

Country names on the hub should already have a translation in `i18n/strings/<lang>.json`. Interface phrases such as “Travel tips” and “Read before you go” are already in those files.

## Picker

The flag in the header opens a short list of languages. The choice is saved in `localStorage` (`earwise_lang`) and as the guide player's preferred audio language. On a later visit, English pages send a visitor to their saved language. Add `?lang=en` to a URL to skip that redirect. On a translated guide page, the audio starts in that language when it has audio.
