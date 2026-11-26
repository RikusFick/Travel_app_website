#!/usr/bin/env python3
"""Build the translated site from the English pages.

The English pages in this repo are the one shared template. Every other
language is generated from them, so a layout or feature change is made once,
in English, and this script carries it into every language:

    python3 tools/i18n/build.py            # rebuild every language
    python3 tools/i18n/build.py --missing  # also list text with no translation

Text comes from two kinds of files, one per language:
  i18n/strings/<lang>.json  interface text, keyed by the exact English text
                            ("{name}" marks a part that is filled in)
  i18n/guides/<lang>.json   guide names and stop text, imported from the
                            approved translated audio scripts
                            (tools/i18n/import_scripts.py)
Anything without a translation stays in English.

The script also refreshes, in the English pages, the language picker in the
header and the hreflang links, and rewrites sitemap.xml and js/i18n/<lang>.js.
"""
from __future__ import annotations

import argparse
import copy
import html as htmllib
import json
import posixpath
import re
import shutil
import sys
from pathlib import Path

from bs4 import BeautifulSoup, Comment, Doctype, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://getearwise.com"
SKIP_DIRS = {".git", "worker", "tools", "i18n", "node_modules", ".github"}
SKIP_FILES = {"404.html"}
# Legal and credits pages keep their English body; only the page frame is translated.
ENGLISH_BODY = {"privacy.html", "terms.html", "credits.html"}
TEXT_ATTRS = ("alt", "aria-label", "placeholder", "title", "data-title")
BLOCKS = ("p", "li", "summary", "label", "h1", "h2", "h3", "h4", "span", "small", "a", "button", "td", "th", "dd", "dt", "strong", "figcaption", "div", "option")
PICKER_RE = re.compile(r"<!--i18n:picker-->.*?<!--/i18n:picker-->\s*", re.S)
HEAD_RE = re.compile(r"<!--i18n:head-->.*?<!--/i18n:head-->\s*", re.S)
NUM_KEYS = {"n", "m", "count", "min", "stops"}
# Patterns only scripts fill in; page text never matches against these.
JS_ONLY = {"Play {title}", "Pause {title}", "Stop {n}", "stop {n}", "Stops {range}", "Account, {name}",
           "Ready when you are, {name}.", "You sign in with {method}", "{title} is ready to play.",
           "Buy — {price}"}


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def norm(text: str) -> str:
    return " ".join(text.split())


class Strings:
    """Exact-text lookups plus "{placeholder}" patterns for one language."""

    def __init__(self, table: dict):
        self.exact = {}
        self.html = {}
        self.patterns = []
        for key, val in table.items():
            if key.startswith("_") or not isinstance(val, str) or not val:
                continue
            if "{" in key and re.search(r"\{\w+\}", key):
                if key in JS_ONLY and key != "Buy — {price}":
                    continue
                parts = re.split(r"(\{\w+\})", key)
                rx = ""
                names = []
                for part in parts:
                    m = re.fullmatch(r"\{(\w+)\}", part)
                    if m:
                        name = m.group(1)
                        names.append(name)
                        rx += r"(?P<%s>\d+(?:[.,]\d+)?)" % name if name in NUM_KEYS else r"(?P<%s>.+?)" % name
                    else:
                        rx += re.escape(part)
                self.patterns.append((re.compile("^" + rx + "$", re.S), val, key))
            elif "<" in key:
                self.html[norm(key)] = val
            else:
                self.exact[norm(key)] = val
        self.patterns.sort(key=lambda p: -len(p[2]))
        self.outputs = {norm(v) for v in table.values() if isinstance(v, str)}
        for v in self.html.values():
            self.outputs.update(norm(x) for x in re.split(r"<[^>]+>", v) if x.strip())


