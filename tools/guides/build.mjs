// Build the three static readers with the vendored S-poony/Pages generator.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { processPdf } from './vendor/pages/src/processor/pdf/processor.js';
import { generateFlipbookHtml } from './vendor/pages/src/generator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const vendor = path.join(here, 'vendor/pages/src');
const out = path.join(root, 'resources/flipbooks');
const clean = text => text.replace(/[\t ]+$/gm, '').trimEnd() + '\n';
const pdfRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const guides = {
  buyer: ['Buyer’s Guide', 'buy/buyer-guide.pdf'],
  seller: ['Seller’s Guide', 'sell/seller-guide.pdf'],
  ultimate: ['Ultimate Guide to Buy and Sell', 'resources/Ultimate-guide-to-buy&sell.pdf']
};
const modules = ['utils', 'state', 'navigation', 'scaling', 'zoom', 'pageflip', 'ui', 'links', 'main'];
let js = (await Promise.all(modules.map(name => readFile(path.join(vendor, `js/flipbook/${name}.js`), 'utf8')))).join('\n');
// Integration hooks: report readiness and keep the engine's display mode in sync on rotation.
js = js.replace("pageFlip.on('init', () => {", `pageFlip.on('init', () => {
            window.parent.postMessage({ type: 'hkh-guide-ready', guide: config.guideId }, location.origin);`);
js = js.replace('const dims = calculateDimensions(wrapper, config);\n        BOOK_WIDTH_AT_1X', `if (pageFlip) pageFlip.getSettings().display = window.innerHeight > window.innerWidth ? 'single' : 'double';
        const dims = calculateDimensions(wrapper, config);\n        BOOK_WIDTH_AT_1X`);
js = js.replace('flippingTime: 500,', "flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,");
js = js.replace('wrapper.requestFullscreen().catch', 'document.documentElement.requestFullscreen().catch');
js = js.replace("if (fullscreenBtn) {\n        fullscreenBtn.addEventListener", "if (fullscreenBtn && !document.documentElement.requestFullscreen) fullscreenBtn.hidden = true;\n    if (fullscreenBtn && document.documentElement.requestFullscreen) {\n        fullscreenBtn.addEventListener");
await mkdir(path.join(out, 'shared'), { recursive: true });
await writeFile(path.join(out, 'shared/reader.js'), clean(js));
await copyFile(path.join(vendor, 'flipbook.css'), path.join(out, 'shared/reader.css'));
await copyFile(path.join(here, 'vendor/pages-engine.js'), path.join(out, 'shared/pages-engine.js'));
await copyFile(path.join(here, 'reader-theme.css'), path.join(out, 'shared/theme.css'));
await copyFile(path.join(here, 'vendor/PagesEngine-LICENSE'), path.join(out, 'shared/PagesEngine-LICENSE.txt'));
await writeFile(path.join(out, 'shared/NOTICE.txt'), 'Generated with S-poony/Pages (MIT, per upstream README)\nSource: https://github.com/S-poony/Pages/tree/cb7c648b05298c6fdd70453244dbaf116880e4d1\nPagesEngine (MIT): https://github.com/S-poony/PagesEngine/tree/6c585892900409b2f794afb34c9ad3dc4e6f715d\nSee PagesEngine-LICENSE.txt for copyright and permission notice.\n');
const manifest = {};
for (const [id, [title, pdfPath]] of Object.entries(guides)) {
  const pdf = await getDocument({ data: new Uint8Array(await readFile(path.join(root, pdfPath))),
    cMapUrl: path.join(pdfRoot, 'cmaps/'), standardFontDataUrl: path.join(pdfRoot, 'standard_fonts/'),
    wasmUrl: path.join(pdfRoot, 'wasm/'), isEvalSupported: false }).promise;
  const processor = await processPdf(pdf, { scales: [1.3, 2.6], quality: 0.88 }, {
    createCanvas: () => createCanvas(1, 1),
    canvasToDataURL: (canvas, format, quality) => canvas.toDataURL(format, quality)
  });
  const images = [];
  for (let page = 1; page <= processor.pageCount; page++) {
    images.push(await processor.renderPageVariants(page));
    (await pdf.getPage(page)).cleanup();
  }
  const result = await generateFlipbookHtml(images, { title: `${title} | Hannah Keown Homes`, mode: 'folder',
    tableOfContents: processor.tableOfContents, pageLinks: processor.pageLinks }, {
    loadCss: async () => '', loadJs: async () => '', loadPageFlipJs: async () => ''
  }, [], processor.pageLinks);
  const directory = path.join(out, id);
  await mkdir(path.join(directory, 'images'), { recursive: true });
  for (const asset of result.assets) {
    await writeFile(path.join(directory, asset.filename), Buffer.from(asset.data.split(',')[1], 'base64'));
  }
  // Standalone visits return to the email form. The form authorizes only its selected iframe.
  const guard = `<meta name="robots" content="noindex,nofollow"><script>
    try { if (parent === window || parent.location.origin !== location.origin || parent.hkhGuideAccess !== '${id}') {
      location.replace('/resources/guide.html?guide=${id}');
    } } catch { location.replace('/resources/guide.html?guide=${id}'); }
  </script>`;
  let html = result.html.replace('<head>', `<head>${guard}`)
    .replace('</head>', `<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="../shared/reader.css"><link rel="stylesheet" href="../shared/theme.css"></head>`)
    .replace('pageCount: ', `guideId: '${id}', pageCount: `)
    .replace('id="page-input" min="2"', 'id="page-input" aria-label="Page number" min="1"')
    .replace('value="2">', 'value="1">')
    .replace('</body>', '<script src="../shared/pages-engine.js"></script><script src="../shared/reader.js"></script></body>');
  let pageNumber = 0;
  html = html.replaceAll('class="page-image"', () => `alt="${title}, page ${++pageNumber}" class="page-image"`).replaceAll(' alt=""', '');
  await writeFile(path.join(directory, 'index.html'), clean(html));
  manifest[id] = { title, source: pdfPath, pages: processor.pageCount };
  console.log(`${id}: ${processor.pageCount} pages`);
  await pdf.destroy();
}
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
