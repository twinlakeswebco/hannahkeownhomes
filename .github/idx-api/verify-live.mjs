import assert from 'node:assert/strict';

const base = 'https://hannah-keown-idx.old-butterfly-bc58.workers.dev';
async function get(params, expectedStatus = 200) {
  const response = await fetch(`${base}/api/properties?${new URLSearchParams(params)}`, {
    headers: { Origin: 'https://hannahkeownhomes.com', Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  assert.equal(response.status, expectedStatus, `Unexpected status for ${JSON.stringify(params)}`);
  const body = await response.json();
  if (expectedStatus === 200) {
    assert.equal(body.supportsAddressSearch, true, 'Deploy the address-search Worker before running live verification.');
    assert.ok(Array.isArray(body.listings));
  }
  return body;
}

const initial = await get({});
const property = initial.listings.find(p => p.addressAllowed && p.address && p.city);
assert.ok(property, 'No public-address listing available for verification.');
const full = await get({ address: property.address.toLowerCase() });
assert.ok(full.listings.some(p => p.key === property.key), 'Full address did not find the reference listing.');
assert.ok(full.listings.every(p => p.addressAllowed && p.address.toLowerCase().includes(property.address.toLowerCase())));

const partialAddress = property.address.split(',')[0].trim();
const partial = await get({ address: partialAddress.toUpperCase(), city: property.city });
assert.ok(partial.listings.some(p => p.key === property.key), 'Partial address and city did not find the reference listing.');
assert.ok(partial.listings.every(p => p.addressAllowed && p.address.toUpperCase().includes(partialAddress.toUpperCase()) && p.city === property.city));

const empty = await get({ address: `nonexistent-street-${Date.now()}` });
assert.equal(empty.total, 0);assert.deepEqual(empty.listings, []);assert.equal(empty.hasNext, false);
assert.ok((await get({ address: 'x'.repeat(161) }, 400)).error);
console.log('PASS: address capability, full/partial case-insensitive matches, combined city filter, no matches, and validation.');
