# Earwise marketing site

Static site for [getearwise.com](https://getearwise.com). GitHub Pages serves this folder as the site root (`CNAME` is `getearwise.com`). There is no build step. Edit the HTML, CSS, and JS here.

## Pages

| File | URL |
| --- | --- |
| `index.html` | https://getearwise.com/ |
| `pompeii/index.html` | https://getearwise.com/pompeii/ |
| `privacy.html` | https://getearwise.com/privacy.html |
| `terms.html` | https://getearwise.com/terms.html |
| `support.html` | https://getearwise.com/support.html |
| `credits.html` | https://getearwise.com/credits.html |
| `account.html` | https://getearwise.com/account.html |
| `my-guides.html` | https://getearwise.com/my-guides.html |

`account.html` and `my-guides.html` are a test sign-in kept in the browser only (`noindex`). Privacy and terms are still drafts (`noindex`). Home and `/pompeii/` are the public pages.

## Contact

hello@getearwise.com

## Look and content

Visual tokens follow the Earwise app: Plus Jakarta Sans, teal `#0f766e` (dark `#5eead4`), quiet grey `#f3f3f5`, card radius 16, photo radius 14, search 52px tall. Dark colours follow `prefers-color-scheme`.

Guide photos in `img/guides/` are vendored from [Travel_app_media](https://github.com/RikusFick/Travel_app_media). Credits are on `credits.html`.

Pompeii’s 19 stops follow the public guide text in that repo (`text/*/italy.json`, key `pompeii`). English on `/pompeii/` is a short route list, not the full narration. The private app catalog (`src/data/catalog/guides/pompeii.json` and `pricing.json`) is not in this repo, so cards show the published pay-once range **€2–5**, not a per-guide price. The map pin is Porta Marina in the archaeological park (40.7489, 14.4849).

## Checkout

Buy is a placeholder. The button on `/pompeii/` is a `mailto:hello@getearwise.com` link labelled “Buy — coming soon”. It does not take payment. Do not wire Stripe here yet.