class Translator:
    def __init__(self, strings: Strings, local: dict | None = None):
        self.s = strings
        self.local = local or {}
        self.missing = set()
        self.local_out = {norm(v) for v in self.local.values()}

    def __call__(self, text: str, record: bool = True) -> str:
        t = norm(text)
        if not t:
            return text
        if t in self.local:
            return self.local[t]
        if t in self.s.exact:
            return self.s.exact[t]
        for rx, val, key in self.s.patterns:
            m = rx.match(t)
            if not m:
                continue
            out = val
            for name, cap in m.groupdict().items():
                rep = cap if name in NUM_KEYS else self(cap, record=False)
                if name == "languages":
                    rep = self.join_list(cap)
                out = out.replace("{" + name + "}", rep)
            return out
        if record and re.search(r"[A-Za-z]{2}", t) and t not in self.s.outputs and t not in self.local_out:
            self.missing.add(t)
        return text

    def join_list(self, text: str) -> str:
        items = re.split(r", | and ", text)
        tr = [self(i, record=False) for i in items]
        comma = self.s.exact.get(",", ", ")
        last = self.s.exact.get("and", " and ")
        if len(tr) == 1:
            return tr[0]
        return comma.join(tr[:-1]) + last + tr[-1]


def page_files():
    out = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT).as_posix()
        top = rel.split("/")[0]
        if top in SKIP_DIRS or top in LANG_PATHS or rel in SKIP_FILES:
            continue
        out.append(rel)
    return out


def url_of(rel: str) -> str:
    """Site path of a page file: guides/index.html -> /guides/."""
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def localized(path: str, code: str) -> str:
    lang = LANGS[code]
    if not lang["path"]:
        return path
    return "/" + lang["path"] + path


def resolve(rel: str, href: str) -> str:
    base = posixpath.dirname("/" + rel)
    path = href.split("#")[0].split("?")[0]
    full = posixpath.normpath(posixpath.join(base, path)) if path else "/" + rel
    if path.endswith("/") and not full.endswith("/"):
        full += "/"
    return full


def is_page(path: str) -> bool:
    p = path.lstrip("/")
    if p == "" or p.endswith("/"):
        return (p + "index.html") in PAGE_SET or p == ""
    return p in PAGE_SET


# ---------------------------------------------------------------- picker + head

def picker_html(rel: str, code: str, t) -> str:
    lang = LANGS[code]
    path = url_of(rel)
    items = []
    for c in ORDER:
        l = LANGS[c]
        current = ' aria-current="true"' if c == code else ""
        items.append(
            f'<li><a href="{localized(path, c)}" hreflang="{l["html"]}" lang="{l["html"]}" data-lang="{c}"{current}>'
            f'<img src="/img/flags/{l["flag"]}.svg" alt="" width="20" height="14">'
            f'<span>{htmllib.escape(l["name"])}</span></a></li>'
        )
    label = htmllib.escape(t("Language") + ": " + lang["name"], quote=True)
    return (
        '<!--i18n:picker--><details class="lang-pick">'
        f'<summary aria-label="{label}" title="{htmllib.escape(t("Language"), quote=True)}">'
        f'<img src="/img/flags/{lang["flag"]}.svg" alt="" width="22" height="16">'
        f'<span class="lang-code">{c_code(code)}</span>'
        '<svg class="lang-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>'
        '<ul class="lang-menu">' + "".join(items) + "</ul></details><!--/i18n:picker-->\n    "
    )


def c_code(code: str) -> str:
    return {"zh": "中文", "ja": "日本語", "hi": "हिन्दी", "ru": "RU"}.get(code, code.upper())


def head_html(rel: str, code: str) -> str:
    path = url_of(rel)
    links = []
    if rel not in NOINDEX:
        for c in ORDER:
            links.append(f'<link rel="alternate" hreflang="{LANGS[c]["html"]}" data-lang="{c}" href="{SITE}{localized(path, c)}">')
        links.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}{path}">')
    scripts = []
    if code != "en":
        scripts.append(f'<script src="/js/i18n/{code}.js?v={VERSION}"></script>')
    scripts.append(f'<script src="/js/lang.js?v={VERSION}"></script>')
    return "<!--i18n:head-->" + "".join(links) + "".join(scripts) + "<!--/i18n:head-->\n"


def inject_english(rel: str, text: str, t_en) -> str:
    text = HEAD_RE.sub("", text)
    text = PICKER_RE.sub("", text)
    text = text.replace("</head>", head_html(rel, "en") + "</head>", 1)
    m = re.search(r'(\s*)<button type="button" class="nav-toggle"', text)
    if m:
        text = text[: m.start()] + m.group(1) + picker_html(rel, "en", t_en).rstrip() + text[m.start():]
    return text


