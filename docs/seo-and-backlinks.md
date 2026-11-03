# Hannah Keown Homes: search visibility and backlinks

Prepared November 2, 2026. Canonical website: https://hannahkeownhomes.com/.

## What the audit established

The MLS search page had a `noindex` directive. Other substantive pages already allowed indexing. The sitemap and existing canonical tags used `www`, while production redirects `www` to the apex domain. The existing sitemap omitted the MLS search and terms pages. Internal links resolved locally, including the home-value form anchor and guide destinations. No internal 404 fix was needed.

The update aligns sitemap, robots.txt, canonicals, Open Graph URLs, and schema identifiers with the production hostname. Fourteen public pages have distinct titles and descriptions, one H1, social metadata, and structured data. The home page has a location-specific H1, and the buyer page links directly to filtered Grayson and Hardin County MLS searches and financing resources. The existing 1200 × 628 PNG social image remains in use and includes the Pennington Properties logo.

The admin, 404 page, legacy listings redirect, coming-soon blog, email-gated guide screen, and embedded flipbooks retain deliberate `noindex` directives. The query-driven property detail shell also retains `noindex` because it has no independently published property content until JavaScript and the live MLS request succeed. Its loaded canonical preserves the property ID and drops search-state parameters; indexable property landing pages require a separate server/static publishing workflow and MLS permission review. Do not remove these exclusions indiscriminately. Admin authentication and guide access behavior are unchanged.

## Performance and mobile

Displayed portraits, lender photos, and review screenshots use compressed WebP assets with responsive variants. Original files remain available. K104 went from 5,458,858 bytes to 122,928 bytes at 1200px wide; K82 went from 6,096,623 bytes to 142,968 bytes. The homepage hero went from 308,019 bytes to 61,830 bytes, with a 480px variant for narrow displays. Image dimensions reserve space, below-fold photos load lazily, and the hero has high fetch priority. Scripts defer parsing work, and narrow grids allow long contact details to wrap.

Google's public PageSpeed API returned HTTP 429 (daily quota exceeded) during the audit. These are measured asset reductions, not measured LCP, INP, CLS, or a claimed Lighthouse score. Use PageSpeed Insights and Search Console's Core Web Vitals report when data is available. Field metrics depend on actual visits and may not exist for a small site yet.

## URLs, HTTPS, and links

Retain the established slugs `/buy/`, `/sell/`, `/military-va/`, `/relocation/`, and `/resources/`. `/search.html` is a supported public URL; renaming it adds migration work without a demonstrated indexing benefit. All indexable URLs use HTTPS. Production returned HTTP 301 from HTTP to HTTPS and from `www` to the apex hostname. Keep these redirect checks in release validation. Avoid client-side HTTPS redirects as a substitute for host-level enforcement.

External link checks returned successful responses for the VA, USDA, KHC, Fannie Mae, Northpointe, Supreme Lending, Zillow, and Facebook destinations. The brokerage returned 403, InterLinc returned 503, and the Google review redirect was rate-limited in the audit environment. Those results do not establish that the links are broken for visitors. Confirm them in a regular browser before replacing verified business URLs.

## Search Console

The signed-in `casey@twinlakesweb.com` account initially listed only Kentucky Catholic. A URL-prefix property for `https://hannahkeownhomes.com/` was added, and Google's exact HTML verification meta tag was placed on the homepage. Ownership verification, sitemap submission, and URL inspection must be confirmed after this deployment; adding the tag alone is not proof of successful verification.

Submit `https://hannahkeownhomes.com/sitemap.xml`. Inspect the homepage, `/buy/`, `/sell/`, and `/search.html`; compare Google's selected canonical with the declared apex URL. Check Pages, Manual Actions, and Security Issues before attributing all visibility problems to code. Do not use the deprecated anonymous sitemap ping endpoint. A sitemap helps discovery but does not guarantee indexing or rankings.

## Backlink plan

Prioritize accurate profiles and locally relevant referrals. These are proposed activities, not completed outreach or purchased placements.

| Timing | Target and action | Destination | Completion evidence |
| --- | --- | --- | --- |
| Week 1 | Ask Pennington Properties to link Hannah's agent profile to her website, with the correct name and brokerage. | Homepage or `/about/` | Live profile with a working website link |
| Week 1 | Review Hannah's Google Business Profile, Facebook, Instagram, Zillow, Realtor.com, and Homes.com profiles for website, brokerage, phone, and name consistency. The Google review destination and Homes.com search result still referenced the former brokerage during this audit. | Homepage | Correct live profile details; no duplicate listings |
| Weeks 2–4 | Check eligibility and existing membership at the Grayson County Chamber in Leitchfield and Hardin County Chamber in Elizabethtown. Update an existing listing or evaluate membership for its actual business value. | Homepage | Real membership directory listing, if eligible |
| Weeks 2–6 | Offer a useful joint first-time-buyer or VA education resource to existing lender partners. Ask whether an editorial resource link would help their readers. | `/buy/finance/` or `/military-va/` | Relevant published resource; no required link exchange |
| Weeks 3–8 | Publish one original Central Kentucky move checklist or a real, permission-based client case study with useful local details. Offer it as a reference to local organizations or reporters covering housing. | Relevant guide page | Original source content and any independently earned coverage |
| Monthly | Check Search Console Links and Performance. Record new referring domains, referral visits, inquiries, and query impressions by landing page. | Search Console and analytics | A dated results log, without guaranteed placement or ranking targets |

The relevant local directories are [Grayson County Chamber](https://graysoncountychamber.com/) and [Hardin County Chamber](https://hardinchamber.com/member-directory/). The similarly named Grayson Area Chamber serves Grayson in Carter County and is not the local chamber for this site's Grayson County audience.

Use natural link text such as “Hannah Keown” or the resource title. Do not buy ranking links, submit to bulk directories, automate comments, or arrange excessive reciprocal links. Paid sponsorship links should use `rel="sponsored"` or `nofollow`. Do not claim affiliations, reviews, membership, addresses, or sales results that have not been established.

Sources: [Google sitemaps overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview), [Google canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), and [Google link-spam policy](https://developers.google.com/search/docs/essentials/spam-policies#link-spam).

## Ongoing release check

Run `python3 tools/check-seo.py`. The GitHub workflow runs the same dependency-free check on pushes and pull requests. It fails when canonical URLs, metadata, headings, structured-data JSON, local assets, internal anchors, or sitemap coverage drift. It does not replace live HTTP checks, Google indexing reports, or browser testing.

Browser validation covered eight key routes at 320, 768, and 1440 pixels with no horizontal overflow. Mobile navigation, financing tabs, and the responsive hero image worked. The local checker passed for 23 HTML documents and 14 indexable canonical URLs.
