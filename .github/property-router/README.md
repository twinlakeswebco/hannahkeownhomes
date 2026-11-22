# Address-based IDX property URLs

A Cloudflare Worker route serves the existing `property.html` template with HTTP 200 for URLs such as:

`https://hannahkeownhomes.com/properties/123-main-st-leitchfield-ky-42754--id-property-123/`

The address slug is descriptive, **not** an MLS lookup key. The `--id-` suffix contains the existing Spark `ListingKey`, which the frontend uses to request the property from the existing IDX Worker. Duplicate addresses and later address corrections therefore do not break lookup. Address-hidden listings use `listing--id-<key>` without leaking a street address. Existing `/property.html?id=<key>` links continue to work.

## Deployment prerequisites — owner approval required

**Do not merge or deploy until approved.** GitHub Pages cannot serve arbitrary dynamic paths with HTTP 200 by itself. Before publishing the new frontend links, ensure the Cloudflare zone for `hannahkeownhomes.com` is active and the website's DNS records are **proxied** through Cloudflare. Confirm the existing GitHub Pages origin still works through the proxy and that neither Cloudflare nor GitHub Pages redirects the request in a loop.

From `.github/property-router`, deploy using `npx wrangler@4 deploy` in the correct Cloudflare account. The `routes` configuration installs routes for both the apex and www hostnames. This Worker does not change the existing IDX API Worker, DNS, or secrets.

**Release order:** deploy and verify the router first, then publish the frontend change. Verify a real public listing, a hidden-address listing, old links, search return links, gallery, canonical tag, and HTTP status using an uncached browser session. The static HTML currently contains `noindex,follow` and generic social metadata, which this change deliberately preserves; this is not an SEO indexing launch.

## Local checks

`node --test test/*.test.mjs` from this directory. The router tests use no live MLS data.
