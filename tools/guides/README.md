# Hannah’s guide flipbooks

The buyer, seller, and ultimate guides use the S-poony/Pages generator and its PagesEngine page-turning engine. Generated readers and JPEG variants live in `resources/flipbooks/` and work on the existing static host without a runtime build step.

## Access flow

All existing guide links continue to use `/resources/guide.html?guide=buyer`, `seller`, or `ultimate`. The existing required email, validation, honeypot, disclosure, and Web3Forms submission remain in place. Only a confirmed successful submission creates the selected reader iframe and exposes its original PDF link. Failed requests never load a reader. Reloading requires another submission. A standalone reader URL returns to the corresponding email form.

This preserves the site’s client-side lead gate. The underlying PDFs and generated assets remain public static files, as the PDFs were previously; this is not server-side authentication. No visitor email is stored in browser storage or included in reader URLs.

## Rebuild after replacing PDFs

Use Node.js 22 or newer. From `tools/guides`, run `npm ci` and `npm run build`. Commit the regenerated `resources/flipbooks/` files along with PDF changes. No upload to the Pages public publishing service is used.

Source PDFs: `buy/buyer-guide.pdf` (36 pages), `sell/seller-guide.pdf` (24 pages), and `resources/Ultimate-guide-to-buy&sell.pdf` (11 pages). The build uses two image resolutions, preserves document links and bookmarks, and writes the source/page counts to `resources/flipbooks/manifest.json`.

## Upstream sources and notices

Pages: https://github.com/S-poony/Pages/tree/cb7c648b05298c6fdd70453244dbaf116880e4d1 . Relevant source modules are retained under `vendor/pages/`; the upstream README declares MIT licensing and is preserved at `vendor/Pages-README.md`.

PagesEngine: https://github.com/S-poony/PagesEngine/tree/6c585892900409b2f794afb34c9ad3dc4e6f715d . The MIT license is preserved in `vendor/PagesEngine-LICENSE`. `vendor/pages-engine.js` is built from that revision with the upstream webpack configuration using `webpack --no-watch --mode production`. Rebuild the engine only when deliberately updating this pinned source.

The Pages source modules are unchanged. `build.mjs` applies documented integration hooks to the output for parent readiness notification, reduced motion, and rotation, adds the direct-visit gate, and loads shared site-themed assets. `reader-theme.css` overrides the upstream warm palette with the site tokens and reserves space for always-visible controls.

## Verification

Run `node tests/guide-request.cjs` from the website root with Playwright available. It intercepts Web3Forms requests, sends no real emails, and checks the three guides, rejected submissions, invalid addresses, direct visits, page navigation, zoom, and desktop/mobile layouts. `CHROME_PATH` can select an installed browser.
