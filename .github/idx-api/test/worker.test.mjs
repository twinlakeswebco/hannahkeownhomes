import { test,afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker,{ searchQuery,normalize,attachCompliance,safeUrl } from '../src/worker.mjs';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const listing={ListingKey:'property-123',ListingId:'12345',StandardStatus:'Active',StateOrProvince:'KY',InternetEntireListingDisplayYN:true,InternetAddressDisplayYN:true,UnparsedAddress:'123 Main St',City:'Elizabethtown',PostalCode:'42701',ListPrice:300000,PropertyType:'Residential',BedroomsTotal:3,BathroomsTotalDecimal:2,LivingArea:1400,LotSizeAcres:.25,ModificationTimestamp:'2026-10-05T12:00:00Z',ListOfficeName:'Example Broker',ListAgentFullName:'Example Agent',OriginatingSystemKey:'mls',PublicRemarks:'Public description',PrivateRemarks:'NEVER DISPLAY',ListAgentEmail:'private@example.com',Media:[{MediaCategory:'Photo',Permission:['Public'],MediaURL:'https://photos.example.com/public.jpg'},{MediaCategory:'Photo',Permission:['Private'],MediaURL:'https://photos.example.com/private.jpg'},{MediaCategory:'Document',Permission:['Public'],MediaURL:'https://photos.example.com/document.pdf'}]};
const rule={mls:{View:{Summary:{DisplayCompliance:['ListingUpdateTimestamp']},Detail:{DisplayCompliance:['ListingUpdateTimestamp','ListOfficeName']}},DisclaimerTextOnly:'MLS disclaimer.'}};
const display={mlsId:'mls',IDXLogo:{Type:'Text',LogoUri:'IDX'}};
test('search limits data to public active Kentucky listings',()=>{const {query}=searchQuery(new URLSearchParams());assert.match(query.get('$filter'),/StandardStatus eq 'Active'/);assert.match(query.get('$filter'),/InternetEntireListingDisplayYN eq true/);assert.match(query.get('$filter'),/StateOrProvince eq 'KY'/);assert.equal(query.get('$top'),'20');});
test('ZIP searches do not infer the location of address-hidden listings',()=>{assert.match(searchQuery(new URLSearchParams({zip:'42701'})).query.get('$filter'),/InternetAddressDisplayYN eq true/);});
test('address search combines case-insensitive partial matching with public address permissions and existing filters',()=>{
  const {query,page}=searchQuery(new URLSearchParams({address:'  123 mAiN  ',city:'Elizabethtown',zip:'42701',maxPrice:'350000',page:'2'}));
  const filter=query.get('$filter');
  assert.ok(filter.includes("contains(toupper(UnparsedAddress),'123 MAIN')"));
  assert.ok(filter.includes('InternetAddressDisplayYN eq true'));
  assert.ok(filter.includes("City eq 'Elizabethtown'"));
  assert.ok(filter.includes("PostalCode eq '42701'"));
  assert.ok(filter.includes('ListPrice le 350000'));
  assert.equal(query.get('$skip'),'20');assert.equal(page,2);
});
test('blank addresses do not narrow a normal search',()=>{
  assert.equal(searchQuery(new URLSearchParams({address:'  '})).query.get('$filter'),searchQuery(new URLSearchParams()).query.get('$filter'));
});
test('address literals escape quotes and reject excessive length, control characters, duplicates, and raw filters',()=>{
  const address="123 O'Brien') or true or ('";
  assert.ok(searchQuery(new URLSearchParams({address})).query.get('$filter').includes("contains(toupper(UnparsedAddress),'123 O''BRIEN'') OR TRUE OR (''')"));
  for(const address of ['x'.repeat(161),'123 Main\nSt','123 Main\u0000'])assert.throws(()=>searchQuery(new URLSearchParams({address})),/Invalid address/);
  assert.throws(()=>searchQuery(new URLSearchParams('address=A&address=B')),/Unsupported search parameter/);
  assert.throws(()=>searchQuery(new URLSearchParams({address:'123 Main','$filter':'true'})),/Unsupported search parameter/);
});
test('OData literals escape apostrophes and do not accept raw filter parameters',()=>{const {query}=searchQuery(new URLSearchParams({city:"O'Fallon' or true"}));assert.match(query.get('$filter'),/City eq 'O''Fallon'' or true'/);assert.throws(()=>searchQuery(new URLSearchParams({'$filter':'true'})));});
test('rejects invalid prices, pagination, duplicate parameters, and listing IDs',()=>{for(const params of [{minPrice:'-1'},{minPrice:'100',maxPrice:'90'},{page:'0'},{page:'1.5'},{page:'501'},{beds:'1.5'},{sort:'toString'},{zip:'123'},{type:'Office'}])assert.throws(()=>searchQuery(new URLSearchParams(params)));assert.throws(()=>searchQuery(new URLSearchParams('city=A&city=B')));assert.throws(()=>searchQuery(new URLSearchParams(),"x')/Media"));});
test('normalization excludes private fields and private media',()=>{const p=normalize(listing,true);assert.equal(p.photos.length,1);const json=JSON.stringify(p);assert.ok(!json.includes('NEVER DISPLAY'));assert.ok(!json.includes('private@example.com'));assert.ok(!json.includes('private.jpg'));assert.ok(!json.includes('document.pdf'));});
test('address opt-out removes address, postcode, remarks, captions, and tour',()=>{const p=normalize({...listing,InternetAddressDisplayYN:false,VirtualTourURLUnbranded:'https://example.com/123-main'},true);assert.equal(p.address,'Address withheld');assert.equal(p.zip,'');assert.equal(p.description,'');assert.equal(p.virtualTour,null);assert.equal(p.photos[0].caption,'');assert.ok(!JSON.stringify(p).includes('123 Main'));});
test('unknown address permission fails closed',()=>{assert.equal(normalize({...listing,InternetAddressDisplayYN:null}).address,'Address withheld');});
test('closed, non-public, and out-of-state listings cannot be returned',()=>{for(const change of [{StandardStatus:'Closed'},{InternetEntireListingDisplayYN:false},{InternetEntireListingDisplayYN:null},{StateOrProvince:'IN'}])assert.equal(normalize({...listing,...change}),null);});
test('field permissions are enforced even if a value is present',()=>{const p=normalize({...listing,'BedroomsTotal@Core.Permissions':'None'},true);assert.equal(p.beds,null);});
test('only safe HTTPS media and tour URLs are permitted',()=>{for(const value of ['javascript:alert(1)','http://example.com/','https://user:password@example.com/','data:text/html,x'])assert.equal(safeUrl(value),null);});
test('compliance errors fail closed instead of silently omitting attribution',()=>{assert.throws(()=>attachCompliance(listing,normalize(listing),null,rule,false));assert.throws(()=>attachCompliance(listing,normalize(listing),display,{},false));const unknown={mls:{...rule.mls,View:{Summary:{DisplayCompliance:['UnknownRequirement']}}}};assert.throws(()=>attachCompliance(listing,normalize(listing),display,unknown,false));assert.equal(attachCompliance(listing,normalize(listing),display,rule,false).disclaimer,'MLS disclaimer.');});
const env={SPARK_ACCESS_TOKEN:'test-secret-not-real',ALLOWED_ORIGINS:'https://hannahkeownhomes.com',SEARCH_LIMITER:{limit:async()=>({success:true})}};
const request=(path,init={})=>new Request('https://idx.example.com'+path,{headers:{Origin:'https://hannahkeownhomes.com'},...init});
test('address request reaches the MLS and returns existing attribution with capability flag',async()=>{
  let resoUrl;
  globalThis.fetch=async url=>{
    const parsed=new URL(url);
    if(parsed.pathname.includes('/Reso/OData/')){
      resoUrl=parsed;
      return Response.json({value:[listing],'@odata.count':1});
    }
    if(parsed.pathname==='/v1/system')return Response.json({D:{Success:true,Results:[{DisplayCompliance:rule}]}});
    return Response.json({D:{Success:true,Results:[{Id:listing.ListingKey,DisplayCompliance:display,StandardFields:{MlsId:'mls',ListingUpdateTimestamp:listing.ModificationTimestamp,ListOfficeName:listing.ListOfficeName}}]}});
  };
  const response=await worker.fetch(request('/api/properties?address=123%20main&city=Elizabethtown'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.supportsAddressSearch,true);assert.equal(body.total,1);
  assert.equal(body.listings[0].address,'123 Main St');assert.equal(body.listings[0].broker,'Example Broker');
  assert.equal(body.listings[0].disclaimer,'MLS disclaimer.');
  assert.ok(resoUrl.searchParams.get('$filter').includes("contains(toupper(UnparsedAddress),'123 MAIN')"));
  assert.ok(resoUrl.searchParams.get('$filter').includes('InternetAddressDisplayYN eq true'));
});
test('no matching address returns an empty result with capability flag',async()=>{
  globalThis.fetch=async url=>new URL(url).pathname.includes('/Reso/OData/')?Response.json({value:[],'@odata.count':0}):Response.json({D:{Success:true,Results:[{DisplayCompliance:rule}]}});
  const response=await worker.fetch(request('/api/properties?address=no-such-street'),env);
  assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.listings,[]);assert.equal(body.total,0);assert.equal(body.hasNext,false);assert.equal(body.supportsAddressSearch,true);
});
test('CORS rejects other origins',async()=>{const r=await worker.fetch(request('/api/properties',{headers:{Origin:'https://evil.example'}}),env);assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);});
test('preflight works; writes and unknown routes are rejected',async()=>{assert.equal((await worker.fetch(request('/api/properties',{method:'OPTIONS'}),env)).status,204);assert.equal((await worker.fetch(request('/api/properties',{method:'POST'}),env)).status,405);assert.equal((await worker.fetch(request('/api/anything'),env)).status,404);});
test('requires private token and rate limiter',async()=>{assert.equal((await worker.fetch(request('/api/properties'),{...env,SPARK_ACCESS_TOKEN:''})).status,503);assert.equal((await worker.fetch(request('/api/properties'),{...env,SEARCH_LIMITER:null})).status,503);});
test('throttles requests with an explicit retry time',async()=>{const r=await worker.fetch(request('/api/properties'),{...env,SEARCH_LIMITER:{limit:async()=>({success:false})}});assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');});
test('upstream failures cannot leak credentials or upstream bodies',async()=>{globalThis.fetch=async()=>new Response(JSON.stringify({secret:env.SPARK_ACCESS_TOKEN}),{status:500});const r=await worker.fetch(request('/api/properties'),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes(env.SPARK_ACCESS_TOKEN));assert.equal(r.headers.get('Cache-Control'),'no-store');});
test('timeouts remain errors, not empty successful searches',async()=>{globalThis.fetch=async()=>{throw new DOMException('contains private upstream details','TimeoutError');};const r=await worker.fetch(request('/api/properties'),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private upstream'));});
test('diagnostics report upstream status without upstream payloads',async()=>{
  for(const [status,code] of [[401,'SPARK_ACCESS_DENIED'],[403,'SPARK_ACCESS_DENIED'],[400,'SPARK_QUERY_REJECTED'],[429,'SPARK_RATE_LIMITED'],[500,'SPARK_UPSTREAM_FAILED']]){
    globalThis.fetch=async()=>new Response(JSON.stringify({secret:env.SPARK_ACCESS_TOKEN}),{status});
    const response=await worker.fetch(request('/api/properties'),env);
    const body=await response.json();
    assert.equal(body.code,code);assert.equal(body.upstreamStatus,status);
    assert.equal(body.stage,'reso-properties');assert.ok(!JSON.stringify(body).includes(env.SPARK_ACCESS_TOKEN));
  }
});
test('fetch exceptions are classified without revealing error text',async()=>{
  for(const [error,code] of [[new DOMException('private details','TimeoutError'),'SPARK_TIMEOUT'],[new TypeError('Unsupported cache mode: no-store'),'WORKER_CACHE_UNSUPPORTED'],[new Error('private token test-secret-not-real'),'SPARK_FETCH_FAILED']]){
    globalThis.fetch=async()=>{throw error;};
    const body=await (await worker.fetch(request('/api/properties'),env)).json();
    assert.equal(body.code,code);assert.ok(!JSON.stringify(body).includes('private'));assert.ok(!JSON.stringify(body).includes(env.SPARK_ACCESS_TOKEN));
  }
});
test('invalid JSON is classified without exposing response content',async()=>{
  globalThis.fetch=async()=>new Response('private body');
  const body=await (await worker.fetch(request('/api/properties'),env)).json();
  assert.equal(body.code,'SPARK_INVALID_JSON');assert.ok(!JSON.stringify(body).includes('private body'));
});
test('runtime errors cannot expose internal exception messages',async()=>{
  const body=await (await worker.fetch(request('/api/properties'),{...env,SEARCH_LIMITER:{limit:async()=>{throw new Error(env.SPARK_ACCESS_TOKEN);}}})).json();
  assert.equal(body.code,'WORKER_RUNTIME_ERROR');assert.ok(!JSON.stringify(body).includes(env.SPARK_ACCESS_TOKEN));
});
test('accidental secret whitespace is removed before authentication',async()=>{
  globalThis.fetch=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+env.SPARK_ACCESS_TOKEN);return new Response('{}',{status:401});};
  await worker.fetch(request('/api/properties'),{...env,SPARK_ACCESS_TOKEN:'  '+env.SPARK_ACCESS_TOKEN+'\n'});
});
test('upstream requests use Workers-compatible manual redirect handling',async()=>{
  globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});};
  const response=await worker.fetch(request('/api/properties'),env);
  const body=await response.json();assert.equal(response.status,502);assert.equal(body.upstreamStatus,302);
});
