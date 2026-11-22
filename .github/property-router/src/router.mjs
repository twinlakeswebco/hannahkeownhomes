// Route only property detail paths. The key suffix makes the address label cosmetic.
export function propertyKey(pathname) {
  const match = pathname.match(/^\/properties\/[a-z0-9-]+--id-([A-Za-z0-9_-]{1,80})\/$/);
  return match?.[1] || null;
}
export function propertyPage(request, template) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (!propertyKey(url.pathname)) return new Response('Not found', { status: 404 });
  // The existing page intentionally uses noindex; keep its IDX compliance policy.
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  };
  return new Response(request.method === 'HEAD' ? null : template, { status: 200, headers });
}
