"""Travel tips hub and 'Read before you go' cards, driven by data/tips.json.

Add an article:
  1. Write the English page at tips/<id>/index.html
  2. Add one object to data/tips.json (title, teaser, country, image, href, guides)
  3. Run python3 tools/i18n/build.py

This module is used by tools/i18n/build.py. It can also be run on its own:
  python3 tools/i18n/tips.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/tips.json"
LANG_DIRS = ("de", "fr", "es", "it", "pt", "ru", "ja", "zh", "hi")

# Comment-bounded regions in tips/index.html, replaced from data/tips.json.
FILTERS_RE = re.compile(r"<!--tips:filters-->.*?<!--/tips:filters-->", re.S)
GRID_RE = re.compile(r"<!--tips:grid-->.*?<!--/tips:grid-->", re.S)
CARD_RE = re.compile(r"\n    <aside class=\"tips-read\"[\s\S]*?</aside>", re.S)


def load_articles() -> list[dict]:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    return list(data.get("articles") or [])


def by_guide() -> dict[str, dict]:
    out = {}
    for art in load_articles():
        for gid in art.get("guides") or []:
            out[gid] = art
    return out


def filters_html(articles: list[dict]) -> str:
    countries = []
    seen = set()
    for art in articles:
        c = art["country"]
        if c not in seen:
            seen.add(c)
            countries.append(c)
    chips = [
        '<button type="button" data-tips-filter="all" aria-pressed="true">All countries</button>'
    ]
    for c in countries:
        chips.append(
            f'<button type="button" data-tips-filter="{html.escape(c, quote=True)}">{html.escape(c)}</button>'
        )
    return "<!--tips:filters-->\n    <div class=\"tips-filters\" role=\"group\" aria-label=\"Filter by country\">" + "".join(chips) + "</div>\n    <!--/tips:filters-->"


def grid_html(articles: list[dict]) -> str:
    cards = []
    for art in articles:
        cards.append(
            f'<a class="tips-card" href="{html.escape(art["href"], quote=True)}" data-country="{html.escape(art["country"], quote=True)}">'
            f'<div class="photo"><img src="{html.escape(art["image"], quote=True)}" alt="{html.escape(art["imageAlt"], quote=True)}" width="960" height="640" loading="lazy"></div>'
            f'<div class="body"><p class="tag">{html.escape(art["country"])}</p>'
            f'<h2>{html.escape(art["title"])}</h2>'
            f'<p class="teaser">{html.escape(art["teaser"])}</p></div></a>'
        )
    return (
        "<!--tips:grid-->\n    <div class=\"tips-grid\">\n      "
        + "\n      ".join(cards)
        + "\n    </div>\n    <p class=\"fine\" data-tips-empty hidden>No articles for this country.</p>\n    <!--/tips:grid-->"
    )


def read_card_html(art: dict, href: str) -> str:
    return (
        "\n    <aside class=\"tips-read\">\n"
        f"      <a href=\"{html.escape(href, quote=True)}\">\n"
        f"        <img src=\"{html.escape(art['image'], quote=True)}\" alt=\"{html.escape(art['imageAlt'], quote=True)}\" width=\"320\" height=\"214\">\n"
        "        <div class=\"body\">\n"
        "          <p class=\"eyebrow\">Read before you go</p>\n"
        f"          <h2>{html.escape(art['title'])}</h2>\n"
        f"          <p class=\"fine\">{html.escape(art['teaser'])}</p>\n"
        "        </div>\n"
        "      </a>\n"
        "    </aside>"
    )


def sync_hub(root: Path | None = None) -> None:
    root = root or ROOT
    path = root / "tips/index.html"
    if not path.exists():
        return
    articles = load_articles()
    text = path.read_text(encoding="utf-8")
    if not FILTERS_RE.search(text) or not GRID_RE.search(text):
        raise SystemExit("tips/index.html is missing <!--tips:filters--> or <!--tips:grid--> markers")
    text = FILTERS_RE.sub(filters_html(articles), text, count=1)
    text = GRID_RE.sub(grid_html(articles), text, count=1)
    path.write_text(text, encoding="utf-8")


def insert_guide_card(text: str, art: dict, href: str) -> str:
    text = CARD_RE.sub("", text)
    card = read_card_html(art, href)
    needle = re.search(r'(<p class="fine map-note">[\s\S]*?</p>\s*)', text)
    if needle:
        return text[: needle.end()] + card + "\n" + text[needle.end():]
    m = re.search(r'(\s*</div>\s*</main>)', text)
    if not m:
        raise SystemExit("could not find a place to insert the tips card")
    return text[: m.start()] + card + "\n" + text[m.start():]

def remove_guide_card(text: str) -> str:
    return CARD_RE.sub("", text)


def sync_guide_cards(root: Path | None = None, languages: bool = True) -> None:
    """Write or refresh the 'Read before you go' card on mapped guide pages."""
    root = root or ROOT
    mapping = by_guide()
    prefixes = [""]
    if languages:
        prefixes += [f"{lang}/" for lang in LANG_DIRS]
    for prefix in prefixes:
        for gid, art in mapping.items():
            path = root / f"{prefix}{gid}/index.html"
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            href = "../tips/" + art["id"] + "/" if not art["href"].startswith("http") else art["href"]
            # Prefer the article href as a relative link from a one-level guide page.
            href = re.sub(r"^/", "../", art["href"]) if art["href"].startswith("/") else art["href"]
            # From /fr/petra-main-trail/, ../tips/petra-tips/ is correct.
            text = insert_guide_card(text, art, href)
            path.write_text(text, encoding="utf-8")


def sync(root: Path | None = None, languages: bool = True) -> None:
    sync_hub(root)
    sync_guide_cards(root, languages=languages)


if __name__ == "__main__":
    sync()
    print("tips hub and guide cards synced from", DATA)
