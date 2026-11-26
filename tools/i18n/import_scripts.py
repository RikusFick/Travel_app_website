#!/usr/bin/env python3
"""Import guide text from the approved translated audio scripts.

Writes i18n/guides/<lang>.json: for each published guide, the translated guide
title, tagline, stop titles, the one-line stop description (first sentence of
the stop's first narration paragraph, the same rule the English pages use) and,
only for stops whose script is public on the English page, the read-along
paragraphs.

Nothing is invented here. A guide (or a stop) with no matching translated
script is left out, and the site builder falls back to the English text.

  python3 tools/i18n/import_scripts.py --sources sources.json

sources.json maps a country to {"en": <English scripts dir>,
"tr": <translations dir with <lang>/<id>-script.md>}.
"""
from __future__ import annotations
import argparse, html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANG_DIRS = {"de": "de", "es": "es", "fr": "fr", "it": "it", "pt": "pt", "ru": "ru", "ja": "ja", "hi": "hi", "zh": "zh-Hans"}
SUFFIX = re.compile(r"\s*(?:[:：–—-]|——)\s*(?:[^:：–—]*?(?:script|skript|guion|guião|roteiro|copione|testo|сценарий|текст|台本|原稿|脚本|导览稿|ऑडियो\s*गाइड|audio\s*guide|audioguide|audioguía|audioguida|audioguia|áudio-guia|аудиогид|音声ガイド|オーディオガイド|语音导览|guide audio|guia áudio)[^:：–—]*)$", re.I)


def norm(text: str) -> str:
    return " ".join(html.unescape(text).split())


