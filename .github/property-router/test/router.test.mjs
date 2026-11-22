import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propertyKey, propertyPage } from '../src/router.mjs';

test('address-based routes resolve a stable Spark key without requiring a lookup table', () => {
  assert.equal(propertyKey('/properties/123-main-st-leitchfield-ky-42754--id-property-123/'), 'property-123');
  assert.equal(propertyKey('/properties/listing--id-ABC_123/'), 'ABC_123');
  assert.equal(propertyKey('/properties/another-address--id-property-123/'), 'property-123');
});
test('invalid and unrelated paths are not treated as property routes', () => {
  for (const path of ['/properties/', '/property.html', '/properties/123-main-st/',
    '/properties/Some-Address--id-123/', '/properties/listing--id-abc%2Fdef/']) {
    assert.equal(propertyKey(path), null, path);
  }
});
test('property paths return the existing HTML with HTTP 200 and correct content type', async () => {
  const url = 'https://hannahkeownhomes.com/properties/123-main-st--id-property-123/?search=city%3DLeitchfield';
  const response = propertyPage(new Request(url), '<html>IDX detail</html>');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.equal(await response.text(), '<html>IDX detail</html>');
  const head = propertyPage(new Request(url, { method: 'HEAD' }), '<html>IDX detail</html>');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('rejects unsupported methods and malformed property paths', () => {
  const path = 'https://hannahkeownhomes.com/properties/listing--id-ABC_123/';
  assert.equal(propertyPage(new Request(path, { method: 'POST' }), 'x').status, 405);
  assert.equal(propertyPage(new Request('https://hannahkeownhomes.com/properties/no-id/'), 'x').status, 404);
});
