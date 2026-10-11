# Hannah Keown IDX Worker

Source recovered from the October 8 diagnostic package, including its Workers-compatible redirect handling. Kept under `.github` so GitHub Pages does not publish the backend files.

## Address search

`GET /api/properties?address=123%20Main&city=Leitchfield` searches all or part of `UnparsedAddress`, ignoring case, together with the existing filters. Use street abbreviations as listed in the MLS or omit the suffix. This is a RESO OData search; it does not use Spark v1's `StreetAddress` parameter. Apostrophes are escaped as OData literals. Duplicate parameters, control characters, and addresses longer than 160 characters are rejected. Address searches require `InternetAddressDisplayYN eq true` in addition to the existing public, active, Kentucky restrictions.

Search responses include `supportsAddressSearch: true`. The frontend enables the address field only after this flag is received from the deployed Worker. URL history, pagination, detail-page return links, and Reset filters retain the existing behavior.

## Deploy to the existing Worker

From the repository root:

```sh
cd .github/idx-api
npm test
npx wrangler@4 login
npm run deploy
```

Deploy to the Cloudflare account that owns `hannah-keown-idx.old-butterfly-bc58.workers.dev`. The existing `SPARK_ACCESS_TOKEN` secret is retained; no credentials are stored in this repository. Do not deploy to a different account or replace the secret as part of this change.

## Verify after deployment

```sh
node verify-live.mjs
```

This checks a real address from the feed, a partial address combined with its city, a nonexistent address, and the capability flag. It also confirms invalid input still returns an error. Failures, timeouts, and non-JSON responses fail the verification rather than being treated as empty results.