# ---------------------------------------------------------------- guide text

def guide_local(soup, gid: str, gdata: dict, t) -> dict:
    """English text on a guide page -> translated text, from i18n/guides."""
    local = {}
    g = gdata.get(gid) or {}
    h1 = soup.find("h1")
    en_title = ""
    if h1:
        en_title = re.sub(r"\s+audio guide$", "", norm(h1.get_text()))
        h1["data-guide-title"] = en_title
    if g.get("title") and en_title:
        local[en_title] = g["title"]
        crumbs = soup.select("nav.crumbs span, .crumbs span")
        if crumbs:
            local.setdefault(norm(crumbs[-1].get_text()), g["title"])
    intro = soup.find("p", class_="intro")
    if intro and g.get("tagline"):
        en_intro = norm(intro.get_text())
        tail = "Listen here, or get the Earwise app to play as you walk."
        tag = g["tagline"].strip()
        if not re.search(r"[.!?。！？।]$", tag):
            tag += "。" if CODE in ("ja", "zh") else ("।" if CODE == "hi" else ".")
        sep = "" if CODE in ("ja", "zh") else " "
        local[en_intro] = tag + (sep + t(tail) if en_intro.endswith(tail) else "")
    stops = g.get("stops") or {}
    for li in soup.select("ol.stops > li"):
        num = li.find("span", class_="num")
        if not num:
            continue
        row = stops.get(norm(num.get_text()))
        if not row:
            continue
        h3 = li.find("h3")
        if h3 and row.get("title"):
            en = norm(h3.get_text())
            local[en] = row["title"]
            local[f"{norm(num.get_text())}. {en}"] = f'{norm(num.get_text())}. {row["title"]}'
            h3.string = row["title"]
        body = li.find("div")
        p = body.find("p", recursive=False) if body else None
        if p and row.get("line"):
            p.string = row["line"]
            local[norm(row["line"])] = row["line"]
        tr = li.select_one("div.transcript")
        if tr and row.get("paragraphs"):
            tr.clear()
            for para in row["paragraphs"]:
                np = soup.new_tag("p")
                np.string = para
                tr.append(np)
                local[norm(para)] = para
    for v in list(local.values()):
        local.setdefault(norm(v), v)
    return local


def translate_tree(soup, t, skip=None):
    # Whole elements with inline markup first.
    if t.s.html:
        for el in soup.find_all(BLOCKS):
            if skip and skip(el):
                continue
            inner = norm("".join(str(c) for c in el.contents))
            if inner in t.s.html:
                frag = BeautifulSoup(t.s.html[inner], "html.parser")
                el.clear()
                for child in list(frag.contents):
                    el.append(child)
    for node in list(soup.find_all(string=True)):
        if isinstance(node, (Comment, Doctype)):
            continue
        parent = node.parent
        if parent is None or parent.name in ("script", "style"):
            continue
        if skip and skip(parent):
            continue
        raw = str(node)
        if not raw.strip():
            continue
        new = t(raw)
        if new != raw and norm(new) != norm(raw):
            lead = raw[: len(raw) - len(raw.lstrip())]
            trail = raw[len(raw.rstrip()):]
            node.replace_with(NavigableString(lead + new + trail))
    for el in soup.find_all(True):
        if skip and skip(el):
            continue
        for a in TEXT_ATTRS:
            v = el.get(a)
            if isinstance(v, str) and v.strip() and re.search(r"[A-Za-z]", v):
                nv = t(v)
                if nv != v:
                    el[a] = nv
        if el.name == "input" and el.get("type") in ("submit", "button") and el.get("value"):
            el["value"] = t(el["value"])


def rewrite_urls(soup, rel: str, code: str):
    for el in soup.find_all(True):
        for attr in ("href", "src", "srcset", "poster", "action", "data-account-href"):
            v = el.get(attr)
            if not isinstance(v, str) or not v:
                continue
            if attr == "srcset":
                parts = []
                for item in v.split(","):
                    bits = item.strip().split()
                    if bits:
                        bits[0] = fix_url(bits[0], rel, code, asset_only=True)
                    parts.append(" ".join(bits))
                el[attr] = ", ".join(parts)
                continue
            el[attr] = fix_url(v, rel, code, asset_only=el.name in ("img", "script", "source", "audio", "video") or (el.name == "link" and el.get("rel") != ["canonical"] and "alternate" not in (el.get("rel") or [])))


