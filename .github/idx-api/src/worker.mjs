const RESO = 'https://replication.sparkapi.com/Version/3/Reso/OData/';
const SPARK = 'https://replication.sparkapi.com/v1/';
const PAGE_SIZE = 20;
const TYPES = ['Residential', 'Land', 'Residential Income', 'Residential Lease'];
const SORTS = { newest: 'ModificationTimestamp desc,ListingKey asc', priceAsc: 'ListPrice asc,ListingKey asc', priceDesc: 'ListPrice desc,ListingKey asc' };
const SUMMARY = ['ListingKey','ListingId','StandardStatus','InternetEntireListingDisplayYN','InternetAddressDisplayYN','UnparsedAddress','City','CountyOrParish','StateOrProvince','PostalCode','ListPrice','PropertyType','PropertySubType','BedroomsTotal','BathroomsTotalDecimal','LivingArea','LotSizeAcres','ListOfficeName','ListAgentFullName','AttributionContact','ModificationTimestamp','OriginatingSystemKey','OriginatingSystemID','SourceSystemKey','Disclaimer','CopyrightNotice'];
const DETAIL = [...SUMMARY, 'PublicRemarks','YearBuilt','GarageSpaces','Basement','Heating','Cooling','ParkingFeatures','WaterfrontYN','WaterfrontFeatures','AssociationFee','SubdivisionName','LotFeatures','ConstructionMaterials','Roof','WaterSource','Sewer','VirtualTourURLUnbranded'];
class ApiError extends Error { constructor(status, message, diagnostics = {}) { super(message); this.status = status; Object.assign(this, diagnostics); } }
const quote = value => "'" + value.replaceAll("'", "''") + "'";
function textParam(params, name, max = 80) {
  const value = (params.get(name) || '').trim();
  if (value.length > max || /[\u0000-\u001f]/.test(value)) throw new ApiError(400, `Invalid ${name}.`);
  return value;
}
function numberParam(params, name, max, integer = false) {
  const value = params.get(name);
  if (value === null || value === '') return null;
  if (!/^\d+(\.\d+)?$/.test(value)) throw new ApiError(400, `Invalid ${name}.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) throw new ApiError(400, `Invalid ${name}.`);
  return number;
}
export function searchQuery(params, key) {
  const allowed = new Set(['address','city','county','zip','minPrice','maxPrice','beds','baths','type','sort','page']);
  for (const name of params.keys()) if (!allowed.has(name) || params.getAll(name).length !== 1) throw new ApiError(400, 'Unsupported search parameter.');
  const filters = ["StandardStatus eq 'Active'", 'InternetEntireListingDisplayYN eq true', "StateOrProvince eq 'KY'"];
  const address = textParam(params, 'address', 160);
  if (address) filters.push(`contains(toupper(UnparsedAddress),${quote(address.toUpperCase())})`, 'InternetAddressDisplayYN eq true');
  for (const [name, field] of [['city','City'],['county','CountyOrParish']]) {
    const value = textParam(params, name); if (value) filters.push(`${field} eq ${quote(value)}`);
  }
  const zip = textParam(params, 'zip', 5);
  if (zip && !/^\d{5}$/.test(zip)) throw new ApiError(400, 'Enter a five-digit ZIP code.');
  if (zip) filters.push(`PostalCode eq ${quote(zip)}`, 'InternetAddressDisplayYN eq true');
  const type = textParam(params, 'type', 30);
  if (type && !TYPES.includes(type)) throw new ApiError(400, 'Invalid property type.');
  if (type) filters.push(`PropertyType eq ${quote(type)}`);
  const min = numberParam(params, 'minPrice', 1000000000);
  const max = numberParam(params, 'maxPrice', 1000000000);
  if (min !== null && max !== null && min > max) throw new ApiError(400, 'Minimum price must not exceed maximum price.');
  if (min !== null) filters.push(`ListPrice ge ${min}`);
  if (max !== null) filters.push(`ListPrice le ${max}`);
  for (const [name, field] of [['beds','BedroomsTotal'],['baths','BathroomsTotalDecimal']]) {
    const number = numberParam(params, name, 20, name === 'beds');
    if (number !== null && number > 0) filters.push(`${field} ge ${number}`);
  }
  const sort = textParam(params, 'sort', 15) || 'newest';
  if (!Object.hasOwn(SORTS,sort)) throw new ApiError(400, 'Invalid sort order.');
  const page = numberParam(params, 'page', 500, true) ?? 1;
  if (page < 1) throw new ApiError(400, 'Invalid page.');
  if (key) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) throw new ApiError(400, 'Invalid listing.');
    filters.push(`ListingKey eq ${quote(key)}`);
  }
  const query = new URLSearchParams({ '$filter': filters.join(' and '), '$top': key ? '1' : String(PAGE_SIZE), '$select': (key ? DETAIL : SUMMARY).join(','), '$expand': key ? 'Media($top=200;$orderby=Order asc)' : 'Media($top=1;$orderby=Order asc)', '$orderby': SORTS[sort] });
  if (!key) { query.set('$count','true'); query.set('$skip', String((page - 1) * PAGE_SIZE)); }
  return { query, page };
}
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const readable = (property, name) => property[`${name}@Core.Permissions`] !== 'None' ? property[name] : undefined;
const string = value => typeof value === 'string' ? value : '';
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function normalize(property, detail = false) {
  if (property.StandardStatus !== 'Active' || property.InternetEntireListingDisplayYN !== true || property.StateOrProvince !== 'KY') return null;
  const addressAllowed = property.InternetAddressDisplayYN === true;
  const result = {
    key: string(property.ListingKey), mlsNumber: string(property.ListingId), status: 'Active', addressAllowed,
    address: addressAllowed ? string(property.UnparsedAddress) : 'Address withheld',
    city: string(property.City), county: string(property.CountyOrParish), state: 'KY', zip: addressAllowed ? string(property.PostalCode) : '',
    price: numeric(property.ListPrice), type: string(property.PropertyType), subtype: string(property.PropertySubType),
    beds: numeric(readable(property,'BedroomsTotal')), baths: numeric(readable(property,'BathroomsTotalDecimal')),
    sqft: numeric(readable(property,'LivingArea')), acres: numeric(readable(property,'LotSizeAcres')),
    broker: string(readable(property,'ListOfficeName')), agent: string(readable(property,'ListAgentFullName')),
    attribution: string(readable(property,'AttributionContact')), updatedAt: string(property.ModificationTimestamp),
    photos: (Array.isArray(property.Media) ? property.Media : []).filter(m => m.MediaCategory === 'Photo' && Array.isArray(m.Permission) && m.Permission.includes('Public') && safeUrl(m.MediaURL)).map(m => ({ url: safeUrl(m.MediaURL), caption: addressAllowed ? string(m.ShortDescription) : '' })).slice(0, detail ? 200 : 1)
  };
  if (detail) {
    result.description = addressAllowed ? string(readable(property,'PublicRemarks')) : '';
    result.yearBuilt = numeric(readable(property,'YearBuilt'));
    result.garageSpaces = numeric(readable(property,'GarageSpaces'));
    result.associationFee = numeric(readable(property,'AssociationFee'));
    result.subdivision = addressAllowed ? string(readable(property,'SubdivisionName')) : '';
    result.features = {};
    for (const name of ['Basement','Heating','Cooling','ParkingFeatures','WaterfrontFeatures','LotFeatures','ConstructionMaterials','Roof','WaterSource','Sewer']) {
      const value = readable(property,name);
      if (Array.isArray(value)) result.features[name] = value.filter(v=> typeof v === 'string');
      else if (typeof value === 'string' && value) result.features[name] = [value];
    }
    result.virtualTour = addressAllowed ? safeUrl(readable(property,'VirtualTourURLUnbranded')) : null;
  }
  return result;
}
async function upstream(url, token) {
  const path = new URL(url).pathname;
  const stage = path.includes('/Reso/OData/') ? 'reso-properties' : path === '/v1/system' ? 'spark-system' : 'spark-attribution';
  const message = 'Listings are temporarily unavailable. Please contact Hannah.';
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${String(token).trim()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'manual', cache: 'no-store' });
  } catch (error) {
    const code = ['TimeoutError','AbortError'].includes(error?.name) ? 'SPARK_TIMEOUT' : String(error?.message).startsWith('Unsupported cache mode:') ? 'WORKER_CACHE_UNSUPPORTED' : 'SPARK_FETCH_FAILED';
    throw new ApiError(502, message, { code, stage });
  }
  if (!response.ok) {
    const code = [401,403].includes(response.status) ? 'SPARK_ACCESS_DENIED' : response.status === 400 ? 'SPARK_QUERY_REJECTED' : response.status === 429 ? 'SPARK_RATE_LIMITED' : 'SPARK_UPSTREAM_FAILED';
    throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Property search is busy. Please try again shortly.' : message, { code, stage, upstreamStatus: response.status });
  }
  try { return await response.json(); }
  catch { throw new ApiError(502, message, { code: 'SPARK_INVALID_JSON', stage }); }
}
let metadataCache;
async function complianceMetadata(token) {
  if (metadataCache?.token === token && metadataCache.expires > Date.now()) return metadataCache.rules;
  const data = await upstream(`${SPARK}system`, token);
  if (data.D?.Success !== true) throw new ApiError(502,'Listing display requirements are temporarily unavailable.');
  const rules = Object.assign({}, ...(data.D.Results || []).map(p => p.DisplayCompliance || {}));
  if (!Object.keys(rules).length) throw new ApiError(502,'Listing display requirements are temporarily unavailable.');
  metadataCache = { token, expires: Date.now() + 600000, rules };
  return rules;
}
export function attachCompliance(property, normalized, display, rules, detail) {
  const rule = rules[display?.mlsId];
  if (!rule || !display) throw new ApiError(502,'Listing display requirements are temporarily unavailable.');
  const required = rule.View?.[detail ? 'Detail' : 'Summary']?.DisplayCompliance;
  if (!Array.isArray(required) || required.some(f => !['IDXLogo','IDXLogoSmall','ListingUpdateTimestamp','ListOfficeName'].includes(f))) throw new ApiError(502,'Listing display requirements need review.');
  const logo = detail ? display.IDXLogo || display.IDXLogoSmall : display.IDXLogoSmall || display.IDXLogo;
  normalized.updatedAt = string(display.listingUpdatedAt) || normalized.updatedAt;
  normalized.broker = string(display.broker) || normalized.broker;
  normalized.idxLogo = logo?.Type === 'Text' ? { text: string(logo.LogoUri) } : logo?.Type === 'Uri' && safeUrl(logo.LogoUri) ? { url: safeUrl(logo.LogoUri) } : null;
  // Louisville requires marking other-broker listings even when IDXLogo is not listed in Summary.
  if (!normalized.idxLogo || !normalized.updatedAt || !normalized.broker) throw new ApiError(502,'Listing attribution is temporarily unavailable.');
  normalized.disclaimer = string(rule.DisclaimerTextOnly);
  normalized.copyright = string(readable(property,'CopyrightNotice'));
  if (!normalized.disclaimer) throw new ApiError(502,'Listing display requirements are temporarily unavailable.');
  return normalized;
}
async function properties(params, env, key) {
  const { query, page } = searchQuery(params,key);
  const [data,rules] = await Promise.all([upstream(`${RESO}Property?${query}`, env.SPARK_ACCESS_TOKEN),complianceMetadata(env.SPARK_ACCESS_TOKEN)]);
  if (!Array.isArray(data.value)) throw new ApiError(502,'Listings are temporarily unavailable.');
  const eligible = data.value.map(p => [p,normalize(p,Boolean(key))]).filter(([,p]) => p);
  if (key && !eligible.length) throw new ApiError(404,'This property is no longer available for public display.');
  let displays = {};
  if (eligible.length) {
    const sparkQuery = new URLSearchParams({ _filter: eligible.map(([p]) => `ListingId Eq ${quote(string(p.ListingId))}`).join(' Or '), _limit: '1000', _select: 'ListingUpdateTimestamp,ListOfficeName' });
    const spark = await upstream(key ? `${SPARK}listings/${key}?_select=ListingUpdateTimestamp,ListOfficeName` : `${SPARK}listings?${sparkQuery}`,env.SPARK_ACCESS_TOKEN);
    if (spark.D?.Success !== true) throw new ApiError(502,'Listing attribution is temporarily unavailable.');
    const displayInfo = p => ({ ...p.DisplayCompliance, listingUpdatedAt:p.StandardFields?.ListingUpdateTimestamp, broker:p.StandardFields?.ListOfficeName, mlsId:p.StandardFields?.MlsId });
    displays = Object.fromEntries((spark.D.Results || []).map(p => [p.Id,displayInfo(p)]));
    // MLS numbers can collide across originating MLSs. Resolve any omitted internal ID directly.
    await Promise.all(eligible.filter(([p])=>!displays[p.ListingKey]).map(async ([p])=>{
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(p.ListingKey)) throw new ApiError(502,'Invalid listing data.');
      const item=await upstream(`${SPARK}listings/${p.ListingKey}?_select=ListingUpdateTimestamp,ListOfficeName`,env.SPARK_ACCESS_TOKEN);
      if(item.D?.Success !== true) throw new ApiError(502,'Listing attribution is temporarily unavailable.');
      const found=item.D.Results?.find(i=>i.Id===p.ListingKey);if(found)displays[p.ListingKey]=displayInfo(found);
    }));
  }
  const listings = eligible.map(([p,n]) => attachCompliance(p,n,displays[p.ListingKey],rules,Boolean(key)));
  const fetchedAt = new Date().toISOString();
  if (key) return { listing: listings[0], fetchedAt };
  const total = Number.isSafeInteger(data['@odata.count']) ? data['@odata.count'] : null;
  return { listings, page, pageSize: PAGE_SIZE, total, hasNext: page < 500 && (total !== null ? page * PAGE_SIZE < total : Boolean(data['@odata.nextLink'])), fetchedAt, supportsAddressSearch: true };
}
export default {
  async fetch(request,env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin' };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    function respond(data,status = 200,extra = {}) { return new Response(JSON.stringify(data),{ status,headers:{...headers,...extra} }); }
    if (origin && !allowed.includes(origin)) return respond({ error:'Origin not allowed.' },403);
    if (request.method === 'OPTIONS') return new Response(null,{ status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept','Access-Control-Max-Age':'3600'} });
    if (request.method !== 'GET') return respond({ error:'Method not allowed.' },405,{ Allow:'GET, OPTIONS' });
    if (!env.SPARK_ACCESS_TOKEN || !env.SEARCH_LIMITER) return respond({ error:'Property search is not configured yet. Please contact Hannah.' },503);
    try {
      const { success } = await env.SEARCH_LIMITER.limit({ key:`idx:${request.headers.get('CF-Connecting-IP') || 'unknown'}` });
      if (!success) return respond({ error:'Too many requests. Please try again shortly.' },429,{ 'Retry-After':'60' });
      const url = new URL(request.url);
      if (url.href.length > 1800) throw new ApiError(400,'Search request is too long.');
      const match = url.pathname.match(/^\/api\/properties\/([A-Za-z0-9_-]{1,80})$/);
      if (url.pathname !== '/api/properties' && !match) return respond({ error:'Not found.' },404);
      if (match && url.search) throw new ApiError(400,'Unsupported listing parameter.');
      return respond(await properties(url.searchParams,env,match?.[1]));
    } catch (error) {
      // Never return upstream response bodies, URLs, headers, or credential-bearing errors.
      const known = error instanceof ApiError;
      return respond({ error:known ? error.message : 'Listings are temporarily unavailable. Please contact Hannah.', ...(known && error.code ? { code:error.code, stage:error.stage, ...(error.upstreamStatus ? { upstreamStatus:error.upstreamStatus } : {}) } : !known ? { code:'WORKER_RUNTIME_ERROR' } : {}) },known ? error.status : 502);
    }
  }
};
