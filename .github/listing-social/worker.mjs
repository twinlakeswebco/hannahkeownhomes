const listingId = "20261110231141872168000000";
const site = "https://hannahkeownhomes.com";
const propertyUrl = `${site}/property.html?id=${listingId}`;
const imageUrl = `${site}/assets/images/4011-sadler-road-social.png`;
const title = "4011 Sadler Road, Leitchfield, KY | Hannah Keown Homes";
const description = "View this 3-bedroom, 2-bath home on approximately 6 acres in Leitchfield, Kentucky. Listed by Hannah Pharis-Keown with Pennington Properties.";
const imageAlt = "Just listed at 4011 Sadler Road in Leitchfield, Kentucky. Sunset exterior and listing details from Hannah Pharis-Keown, Pennington Properties.";

const socialTags = `
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hannah Keown Homes">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${propertyUrl}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:secure_url" content="${imageUrl}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">
<meta name="twitter:image:alt" content="${imageAlt}">
`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/property.html" ||
        url.searchParams.get("id") !== listingId) {
      return fetch(request);
    }

    // The origin's validators describe the shared property template.
    const headers = new Headers(request.headers);
    headers.delete("If-None-Match");
    headers.delete("If-Modified-Since");
    headers.delete("If-Range");
    headers.delete("Range");
    const origin = await fetch(new Request(request, { headers }));
    if (origin.status !== 200 || !origin.headers.get("Content-Type")?.startsWith("text/html")) {
      return origin;
    }

    const response = new HTMLRewriter()
      .on('head meta[property^="og:"]', { element: (tag) => tag.remove() })
      .on('head meta[name^="twitter:"]', { element: (tag) => tag.remove() })
      .on('head link[rel="canonical"]', {
        element: (tag) => tag.setAttribute("href", propertyUrl),
      })
      .on("head", { element: (head) => head.append(socialTags, { html: true }) })
      .transform(new Response(origin.body, origin));

    response.headers.delete("Content-Length");
    response.headers.delete("ETag");
    response.headers.delete("Last-Modified");
    response.headers.delete("Accept-Ranges");
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
};
