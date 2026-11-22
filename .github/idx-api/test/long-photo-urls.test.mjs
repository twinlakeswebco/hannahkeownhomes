import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import worker, { normalize, safeUrl } from '../src/worker.mjs';

const frontend = readFileSync(new URL('../../../assets/idx.js', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const photoUrl = length => {
  const prefix = 'https://photos.example.com/listing.jpg?signature=';
  assert.ok(length > prefix.length);
  const result = prefix + 'x'.repeat(length - prefix.length);
  assert.equal(result.length, length);
  return result;
};

const listing = {
  ListingKey: 'property-123', ListingId: '12345', StandardStatus: 'Active',
  StateOrProvince: 'KY', InternetEntireListingDisplayYN: true,
  InternetAddressDisplayYN: true, UnparsedAddress: '123 Main St',
  City: 'Elizabethtown', PostalCode: '42701', ListPrice: 300000,
  PropertyType: 'Residential', BedroomsTotal: 3, BathroomsTotalDecimal: 2,
  LivingArea: 1400, LotSizeAcres: 0.25, ListOfficeName: 'Example Broker',
  ModificationTimestamp: '2026-11-19T12:00:00Z', OriginatingSystemKey: 'mls'
};
const rule = { mls: { View: {
  Summary: { DisplayCompliance: ['ListingUpdateTimestamp'] },
  Detail: { DisplayCompliance: ['ListingUpdateTimestamp', 'ListOfficeName'] }
}, DisclaimerTextOnly: 'MLS disclaimer.' } };

function mockSpark(property) {
  globalThis.fetch = async url => {
    const path = new URL(url).pathname;
    if (path.includes('/Reso/OData/')) return Response.json({
      value: [property], '@odata.count': 1
    });
    if (path === '/v1/system') return Response.json({
      D: { Success: true, Results: [{ DisplayCompliance: rule }] }
    });
    return Response.json({ D: { Success: true, Results: [{
      Id: property.ListingKey,
      DisplayCompliance: { IDXLogo: { Type: 'Text', LogoUri: 'IDX' } },
      StandardFields: {
        MlsId: 'mls', ListingUpdateTimestamp: property.ModificationTimestamp,
        ListOfficeName: property.ListOfficeName
      }
    }] } });
  };
}
const env = {
  SPARK_ACCESS_TOKEN: 'long-photo-regression-test',
  ALLOWED_ORIGINS: 'https://hannahkeownhomes.com',
  SEARCH_LIMITER: { limit: async () => ({ success: true }) }
};
const request = path => new Request('https://idx.example.com' + path, {
  headers: { Origin: 'https://hannahkeownhomes.com' }
});

test('350 and longer public MediaURLs survive Worker search and detail JSON intact', async () => {
  for (const length of [350, 351, 700, 1500]) {
    const urls = [photoUrl(length), photoUrl(length + 1)];
    const property = { ...listing, Media: urls.map((url, i) => ({
      MediaCategory: 'Photo', Permission: ['Public'],
      MediaURL: url, ShortDescription: 'Photo ' + (i + 1)
    })) };
    assert.equal(safeUrl(urls[0]), urls[0]);
    assert.deepEqual(normalize(property, true).photos.map(p => p.url), urls);
    assert.deepEqual(normalize(property, false).photos.map(p => p.url), [urls[0]]);
    mockSpark(property);
    const search = await worker.fetch(request('/api/properties'), env);
    assert.equal(search.status, 200);
    assert.deepEqual((await search.json()).listings[0].photos.map(p => p.url), [urls[0]]);
    const detail = await worker.fetch(request('/api/properties/property-123'), env);
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).listing.photos.map(p => p.url), urls);
  }
});

function element(tag = 'div') {
  return {
    tag, textContent: '', children: [], attributes: {}, listeners: {},
    hidden: false, disabled: false, value: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    get childElementCount() { return this.children.filter(x => x && typeof x === 'object').length; }
  };
}
function descendants(root, predicate) {
  const found = [];
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    if (predicate(item)) found.push(item);
    for (const child of item.children || []) walk(child);
  }
  walk(root);
  return found;
}