def fix_url(v: str, rel: str, code: str, asset_only=False) -> str:
    if v.startswith(("#", "mailto:", "tel:", "data:", "javascript:", "//")):
        return v
    if v.startswith(SITE + "/") or v == SITE:
        path = v[len(SITE):] or "/"
        if not asset_only and is_page(path.split("#")[0].split("?")[0]):
            return SITE + localized(path, code)
        return v
    if re.match(r"^[a-z]+:", v):
        return v
    if v.startswith("/"):
        if not asset_only and is_page(v.split("#")[0].split("?")[0]):
            return localized(v, code)
        return v
    target = resolve(rel, v)
    if not asset_only and is_page(target):
        return v  # relative page links keep working inside /<lang>/
    suffix = ""
    if "?" in v or "#" in v:
        m = re.search(r"[?#].*$", v)
        suffix = m.group(0) if m else ""
    return target + suffix


def translate_jsonld(soup, t, code: str):
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(sc.string or "")
        except Exception:
            continue

        def walk(o):
            if isinstance(o, dict):
                for k, v in list(o.items()):
                    if isinstance(v, str):
                        if k in ("name", "description", "category"):
                            o[k] = t(v, record=False)
                        elif k in ("item", "url") and v.startswith(SITE):
                            o[k] = fix_url(v, "index.html", code)
                    else:
                        walk(v)
                if o.get("@type") == "AudioObject" and isinstance(o.get("contentUrl"), str):
                    audio = AUDIO_LANGS.get(CURRENT_GID) or {}
                    if audio.get(code):
                        o["contentUrl"] = re.sub(r"/audio/en/", f"/audio/{code}/", o["contentUrl"])
                        o["inLanguage"] = LANGS[code]["html"]
            elif isinstance(o, list):
                for x in o:
                    walk(x)

        walk(data)
        sc.string = "\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def build_page(rel: str, code: str, en_text: str, strings: Strings, gdata: dict, report: dict):
    global CURRENT_GID
    soup = BeautifulSoup(en_text, "html.parser")
    t = Translator(strings)
    gid = rel.split("/")[0] if rel.endswith("/index.html") and rel.count("/") == 1 else ""
    CURRENT_GID = gid
    if gid in AUDIO_LANGS:
        t.local.update(guide_local(soup, gid, gdata, t))
        t.local_out = {norm(v) for v in t.local.values()}
        block = soup.find("div", class_="buy-block")
        if block and "buy-free" in (block.get("class") or []):
            block["data-free"] = "1"
        sel = soup.find("select", id="audio-lang-select")
        if sel and (AUDIO_LANGS[gid].get(code)):
            for opt in sel.find_all("option"):
                if opt.get("value") == code:
                    opt["selected"] = ""
                elif opt.has_attr("selected"):
                    del opt["selected"]
    # Country pages: guide cards take each guide's own translated name.
    for card in soup.select("a.guide-card[href]"):
        target = resolve(rel, card["href"]).strip("/")
        g = gdata.get(target) or {}
        h3 = card.find("h3")
        if h3 and g.get("title"):
            card["data-guide"] = (card.get("data-guide", "") + " " + g["title"].lower()).strip()
            h3.string = g["title"]
    # Map pins carry stop names.
    for el in soup.find_all(attrs={"data-pins": True}):
        try:
            pins = json.loads(el["data-pins"])
            for p in pins:
                if isinstance(p, dict) and p.get("name"):
                    p["name"] = t(p["name"], record=False)
            el["data-pins"] = json.dumps(pins, ensure_ascii=False)
        except Exception:
            pass
    lang = LANGS[code]
    html_el = soup.find("html")
    html_el["lang"] = lang["html"]
    html_el["data-lang-root"] = "/" + lang["path"]
    html_el["data-lang"] = code
    body_en = rel in ENGLISH_BODY
    main = soup.find("main")

    def skip(el):
        return body_en and main is not None and (el is main or main in el.parents)

    for old in soup.select("details.lang-pick"):
        old.decompose()
    translate_tree(soup, t, skip=skip if body_en else None)
    if body_en and main is not None:
        main["lang"] = "en"
        wrap = main.find("div", class_="wrap") or main
        note = soup.new_tag("p", attrs={"class": "lang-note", "lang": lang["html"]})
        note.string = t("This page is in English. The English version applies." if rel != "credits.html" else "Photo credits are listed in English.")
        h1 = wrap.find("h1")
        if h1:
            h1.insert_after(note)
        else:
            wrap.insert(0, note)
    # Head meta.
    for meta in soup.find_all("meta"):
        if meta.get("name") == "description" or meta.get("property") in ("og:title", "og:description"):
            meta["content"] = t(meta.get("content", ""))
        if meta.get("property") == "og:url":
            meta["content"] = SITE + localized(url_of(rel), code)
    og = soup.find("meta", property="og:url")
    if og is not None and not soup.find("meta", property="og:locale"):
        og.insert_after(soup.new_tag("meta", attrs={"property": "og:locale", "content": lang["og"]}))
    can = soup.find("link", rel="canonical")
    if can is not None:
        can["href"] = SITE + localized(url_of(rel), code)
    rewrite_urls(soup, rel, code)
    translate_jsonld(soup, t, code)
    # Search: the localized attraction list.
    for sc in soup.find_all("script", src=True):
        if re.search(r"(^|/)js/attractions\.js", sc["src"]):
            sc["src"] = f"/js/i18n/attractions-{code}.js?v={VERSION}"
    out = str(soup)
    out = HEAD_RE.sub("", out)
    out = PICKER_RE.sub("", out)
    out = out.replace("</head>", head_html(rel, code) + "</head>", 1)
    m = re.search(r'(\s*)<button class="nav-toggle"|(\s*)<button[^>]*class="nav-toggle"', out)
    if m:
        out = out[: m.start()] + "\n    " + picker_html(rel, code, t).rstrip() + out[m.start():]
    if not out.lstrip().lower().startswith("<!doctype"):
        out = "<!doctype html>\n" + out
    dest = ROOT / lang["path"] / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8")
    for s in t.missing:
        report.setdefault(s, set()).add(rel)