def clean_inline(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    return " ".join(text.split())


def parse_script(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    out = {"heading": "", "tagline": "", "guide_title": "", "stops": {}}
    stop = None
    in_stop = False
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("# ") and not out["heading"]:
            out["heading"] = line[2:].strip()
            continue
        m = re.match(r"\*\*Tagline:\*\*\s*(.+)$", line)
        if m and not in_stop:
            out["tagline"] = clean_inline(m.group(1))
            continue
        m = re.match(r"\*\*Guide title:\*\*\s*(.+)$", line)
        if m and not in_stop:
            out["guide_title"] = clean_inline(m.group(1))
            continue
        m = re.match(r"##\s+Stop\s+(\d+)\s*[.:]\s*(.+)$", line)
        if m:
            stop = {"title": clean_inline(m.group(2)), "paragraphs": [], "fun": []}
            out["stops"][int(m.group(1))] = stop
            in_stop = True
            continue
        if line.startswith("## ") or line.strip() == "---":
            in_stop = False
            stop = None
            continue
        if not in_stop or not line.strip():
            continue
        s = line.strip()
        fm = re.match(r"\*\*(Fun fact|[^*]{1,40})[:：]\*\*\s*(.*)$", s)
        if fm:
            label = fm.group(1).lower()
            if "fun fact" in label and fm.group(2):
                stop["fun"].append(clean_inline(fm.group(2)))
            continue
        if s.startswith(("**", ">", "|", "#", "<!--", "- ", "* ")):
            continue
        if re.fullmatch(r"\*[^*].*\*", s):
            continue  # stage direction
        stop["paragraphs"].append(clean_inline(s))
    return out


def strip_heading(h: str) -> str:
    h = re.sub(r"\s*[（(][^()（）]*[)）]\s*$", "", h).strip()
    prev = None
    while prev != h:
        prev = h
        h = SUFFIX.sub("", h).strip()
    return h.strip(" :：–—")


SENT = re.compile(r"(.+?(?:[.!?](?=\s)|[。！？।]|[.!?]$))", re.S)


def first_sentence(text: str) -> str:
    text = text.strip()
    # Do not split after common abbreviations or initials.
    m = re.match(r"(.+?(?<!\b[A-Z])(?<!\bSt)(?<!\bMt)(?<!\bDr)(?<!\bc)(?<!\bca)(?<!\bnr)(?<!\bS)(?<!\bSto)(?<!\bSta)(?<!\bdi)[.!?](?=\s+[\"'«“„(]?[A-ZÀ-ÖØ-ÞА-ЯЁ¿¡0-9])|.+?[。！？।])", text, re.S)
    return (m.group(1) if m else text).strip()


def english_pages(root: Path) -> dict:
    audio = json.loads((root / "data/audio.json").read_text())["guides"]
    pages = {}
    for gid, info in audio.items():
        page = root / gid / "index.html"
        if not page.exists():
            continue
        t = page.read_text(encoding="utf-8")
        h1 = re.search(r"<h1>(.*?)</h1>", t, re.S)
        title = norm(re.sub(r"<[^>]+>", "", h1.group(1))) if h1 else gid
        title = re.sub(r"\s+audio guide$", "", title)
        stops = {}
        for li in re.finditer(r'<li><span class="num">(\d+)</span><div><h3>(.*?)</h3>(.*?)</div></li>', t, re.S):
            n = int(li.group(1))
            body = li.group(3)
            p = re.match(r"\s*<p>(.*?)</p>", body, re.S)
            tr = re.search(r'<div class="transcript">(.*?)</div>', body, re.S)
            stops[n] = {
                "title": norm(re.sub(r"<[^>]+>", "", li.group(2))),
                "line": norm(re.sub(r"<[^>]+>", "", p.group(1))) if p else "",
                "paragraphs": [norm(re.sub(r"<[^>]+>", "", x)) for x in re.findall(r"<p>(.*?)</p>", tr.group(1), re.S)] if tr else [],
            }
        pages[gid] = {"country": info.get("country"), "title": title, "stops": stops}
    return pages


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", required=True, type=Path)
    ap.add_argument("--catalog", type=Path, help="travel_app src/data/catalog/guides (for app taglines)")
    ap.add_argument("--out", type=Path, default=ROOT / "i18n" / "guides")
    ap.add_argument("--report", type=Path)
    args = ap.parse_args()
    sources = json.loads(args.sources.read_text())
    pages = english_pages(ROOT)
    args.out.mkdir(parents=True, exist_ok=True)
    report = {"missing": [], "stop_mismatch": [], "title_kept_english": []}
    for lang, d in LANG_DIRS.items():
        result = {}
        for gid, page in sorted(pages.items()):
            src = sources.get(page["country"])
            if not src:
                report["missing"].append(f"{lang}:{gid}:no-source"); continue
            sid = (src.get("aliases") or {}).get(gid, gid)
            dirs = src["tr"] if isinstance(src["tr"], list) else [src["tr"]]
            ens = src["en"] if isinstance(src["en"], list) else [src["en"]]
            tr = en = None
            # First translation whose stops match the published guide wins.
            for i, base in enumerate(dirs):
                p = Path(base) / d / f"{sid}-script.md"
                if not p.exists():
                    continue
                cand = parse_script(p)
                if tr is None or set(cand["stops"]) == set(page["stops"]):
                    tr = cand
                    e = Path(ens[min(i, len(ens) - 1)]) / f"{sid}-script.md"
                    en = parse_script(e) if e.exists() else None
                if set(cand["stops"]) == set(page["stops"]):
                    break
            if tr is None:
                report["missing"].append(f"{lang}:{gid}"); continue
            entry = {"stops": {}}
            # Guide title
            title = ""
            if en:
                # Only trust a translated name when the English name in the same
                # script matches the site title (or a simple variant of it).
                en_h = strip_heading(en["guide_title"] or en["heading"])
                tr_h = strip_heading(tr["guide_title"] or tr["heading"])
                if norm(en_h) == page["title"]:
                    title = tr_h
                elif en_h.startswith(page["title"] + ", ") and re.search(r"[,，、]", tr_h):
                    title = re.split(r"\s*[,，、]\s*(?=[^,，、]*$)", tr_h)[0]
                elif re.fullmatch(re.escape(page["title"]) + r"\s*\([^()]*\)", en_h) and re.search(r"[(（][^()（）]*[)）]$", tr_h):
                    title = re.sub(r"\s*[(（][^()（）]*[)）]$", "", tr_h)
                elif en_h.startswith(page["title"] + ": ") and re.search(r"\s?[:：]\s?", tr_h):
                    title = re.split(r"\s?[:：]\s?", tr_h)[0]
                if not title and tr_h:
                    # Looser match: the script names the same place (shared word),
                    # e.g. "Alhambra and Generalife" for the page "Alhambra".
                    page_words = set(re.findall(r"\w{3,}", page["title"].lower())) - {"the", "and", "old", "town"}
                    cand = tr_h
                    if "(" not in page["title"]:
                        cand = re.sub(r"\s*[(（][^()（）]*[)）]", "", cand).strip()
                    if "," not in page["title"] and re.search(r"[,，、]", cand):
                        cand = re.split(r"\s*[,，、]\s*(?=[^,，、]*$)", cand)[0]
                    if len(cand) <= 48 and page_words & set(re.findall(r"\w{3,}", en_h.lower())):
                        title = cand
            if title and title != page["title"]:
                entry["title"] = title
            elif not title:
                report["title_kept_english"].append(f"{lang}:{gid}")
            tagline = ""
            if args.catalog and (args.catalog / f"{gid}.json").exists():
                cat = json.loads((args.catalog / f"{gid}.json").read_text())
                tagline = ((cat.get("blurbs") or {}).get(lang) or "").strip()
            tagline = tagline or tr["tagline"]
            if tagline:
                entry["tagline"] = tagline
            if set(tr["stops"]) != set(page["stops"]):
                # The translation does not match the published stops: keep English stop text.
                report["stop_mismatch"].append(f"{lang}:{gid}:{sorted(tr['stops'])} vs {sorted(page['stops'])}")
                result[gid] = entry
                continue
            for n, pst in page["stops"].items():
                ts = tr["stops"].get(n)
                if not ts or not ts["paragraphs"]:
                    continue
                row = {"title": ts["title"], "line": first_sentence(ts["paragraphs"][0])}
                if pst["paragraphs"]:
                    # Read along follows the translated recording, so use the
                    # translated narration as written (plus its fun fact).
                    row["paragraphs"] = ts["paragraphs"] + ts["fun"]
                entry["stops"][str(n)] = row
            result[gid] = entry
        (args.out / f"{lang}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(lang, len(result), "guides")
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for k, v in report.items():
        print(k, len(v))


if __name__ == "__main__":
    main()