async function render(page, payload) {
  const ids = Object.fromEntries([
    'propertySearch', 'searchResults', 'searchStatus', 'pagination',
    'addressSearchField', 'idxNotices', 'previousPage', 'nextPage',
    'pageLabel', 'propertyStatus', 'propertyDetails', 'backToSearch',
    'property-title'
  ].map(id => [id, element()]));
  const form = ids.propertySearch;
  form.elements = {
    address: element('input'), minPrice: element('input'),
    maxPrice: element('input')
  };
  for (const [name, field] of Object.entries(form.elements)) field.name = name;
  form.elements[Symbol.iterator] = function* () {
    yield this.address; yield this.minPrice; yield this.maxPrice;
  };
  const submit = element('button'), reset = element('button');
  form.querySelector = selector => selector.includes('submit') ? submit : reset;
  form.reset = () => {};
  const canonical = element('link');
  const document = {
    body: { dataset: { idxPage: page } },
    title: '',
    createElement: element,
    getElementById: id => ids[id],
    querySelector: () => canonical
  };
  const location = new URL('https://hannahkeownhomes.com/' +
    (page === 'search' ? 'search.html' : 'property.html?id=property-123'));
  let calls = 0;
  const sandbox = {
    document, location, window: {
      HKH_IDX_API: 'https://idx.example.com',
      addEventListener() {}
    },
    history: { pushState() {}, replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    URL, URLSearchParams, AbortController, Intl, FormData, setTimeout,
    fetch: async () => {
      calls++;
      return { ok: true, json: async () => payload };
    }
  };
  runInNewContext(frontend, sandbox, { timeout: 3000 });
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
    if (calls && (page === 'search'
      ? ids.searchResults.attributes['aria-busy'] === 'false'
      : ids.propertyStatus.hidden === true)) break;
  }
  assert.equal(calls, 1, 'frontend fetched its mock IDX response');
  return ids;
}

test('search card image src retains a long photo URL', async () => {
  for (const length of [350, 351, 700, 1500]) {
    const url = photoUrl(length);
    const p = normalize({ ...listing, Media: [{
      MediaCategory: 'Photo', Permission: ['Public'], MediaURL: url
    }] });
    const ids = await render('search', {
      listings: [{ ...p, broker: 'Example Broker', idxLogo: { text: 'IDX' } }],
      page: 1, total: 1, hasNext: false, supportsAddressSearch: true
    });
    const imgs = descendants(ids.searchResults, el => el.tag === 'img');
    assert.equal(imgs.length, 1);
    assert.equal(imgs[0].src, url);
    assert.ok(!descendants(ids.searchResults, el => el.textContent === 'Photo unavailable').length);
  }
});

test('gallery main image, thumbnails and next-photo control preserve long URLs', async () => {
  const urls = [photoUrl(350), photoUrl(351), photoUrl(700), photoUrl(1500)];
  const p = normalize({ ...listing, Media: urls.map((url, i) => ({
    MediaCategory: 'Photo', Permission: ['Public'], MediaURL: url,
    ShortDescription: 'Photo ' + (i + 1)
  })) }, true);
  const ids = await render('property', {
    listing: { ...p, broker: 'Example Broker', idxLogo: { text: 'IDX' } }
  });
  const gallery = descendants(ids.propertyDetails, el => el.className === 'idx-gallery')[0];
  assert.ok(gallery, 'property gallery was rendered');
  const thumbs = descendants(gallery, el => el.className === 'idx-thumbs')[0];
  assert.deepEqual(descendants(thumbs, el => el.tag === 'img').map(el => el.src), urls);
  const frame = gallery.children[0];
  assert.equal(frame.children[0].src, urls[0]);
  const next = descendants(gallery, el => el.tag === 'button' && el.textContent === 'Next photo')[0];
  for (let i = 1; i < urls.length; i++) {
    next.listeners.click();
    assert.equal(frame.children[0].src, urls[i]);
  }
});