def build_attractions(code: str, strings: Strings, gdata: dict):
    src = (ROOT / "js/attractions.js").read_text(encoding="utf-8")
    m = re.search(r"window\.EARWISE_ATTRACTIONS\s*=\s*(\[.*\])\s*;?\s*$", src, re.S)
    items = json.loads(m.group(1))
    t = Translator(strings)
    out = []
    for it in items:
        it = dict(it)
        gid = it.get("href", "").strip("/")
        g = gdata.get(gid) or {}
        en_title = it.get("title", "")
        if g.get("title"):
            it["title"] = g["title"]
        it["country"] = t(it.get("country", ""), record=False)
        it["q"] = " ".join(filter(None, [it.get("q", ""), en_title.lower(), it["title"].lower(), it["country"].lower()]))
        if it.get("href", "").startswith("/"):
            it["href"] = localized(it["href"], code)
        out.append(it)
    dest = ROOT / "js/i18n" / f"attractions-{code}.js"
    dest.write_text("/* Generated by tools/i18n/build.py from js/attractions.js. Do not edit. */\nwindow.EARWISE_ATTRACTIONS = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")


def js_strings() -> set:
    keys = set()
    for p in (ROOT / "js").glob("*.js"):
        src = p.read_text(encoding="utf-8")
        for m in re.finditer(r"""\b(?:T|earwiseT|tr)\(\s*(["'])((?:\\.|(?!\1).)*)\1""", src):
            raw = m.group(2)
            keys.add(raw.replace("\\'", "'").replace('\\"', '"'))
    keys.update({"Language", "Pause {title}", "Play {title}"})
    return keys


def write_js_dict(code: str, table: dict, keys: set):
    used = {k: v for k, v in table.items() if k in keys and isinstance(v, str)}
    # Patterns used by scripts are looked up as exact keys too.
    dest = ROOT / "js/i18n" / f"{code}.js"
    dest.write_text(
        "/* Generated by tools/i18n/build.py from i18n/strings/" + code + ".json. Do not edit. */\n"
        "window.EARWISE_I18N = " + json.dumps({"lang": code, "strings": used}, ensure_ascii=False, sort_keys=True) + ";\n",
        encoding="utf-8",
    )


