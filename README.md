# Earwise marketing site

Static site for [getearwise.com](https://getearwise.com). GitHub Pages serves this folder as the site root (`CNAME` is `getearwise.com`). There is no build step. Edit the HTML, CSS, and JS here.

## Pages

| File | URL |
| --- | --- |
| `index.html` | https://getearwise.com/ |
| `guides/index.html` | https://getearwise.com/guides/ |
| `guides/<country>/index.html` | Country page (`spain/` is open with 39 guides; `france/` is open with 66 guides; `italy/` is open with 30 guides; `turkey/` is open with 60 guides; `greece/` is open with 36 guides; `morocco/` is open with 17 guides; `uae/` is open with 13 guides; `portugal/` redirects to `/portugal/`; others are coming soon) |
| `portugal/index.html` | https://getearwise.com/portugal/ |
| `<guide-id>/index.html` | https://getearwise.com/`<guide-id>`/ |
| `pompeii/index.html` | https://getearwise.com/pompeii/ |
| `privacy.html` | https://getearwise.com/privacy.html |
| `terms.html` | https://getearwise.com/terms.html |
| `support.html` | https://getearwise.com/support.html |
| `credits.html` | https://getearwise.com/credits.html |
| `account.html` | https://getearwise.com/account.html |
| `my-guides.html` | https://getearwise.com/my-guides.html |

Portugal guide ids (26, signed off): `alfama-walk`, `baixa-chiado`, `sao-jorge-castle`, `belem-tower`, `jeronimos`, `belem-riverfront`, `coach-museum`, `gulbenkian`, `pena`, `sintra-palace`, `moorish-castle`, `regaleira`, `porto-ribeira`, `clerigos`, `livraria-lello`, `palacio-bolsa`, `gaia-serra-pilar`, `braga-old-town`, `bom-jesus`, `guimaraes-castle-palace`, `guimaraes-old-town`, `douro-valley`, `batalha`, `mafra`, `coimbra-university`, `tomar-convent`.

`account.html` and `my-guides.html` are a test sign-in kept in the browser only (`noindex`). Privacy and terms are still drafts (`noindex`). Home, `/guides/`, `/portugal/`, each Portugal guide, and `/pompeii/` are the public pages.

The home page is the marketing story. It does not list Portugal or Pompeii. The header links to Audio guides, not to a country or an attraction. `/guides/` groups countries by region (Europe, Middle East, Africa, Asia, Americas, Oceania). Portugal (26 guides at `/portugal/`), Spain (39 guides at `/guides/spain/`), France (66 guides at `/guides/france/`), Italy (30 guides at `/guides/italy/`, including `/pompeii/`), Turkey (60 guides at `/guides/turkey/`), Greece (36 guides at `/guides/greece/`), Morocco (17 guides at `/guides/morocco/`), and UAE (13 guides at `/guides/uae/`) are open. The Paris Panthéon is at `/pantheon-paris/` so it does not collide with Rome’s `/pantheon/`. `/guides/portugal/` redirects to `/portugal/`. Other country pages say coming soon. UAE omits 3 owner-approved guides (`burj-khalifa`, `louvre-abu-dhabi`, `saadiyat-cultural-district`) pending legal-clear real-photo covers. Jordan (13 owner-approved guides) remains coming soon pending real-photo covers.

## Contact

hello@getearwise.com

## Look and content

Visual tokens follow Earwise: Plus Jakarta Sans, teal `#0f766e` (dark `#5eead4`), soft grey, card radius 16. Phones keep a single column and sideways card rows. From 900px the page is a site: content up to 1160px, a header with links, and card grids of three or four. Dark colours follow `prefers-color-scheme`.

Guide photos in `img/guides/` are vendored from [Travel_app_media](https://github.com/RikusFick/Travel_app_media). Credits are on `credits.html`.

Pompeii’s 19 stops follow the public guide text in that repo (`text/*/italy.json`, key `pompeii`). English on `/pompeii/` is a short route list, not the full narration. The private app catalog (`src/data/catalog/guides/pompeii.json` and `pricing.json`) is not in this repo, so older cards show the published pay-once range **€2–5**, not a per-guide price. The map pin is Porta Marina in the archaeological park (40.7489, 14.4849).

Portugal is the signed-off country: 26 guides, recorded in 10 languages. Titles match the illustration covers in Travel_app_media. `data/portugal.json` records what this site could verify. The private app catalog was not readable from here. From the Earwise handover (4 Nov 2026): Pena Palace has 12 stops, the Douro Valley has 4, and the Moorish Castle has 7 stops, about 10 minutes, priced at **€1.99**. Other Portugal prices are not published on the site (cards say “Soon”). The Moorish Castle page lists the two stop titles included in the published script sample, and a map pin at 38.79007, -9.38930. Azulejo Museum is held and is not on the site. Italy, France and Spain are not given their own pages.

## Checkout

Buy is a placeholder on every guide page: a `mailto:hello@getearwise.com` link labelled “Buy — coming soon”. It does not take payment. Paystack is not wired on this site.

## On-page audio

Guide pages that have recordings on R2 include an on-page player. Free guides play every available stop in full. Paid guides play only stop 1 as a free sample (`Free sample: stop 1`); later stops stay locked and the Buy button is still a placeholder. Clips are streamed from `https://pub-462529bd23f5417884a111776a18ebeb.r2.dev/audio/<lang>/<guide>-<stop>.mp3` (no leading zero on the stop; `zh-Hans` is stored as `zh`). A language picker defaults to English, then lists whatever languages exist for that guide. Players use `preload="none"` and do not autoplay. Availability is baked into each page and into `data/audio.json` from live `HEAD` checks. Guides with no audio (some UAE titles) show no player.

## Read along

Each stop with a public English script has a collapsible **Read along** transcript (`details`/`summary`, works without JavaScript). Free guides include every stop. Paid guides include only stop 1; later stops say “Script and audio included when you buy” and do not contain the remaining script in the page, JSON, or JavaScript. `js/guide-script.js` exposes `earwiseLoadPurchasedScript` as a placeholder hook for a future purchase flow; checkout is still a placeholder.

## Map pins

`js/guide-map.js` groups stops that share the same coordinates, or lie less than 5 metres apart, into one marker labelled with the stop range (for example `4–8`). The popup lists each stop. Catalog coordinates are not changed. When pins are grouped, the map note reads “All N stops are marked; some stops share a pin.”
