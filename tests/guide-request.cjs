// Run with Node and Playwright installed: node tests/guide-request.cjs
// Form submissions are intercepted; these checks never send lead emails.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))); }
const root = path.resolve(__dirname, '..');
const pdfs = {
  buyer: '/buy/buyer-guide.pdf',
  seller: '/sell/seller-guide.pdf',
  ultimate: '/resources/Ultimate-guide-to-buy%26sell.pdf'
};
const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('.pdf')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<title>PDF destination reached</title>');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
    res.end(await fs.readFile(filename));
  } catch { res.writeHead(404); res.end('Not found'); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  let checks = 0;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let response = { status: 200, body: { success: true } };
    let calls = [];
    await page.route('https://api.web3forms.com/submit', async route => {
      calls.push(route.request().postDataJSON());
      if (response.abort) return route.abort();
      await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
    });
    const visit = async guide => {
      calls = [];
      await page.goto(`${origin}/resources/guide.html?guide=${encodeURIComponent(guide)}`);
      await page.locator('button[type="submit"]:enabled').waitFor();
    };
    for (const [route, count] of [['/', 2], ['/buy/', 2], ['/sell/', 2], ['/resources/', 3]]) {
      await page.goto(origin + route);
      const links = page.locator('a[href^="/resources/guide.html?guide="]');
      assert.equal(await links.count(), count);
      for (const link of await links.all()) assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await page.locator('a[href*="anyflip.com"],a[href$=".pdf"]').count(), 0);
      checks++;
    }
    for (const guide of Object.keys(pdfs)) {
      await visit(guide);
      assert.equal(await page.locator('#guide-choice').inputValue(), guide);
      await page.locator('button[type="submit"]').click();
      assert.equal(calls.length, 0);
      assert.equal(await page.locator('#guide-ready').isVisible(), false);
      checks++;
      for (const email of ['bad-email', 'person@localhost']) {
        await page.locator('#guide-email').fill(email);
        await page.locator('button[type="submit"]').click();
        assert.equal(calls.length, 0);
        assert.equal(new URL(page.url()).pathname, '/resources/guide.html');
        checks++;
      }
      await page.locator('#guide-email').fill('buyer@example.com');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(origin + pdfs[guide]);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].email, 'buyer@example.com');
      assert.equal(calls[0].guide_id, guide);
      checks++;
    }
    for (const failure of [
      { status: 500, body: { success: true } },
      { status: 200, body: { success: false } },
      { status: 200, body: { success: 'true' } },
      { abort: true }
    ]) {
      response = failure;
      await visit('buyer');
      await page.locator('#guide-email').fill('buyer@example.com');
      await page.locator('button[type="submit"]').click();
      await page.getByText('We could not confirm your request.', { exact: false }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/resources/guide.html');
      assert.equal(await page.locator('#guide-email').inputValue(), 'buyer@example.com');
      assert.equal(await page.locator('#guide-ready').isVisible(), false);
      assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
      checks++;
    }
    response = { status: 200, body: { success: true } };
    await visit('__proto__');
    assert.equal(await page.locator('#guide-choice').inputValue(), '');
    await page.locator('#guide-email').fill('buyer@example.com');
    await page.locator('button[type="submit"]').click();
    assert.equal(calls.length, 0);
    checks++;
    await visit('buyer');
    await page.evaluate(() => { document.querySelector('[name="botcheck"]').checked = true; });
    await page.locator('#guide-email').fill('buyer@example.com');
    await page.locator('button[type="submit"]').click();
    assert.equal(calls.length, 0);
    checks++;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 360, height: 900 }]) {
      await page.setViewportSize(viewport);
      await visit('ultimate');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/tmp/hkh-guide-${viewport.width}.png`, fullPage: true });
      checks++;
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJS.newPage();
    await fallback.goto(origin + '/resources/guide.html?guide=buyer');
    assert.equal(await fallback.locator('button[type="submit"]').isDisabled(), true);
    assert.equal(await fallback.locator('a[href$=".pdf"]').count(), 0);
    assert.equal(await fallback.locator('noscript').isVisible(), true);
    checks++;
    await noJS.close();
    assert.deepEqual(errors, []);
    console.log(`Passed ${checks} guide access checks. No real emails sent.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