def write_sitemap(pages):
    sm = ROOT / "sitemap.xml"
    text = sm.read_text(encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc>", text)
    en_locs = [l for l in locs if not re.match(re.escape(SITE) + r"/(" + "|".join(LANG_PATHS) + r")/", l)]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc in en_locs:
        lines.append(f"  <url><loc>{loc}</loc></url>")
    for c in ORDER:
        if c == "en":
            continue
        for loc in en_locs:
            path = loc[len(SITE):] or "/"
            if is_page(path):
                lines.append(f"  <url><loc>{SITE}{localized(path, c)}</loc></url>")
    lines.append("</urlset>")
    sm.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    global LANGS, ORDER, LANG_PATHS, PAGE_SET, VERSION, AUDIO_LANGS, NOINDEX, CODE
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated language codes")
    ap.add_argument("--missing", action="store_true", help="list text that has no translation")
    ap.add_argument("--version", default="", help="cache-buster for lang scripts (default: read from js/nav.js links)")
    args = ap.parse_args()
    conf = load_json(ROOT / "i18n/languages.json")
    LANGS = {l["code"]: l for l in conf["languages"]}
    ORDER = [l["code"] for l in conf["languages"]]
    LANG_PATHS = {l["path"] for l in conf["languages"] if l["path"]}
    pages = page_files()
    PAGE_SET = set(pages)
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    vm = re.search(r"nav\.js\?v=([\w.-]+)", home)
    VERSION = args.version or (vm.group(1) if vm else "1")
    AUDIO_LANGS = {g: {k: v for k, v in (info.get("languages") or {}).items() if v} for g, info in load_json(ROOT / "data/audio.json")["guides"].items()}
    NOINDEX = set()
    for rel in pages:
        if re.search(r'<meta name="robots" content="[^"]*noindex', (ROOT / rel).read_text(encoding="utf-8")):
            NOINDEX.add(rel)
    (ROOT / "js/i18n").mkdir(exist_ok=True)
    keys = js_strings()
    en_strings = Strings({})
    t_en = Translator(en_strings)
    # 1. English template pages: picker + hreflang (text edits only, no re-serialising).
    for rel in pages:
        p = ROOT / rel
        text = p.read_text(encoding="utf-8")
        new = inject_english(rel, text, t_en)
        if new != text:
            p.write_text(new, encoding="utf-8")
    codes = [c for c in ORDER if c != "en" and (not args.only or c in args.only.split(","))]
    totals = {}
    for code in codes:
        CODE = code
        table = load_json(ROOT / f"i18n/strings/{code}.json", {}) or {}
        gdata = load_json(ROOT / f"i18n/guides/{code}.json", {}) or {}
        strings = Strings(table)
        out_dir = ROOT / LANGS[code]["path"]
        if out_dir.exists() and not args.only:
            shutil.rmtree(out_dir)
        report = {}
        for rel in pages:
            build_page(rel, code, (ROOT / rel).read_text(encoding="utf-8"), strings, gdata, report)
        build_attractions(code, strings, gdata)
        write_js_dict(code, table, keys)
        totals[code] = report
        print(f"{code}: {len(pages)} pages, {len(report)} texts kept in English")
    write_sitemap(pages)
    if args.missing:
        miss = {}
        for code, rep in totals.items():
            for s, rels in rep.items():
                miss.setdefault(s, set()).update(rels)
        for s in sorted(miss, key=lambda x: -len(miss[x])):
            print(f"{len(miss[s])}\t{s}\t{sorted(miss[s])[0]}")
        js_missing = sorted(k for k in keys if k not in (load_json(ROOT / f"i18n/strings/{codes[0]}.json", {}) or {})) if codes else []
        for k in js_missing:
            print("JS\t" + k)


LANGS = {}
ORDER = []
LANG_PATHS = set()
PAGE_SET = set()
VERSION = "1"
AUDIO_LANGS = {}
NOINDEX = set()
CURRENT_GID = ""
CODE = "en"

if __name__ == "__main__":
    main()
