# Earwise marketing site

Static site for [getearwise.com](https://getearwise.com). GitHub Pages serves this folder as the site root (`CNAME` is `getearwise.com`). There is no build step. Edit the HTML, CSS, and JS here.

## Pages

| File | URL |
| --- | --- |
| `index.html` | https://getearwise.com/ |
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

`account.html` is email sign-up and log in through Firebase Authentication. `my-guides.html` shows that session only. Purchases are not connected. Privacy and terms are still drafts (`noindex`). Home, `/portugal/`, each Portugal guide, and `/pompeii/` are the public pages.

## Firebase email sign-in

The site uses the Firebase JS SDK in the browser. GitHub Pages stays static. The only values you paste in are the public web config. Do not commit a service account, admin SDK key, or any private key.

1. Open [Firebase console](https://console.firebase.google.com/) and create a project (for example `earwise`).
2. Add a **Web** app. Copy the `firebaseConfig` object.
3. In **Authentication → Sign-in method**, enable **Email/Password**. Leave Google and Apple off for now.
4. In **Authentication → Settings → Authorized domains**, add `getearwise.com`. `localhost` is already allowed for local checks.
5. Paste the public fields into `js/firebase-config.js`, replacing every `YOUR_…` placeholder. The file should look like the console snippet: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
6. Commit that file. `apiKey` is a public client key, not a secret. Security is the authorized domain list plus Firebase’s own rules.
7. Reload https://getearwise.com/account.html . The “Auth not configured” banner disappears when none of the required fields still start with `YOUR_`.

Until that config is pasted, Log in opens the form and shows **Auth not configured**. The header then shows the email and **Log out** after a real sign-in. The same Firebase project can gain iOS and Android apps later for `travel_app`; this website does not need those configs.

Apple and Google sign-in are not implemented. Paystack is not wired.

## Contact

hello@getearwise.com

## Look and content

Visual tokens follow Earwise: Plus Jakarta Sans, teal `#0f766e` (dark `#5eead4`), soft grey, card radius 16. Phones keep a single column and sideways card rows. From 900px the page is a site: content up to 1160px, a header with links, and card grids of three or four. Dark colours follow `prefers-color-scheme`.

Guide photos in `img/guides/` are vendored from [Travel_app_media](https://github.com/RikusFick/Travel_app_media). Credits are on `credits.html`.

Pompeii’s 19 stops follow the public guide text in that repo (`text/*/italy.json`, key `pompeii`). English on `/pompeii/` is a short route list, not the full narration. The private app catalog (`src/data/catalog/guides/pompeii.json` and `pricing.json`) is not in this repo, so older cards show the published pay-once range **€2–5**, not a per-guide price. The map pin is Porta Marina in the archaeological park (40.7489, 14.4849).

Portugal is the signed-off country: 26 guides, recorded in 10 languages. Titles match the illustration covers in Travel_app_media. `data/portugal.json` records what this site could verify. The private app catalog was not readable from here. From the Earwise handover (4 Nov 2026): Pena Palace has 12 stops, the Douro Valley has 4, and the Moorish Castle has 7 stops, about 10 minutes, priced at **€1.99**. Other Portugal prices are not published on the site (cards say “Soon”). The Moorish Castle page lists the two stop titles included in the published script sample, and a map pin at 38.79007, -9.38930. Azulejo Museum is held and is not on the site. Italy, France and Spain are not given their own pages.

## Checkout

Buy is a placeholder on every guide page: a `mailto:hello@getearwise.com` link labelled “Buy — coming soon”. It does not take payment. Paystack is not wired on this site.
