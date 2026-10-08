(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  const money = value => value === null ? 'Price unavailable' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const date = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Unavailable' : d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZoneName:undefined}); };
  const specs = p => [p.beds !== null ? `${p.beds} beds` : '',p.baths !== null ? `${p.baths} baths` : '',p.sqft !== null ? `${p.sqft.toLocaleString()} sq ft` : '',p.acres !== null ? `${p.acres.toLocaleString()} acres` : ''].filter(Boolean).join(' · ');
  const locality = p => [p.city,[p.state,p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  function https(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
  async function api(path, signal) {
    const base = https(window.HKH_IDX_API);
    if (!base) throw new Error('Property search is being connected. Call Hannah at 270-589-8376 for current availability.');
    const response = await fetch(base.replace(/\/$/,'') + path,{headers:{Accept:'application/json'},signal,cache:'no-store',credentials:'omit'});
    let data; try { data = await response.json(); } catch { throw new Error('Listings are temporarily unavailable. Please try again or contact Hannah.'); }
    if (!response.ok) throw new Error(data.error || 'Listings are temporarily unavailable.');
    return data;
  }
  function photo(src,alt,cls,lazy = true) {
    const url = https(src);
    if (!url) return node('div','Photo unavailable',`${cls} idx-no-photo`);
    const image = node('img',undefined,cls); image.src = url; image.alt = alt; image.decoding = 'async'; image.loading = lazy ? 'lazy' : 'eager';
    image.addEventListener('error',() => image.replaceWith(node('div','Photo unavailable',`${cls} idx-no-photo`)),{once:true});
    return image;
  }
  function attribution(p) {
    const box = node('div',undefined,'idx-attribution');
    if (p.idxLogo?.url && https(p.idxLogo.url)) box.append(photo(p.idxLogo.url,'IDX','idx-logo'));
    else if (p.idxLogo?.text) box.append(node('p',p.idxLogo.text));
    box.append(node('p',`Listing broker: ${p.broker}`));
    if (p.agent) box.append(node('p',`Listing agent: ${p.agent}`));
    if (p.attribution) box.append(node('p',p.attribution));
    box.append(node('p',`MLS #${p.mlsNumber || p.key} · Updated ${date(p.updatedAt)}`));
    return box;
  }
  function notices(properties,fetchedAt) {
    const box = byId('idxNotices'); box.replaceChildren();
    const texts = new Set(properties.flatMap(p => [p.disclaimer,p.copyright]).filter(Boolean));
    for (const text of texts) box.append(node('p',text));
    box.append(node('p','Information deemed reliable but not guaranteed. Listings shown are active properties available through this MLS feed and may change without notice.'));
    if (fetchedAt) box.append(node('p',`Data retrieved ${date(fetchedAt)}. Equal Housing Opportunity.`));
  }
  function failure(container,error,retry) {
    const box = node('div',undefined,'idx-error');box.setAttribute('role','alert');box.append(node('p',error.message));
    const call = node('a','Call Hannah','btn btn-primary');call.href='tel:2705898376';box.append(call);
    const button = node('button','Try again','btn btn-outline idx-retry');button.type='button';button.addEventListener('click',retry);box.append(button);
    container.replaceChildren(box);
  }
  // Shared navigation behavior is provided by site.js.
  if (document.body.dataset.idxPage === 'search') {
    const form = byId('propertySearch'), grid = byId('searchResults'), status = byId('searchStatus'), pager=byId('pagination');
    let controller, current = new URLSearchParams(location.search), page=1;
    function restore() { form.reset();for(const field of form.elements){if(field.name&&current.has(field.name))field.value=current.get(field.name);} }
    function parameters() { const p=new URLSearchParams();for(const [k,v] of new FormData(form)){const value=String(v).trim();if(value)p.set(k,value);}return p; }
    async function load(params = current, historyMode = '') {
      controller?.abort();controller=new AbortController();const ownController=controller;current=new URLSearchParams(params);page=Number(current.get('page')||1);
      if(historyMode)history[historyMode]({},'',`/search.html${current.size?'?'+current:''}`);
      try { sessionStorage.setItem('hkh-search',current.toString()); } catch {}
      grid.replaceChildren();byId('idxNotices').replaceChildren();grid.setAttribute('aria-busy','true');status.textContent='Loading properties…';pager.hidden=true;
      form.querySelector('button[type="submit"]').disabled=true;
      try {
        const data=await api(`/api/properties${current.size?'?'+current:''}`,ownController.signal);
        if(ownController!==controller)return;
        status.textContent=data.total===null ? `Showing ${data.listings.length} properties` : `${data.total.toLocaleString()} matching ${data.total===1?'property':'properties'}`;
        for(const p of data.listings){
          const card=node('a',undefined,'idx-card reveal visible');card.href=`/property.html?id=${encodeURIComponent(p.key)}&search=${encodeURIComponent(current.toString())}`;
          card.append(photo(p.photos[0]?.url,p.addressAllowed?`${p.address}, ${p.city}`:'Property photo','idx-card-image'));
          const body=node('div',undefined,'idx-card-body');body.append(node('p',money(p.price),'idx-price'),node('h2',p.address),node('p',locality(p),'idx-card-meta'),node('p',specs(p)||p.type,'idx-card-meta'),attribution(p));card.append(body);grid.append(card);
        }
        if(!data.listings.length)grid.append(node('p','No properties matched this search. Adjust your filters or contact Hannah for help finding a property.','idx-empty'));
        byId('previousPage').disabled=data.page<=1;byId('nextPage').disabled=!data.hasNext;byId('pageLabel').textContent=`Page ${data.page}`;pager.hidden=!data.listings.length&&data.page<=1;
        notices(data.listings,data.fetchedAt);
      } catch(error) { if(error.name!=='AbortError'&&ownController===controller){status.textContent='Property search unavailable';failure(grid,error,()=>load());} }
      finally{if(ownController===controller){grid.setAttribute('aria-busy','false');form.querySelector('button[type="submit"]').disabled=false;}}
    }
    form.addEventListener('submit',e=>{e.preventDefault();const min=form.elements.minPrice,max=form.elements.maxPrice;max.setCustomValidity(min.value&&max.value&&Number(min.value)>Number(max.value)?'Maximum price must be at least the minimum price.':'');if(form.reportValidity())load(parameters(),'pushState');});
    form.elements.maxPrice.addEventListener('input',()=>form.elements.maxPrice.setCustomValidity(''));form.elements.minPrice.addEventListener('input',()=>form.elements.maxPrice.setCustomValidity(''));
    form.addEventListener('reset',()=>{form.elements.maxPrice.setCustomValidity('');});
    form.querySelector('button[type="reset"]').addEventListener('click',()=>{setTimeout(()=>load(parameters(),'pushState'),0);});
    for(const [id,direction] of [['previousPage',-1],['nextPage',1]])byId(id).addEventListener('click',()=>{const p=new URLSearchParams(current);p.set('page',String(page+direction));load(p,'pushState');status.scrollIntoView({block:'center'});});
    window.addEventListener('popstate',()=>{current=new URLSearchParams(location.search);restore();load(current);});restore();load();
  } else {
    const params=new URLSearchParams(location.search), id=params.get('id')||'', status=byId('propertyStatus'), details=byId('propertyDetails');
    let back=params.get('search');if(back===null){try{back=sessionStorage.getItem('hkh-search');}catch{}}
    if(back&&back.length<1500)byId('backToSearch').href=`/search.html?${new URLSearchParams(back)}`;
    async function load() {
      details.hidden=true;details.replaceChildren();byId('idxNotices').replaceChildren();status.hidden=false;status.textContent='Loading property details…';
      try {
        if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('Choose a property from the search results to view its details.');
        const data=await api(`/api/properties/${encodeURIComponent(id)}`),p=data.listing;
        document.title=`${p.addressAllowed?p.address:p.city+' property'} | Hannah Keown Homes`;
        const head=node('div',undefined,'idx-detail-head'),heading=node('div');heading.append(node('p',p.type,'section-eyebrow'),node('h1',p.address,'section-title'));heading.lastChild.id='property-title';heading.append(node('p',locality(p),'idx-intro'));head.append(heading,node('p',money(p.price),'idx-price'));details.append(head);
        const layout=node('div',undefined,'idx-detail-grid'),left=node('div'),right=node('aside');layout.append(left,right);details.append(layout);
        const gallery=node('div',undefined,'idx-gallery');left.append(gallery);
        if(p.photos.length){
          let index=0;const frame=node('div'),controls=node('div',undefined,'idx-gallery-controls'),prev=node('button','Previous photo'),next=node('button','Next photo'),counter=node('span'),thumbs=node('div',undefined,'idx-thumbs');counter.setAttribute('aria-live','polite');prev.type=next.type='button';
          function show(i){index=(i+p.photos.length)%p.photos.length;frame.replaceChildren(photo(p.photos[index].url,p.photos[index].caption||`Property photo ${index+1}`,'idx-gallery-image',false));counter.textContent=`${index+1} / ${p.photos.length}`;Array.from(thumbs.children).forEach((b,n)=>b.setAttribute('aria-current',String(n===index)));}
          prev.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));controls.append(prev,counter,next);
          p.photos.forEach((image,i)=>{const b=node('button');b.type='button';b.setAttribute('aria-label',`View photo ${i+1}`);b.append(photo(image.url,'',''));b.addEventListener('click',()=>show(i));thumbs.append(b);});
          if(p.photos.length===1){prev.disabled=true;next.disabled=true;thumbs.hidden=true;}
          gallery.append(frame,controls,thumbs);show(0);
        }else gallery.append(node('div','Property photos are currently unavailable.','idx-gallery-image idx-no-photo'));
        const panel=node('section',undefined,'idx-detail-panel');panel.append(node('h2','Property overview'));const facts=node('dl',undefined,'idx-facts');
        for(const [label,value] of [['Status',p.status],['Property type',p.subtype||p.type],['Bedrooms',p.beds],['Bathrooms',p.baths],['Living area',p.sqft===null?null:`${p.sqft.toLocaleString()} sq ft`],['Lot size',p.acres===null?null:`${p.acres.toLocaleString()} acres`],['Year built',p.yearBuilt],['Garage spaces',p.garageSpaces],['County',p.county],['Subdivision',p.subdivision],['Association fee',p.associationFee===null?null:money(p.associationFee)]]){if(value===null||value===undefined||value==='')continue;const item=node('div');item.append(node('dt',label),node('dd',String(value)));facts.append(item);}panel.append(facts);left.append(panel);
        if(p.description){const about=node('section',undefined,'idx-detail-panel');about.append(node('h2','About this property'),node('p',p.description,'idx-description'));left.append(about);}
        if(Object.keys(p.features).length){const features=node('section',undefined,'idx-detail-panel'),list=node('dl',undefined,'idx-features');features.append(node('h2','Features & amenities'),list);for(const [key,value] of Object.entries(p.features)){if(!value.length)continue;const item=node('div');item.append(node('dt',key.replace(/([a-z])([A-Z])/g,'$1 $2')),node('dd',value.join(', ')));list.append(item);}left.append(features);}
        const contact=node('section',undefined,'idx-contact');contact.append(node('h2','Interested in this property?'),node('p','Ask Hannah a question or arrange a showing.'),node('p','Hannah Keown, REALTOR®'));
        const call=node('a','Call 270-589-8376','btn btn-primary');call.href='tel:2705898376';
        const email=node('a','Request a showing','btn btn-outline');email.href=`mailto:info@hannahkeownhomes.com?subject=${encodeURIComponent('Showing request: MLS #'+p.mlsNumber)}&body=${encodeURIComponent('Hi Hannah, I am interested in this property:\n'+location.href+'\n\nPlease contact me about a showing.\n\nName:\nPhone:\nPreferred date and time:')}`;
        contact.append(call,email,attribution(p));right.append(contact);
        const links=node('div',undefined,'idx-detail-links');
        if(p.virtualTour&&https(p.virtualTour)){const tour=node('a','View virtual tour');tour.href=p.virtualTour;tour.target='_blank';tour.rel='noopener noreferrer';links.append(tour);}
        if(p.addressAllowed&&p.address){const map=node('a','View location');map.href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address+', '+locality(p))}`;map.target='_blank';map.rel='noopener noreferrer';links.append(map);}if(links.childElementCount)left.append(links);
        notices([p],data.fetchedAt);details.hidden=false;status.hidden=true;
      }catch(error){failure(status,error,load);}
    }
    load();
  }
})();
