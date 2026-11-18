import {API,PAGE_SIZE,queryURL,parseResponse,filterStatus,distanceKm,csv,geojson} from './model.mjs';
const $=s=>document.querySelector(s);
const state={mode:'name',query:null,start:1,total:0,items:[],visible:[],selected:null,searchToken:0,detailToken:0};
const cache=new Map(); let searchAbort,detailAbort,map,markers,pointLayer; const markerById=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error);}
function setMode(mode){state.mode=mode;$('#name-fields').hidden=mode!=='name';$('#near-fields').hidden=mode!=='near';$('#filter-note').hidden=mode!=='near';$('#name-mode').setAttribute('aria-pressed',String(mode==='name'));$('#near-mode').setAttribute('aria-pressed',String(mode==='near'));}
function readQuery(){return {mode:state.mode,name:$('#query').value,fuzzy:$('#fuzzy').checked,lat:$('#latitude').value,lon:$('#longitude').value,radius:$('#radius').value,category:$('#category').value,status:$('#status-filter').value};}
async function request(url,signal){
  const hit=cache.get(url);if(hit&&Date.now()-hit.time<300000)return hit.data;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>controller.abort(),18000);
  try{if(signal?.aborted)throw new DOMException('Aborted','AbortError');const r=await fetch(url,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(r.status===429?'The BC service is busy. Please wait a little, then search again.':`The BC service returned HTTP ${r.status}. Please try again.`);
    const data=await r.json();cache.set(url,{data,time:Date.now()});if(cache.size>80)cache.delete(cache.keys().next().value);return data;
  }catch(e){if(signal?.aborted)throw e;if(e.name==='AbortError')throw new Error('The BC service took too long to respond. Please try again.');if(e instanceof TypeError)throw new Error('Could not reach the BC service. Check your connection and try again.');throw e;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
function badge(x){return el('span',x.official?'Official':x.status==='rescinded'?'Rescinded':'Other recorded','badge'+(x.official?'':' recorded'));}
function setPoint(lat,lon){$('#latitude').value=Number(lat).toFixed(5);$('#longitude').value=Number(lon).toFixed(5);setMode('near');if(map){pointLayer.clearLayers();L.circleMarker([lat,lon],{bubblingMouseEvents:false,radius:8,color:'#354b45',weight:2,fillColor:'#fff',fillOpacity:1,dashArray:'3 3'}).addTo(pointLayer);} }
function initMap(){
  if(!window.L){$('#map').append(el('p','The map could not load. You can still search names and read records.'));return;}
  map=L.map('map',{scrollWheelZoom:false}).setView([53.4,-125.8],5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{$('#map-warning').hidden=false;}).addTo(map);
  L.control.scale({imperial:false}).addTo(map); markers=L.featureGroup().addTo(map); pointLayer=L.layerGroup().addTo(map);
  map.on('click',e=>{setPoint(e.latlng.lat,e.latlng.lng);message('Point selected. Choose a radius and press Explore names.');if(innerWidth<681)$('#search').scrollIntoView({behavior:'smooth',block:'start'});});
}
function fit(){if(map&&markers.getLayers().length)map.fitBounds(markers.getBounds(),{padding:[35,35],maxZoom:12});}
function renderResults(){
  const box=$('#results');box.replaceChildren();markerById.clear();markers?.clearLayers();
  for(const x of state.visible){const b=el('button',undefined,'result');b.type='button';b.dataset.id=x.id;b.setAttribute('aria-pressed',String(state.selected===x.id));b.append(el('strong',x.name));
    const meta=el('span',undefined,'meta'),type=el('span',x.type);if(state.query?.mode==='near'&&x.coords)type.append(el('span',` · ${distanceKm([Number(state.query.lon),Number(state.query.lat)],x.coords).toFixed(1)} km`));meta.append(type,badge(x));b.append(meta);b.addEventListener('click',()=>select(x.id));box.append(b);
    if(map&&x.coords){const tooltip=el('span',x.name);const marker=L.circleMarker([x.coords[1],x.coords[0]],{bubblingMouseEvents:false,radius:7,color:'#fff',weight:2,fillColor:x.official?'#22674f':'#b26c3f',fillOpacity:1}).bindTooltip(tooltip).on('click',()=>select(x.id)).addTo(markers);markerById.set(x.id,marker);}
  }
  $('#result-count').textContent=`${state.visible.length} shown`;
  $('#csv').disabled=$('#geojson').disabled=!state.visible.length;
  $('#pagination').hidden=state.total<=PAGE_SIZE;$('#prev').disabled=state.start<=1;$('#next').disabled=state.start+PAGE_SIZE>state.total;
  $('#page-label').textContent=`${Math.ceil(state.start/PAGE_SIZE)} / ${Math.max(1,Math.ceil(state.total/PAGE_SIZE))}`;
}
function emptyDetail(){const outer=el('div',undefined,'detail-empty'),icon=el('span','⌖','compass'),body=el('div');icon.setAttribute('aria-hidden','true');body.append(el('p','02 / LOOK A LITTLE CLOSER','eyebrow'),el('h2','Every marker is a starting point.'),el('p','Choose a search result to see its naming status, recorded location and links to the original record.'));outer.append(icon,body);$('#detail').replaceChildren(outer);}
async function search(start=1,q=readQuery()){
  let url;try{url=queryURL(q,start);}catch(e){message(e.message,true);return;}
  searchAbort?.abort();detailAbort?.abort();state.detailToken++;const token=++state.searchToken;searchAbort=new AbortController();
  state.query={...q};state.start=start;state.total=0;state.items=[];state.visible=[];state.selected=null;
  history.replaceState(null,'',location.pathname+location.search);emptyDetail();renderResults();
  $('#submit').disabled=true;$('#submit').firstChild.textContent='Searching… ';$('#results').setAttribute('aria-busy','true');message('Looking up names in the provincial record…');
  try{const d=parseResponse(await request(url,searchAbort.signal));if(token!==state.searchToken)return;
    state.items=d.items;state.total=d.total;state.visible=q.mode==='near'?filterStatus(d.items,q.status):d.items;
    renderResults();fit();
    const range=d.total?`${start}–${Math.min(start+d.items.length-1,d.total)} of ${d.total.toLocaleString()} records`: 'No matching records';
    message(`${range}${q.mode==='near'&&q.status!=='all'?`; ${state.visible.length} match the status filter on this page`:''}. ${d.total?'Retrieved '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'.':'Try a broader name, similar spellings, or another point.'}`);
  }catch(e){if(token===state.searchToken&&!searchAbort.signal.aborted)message(e.message,true);}
  finally{if(token===state.searchToken){$('#submit').disabled=false;$('#submit').firstChild.textContent='Explore names ';$('#results').removeAttribute('aria-busy');}}
}
function renderDetail(x,notice=''){
  const panel=$('#detail');panel.replaceChildren();const title=el('div',undefined,'detail-title'),head=el('div');head.append(el('p',`02 / NAME RECORD ${x.id}`,'eyebrow'),el('h2',x.name,'place-name'),el('p',x.type+(x.location?' · '+x.location:'')));title.append(head,badge(x));panel.append(title);
  const dl=el('dl',undefined,'detail-grid');for(const [label,value] of [['Recorded status',x.status],['Naming decision',x.decision||'Not recorded'],['Point represents',x.position],['Coordinates',x.coords?`${x.coords[1].toFixed(5)}, ${x.coords[0].toFixed(5)}`:'Not available'],['Map sheet',x.mapsheet||'Not recorded'],['Language',x.language||'Not stated']]){const item=el('div');item.append(el('dt',label),el('dd',value));dl.append(item);}panel.append(dl);
  const actions=el('div',undefined,'detail-actions'),link=el('a','Official record & history ↗');link.href=x.url;link.target='_blank';link.rel='noopener';
  const share=el('button','Copy place link');share.type='button';share.addEventListener('click',async()=>{const url=new URL(location.href);url.hash=`name=${x.id}`;try{await navigator.clipboard.writeText(url.href);share.textContent='Link copied';}catch{let input=panel.querySelector('.share-field');if(!input){input=el('input',undefined,'share-field');input.readOnly=true;input.setAttribute('aria-label','Place link to copy');panel.append(input);}input.value=url.href;input.focus();input.select();share.textContent='Select and copy the link';}});
  actions.append(link,share);if(x.coords){const near=el('button','Explore nearby');near.type='button';near.addEventListener('click',()=>{setPoint(x.coords[1],x.coords[0]);$('#category').value='all';$('#status-filter').value='all';search();});actions.append(near);}panel.append(actions);
  const related=[...new Set(x.related)].filter(id=>id!==x.id);if(related.length){const row=el('div',undefined,'related');row.append(el('span','Other name records for this feature:'));for(const id of related){const b=el('button',`Record ${id}`);b.addEventListener('click',()=>select(id));row.append(b);}panel.append(row);}
  panel.append(el('p',notice||'Decision dates describe naming decisions, not a place’s founding. Origin notes and pronunciation, where available, are on the official record.','footnote'));
}
async function select(id){
  if(!/^\d+$/.test(id))return;detailAbort?.abort();detailAbort=new AbortController();const token=++state.detailToken;state.selected=id;
  for(const b of document.querySelectorAll('.result'))b.setAttribute('aria-pressed',String(b.dataset.id===id));
  const known=state.items.find(x=>x.id===id);if(known)renderDetail(known,'Loading the full name record…');else $('#detail').replaceChildren(el('p','Loading name record…'));
  history.replaceState(null,'',`${location.pathname}${location.search}#name=${id}`);
  try{const x=parseResponse(await request(`${API}names/${id}.json?outputSRS=4326`,detailAbort.signal),true);if(token!==state.detailToken)return;renderDetail(x);
    if(map&&x.coords){if(!markerById.has(id)){const m=L.circleMarker([x.coords[1],x.coords[0]],{bubblingMouseEvents:false,radius:8,color:'#fff',weight:2,fillColor:x.official?'#22674f':'#b26c3f',fillOpacity:1}).bindTooltip(el('span',x.name)).addTo(markers);markerById.set(id,m);}map.setView([x.coords[1],x.coords[0]],Math.max(map.getZoom(),11));markerById.get(id)?.openTooltip();}
  }catch(e){if(token!==state.detailToken||detailAbort.signal.aborted)return;if(known)renderDetail(known,`${e.message} Showing the search record; the official link is still available.`);else $('#detail').replaceChildren(el('h2','Record unavailable'),el('p',e.message));}
}
function download(ext,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=`bc-place-names.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#name-mode').addEventListener('click',()=>setMode('name'));$('#near-mode').addEventListener('click',()=>setMode('near'));
$('#search').addEventListener('submit',e=>{e.preventDefault();search();});$('#fit').addEventListener('click',fit);
$('#prev').addEventListener('click',()=>search(state.start-PAGE_SIZE,state.query));$('#next').addEventListener('click',()=>search(state.start+PAGE_SIZE,state.query));
$('#csv').addEventListener('click',()=>download('csv',csv(state.visible),'text/csv;charset=utf-8'));
$('#geojson').addEventListener('click',()=>download('geojson',JSON.stringify(geojson(state.visible),null,2),'application/geo+json'));
for(const button of document.querySelectorAll('[data-example]'))button.addEventListener('click',()=>{
  $('#category').value='all';$('#status-filter').value='all';$('#fuzzy').checked=false;
  if(button.dataset.example==='langley'){setPoint(49.11,-122.66);$('#radius').value='5';}
  else{setMode('name');$('#query').value=button.dataset.example==='golden'?'Golden Ears':'Macdonald Brook';}search();
});
$('#locate').addEventListener('click',()=>{if(!navigator.geolocation){message('Location is not available here. Enter coordinates or choose a map point.',true);return;}$('#locate').disabled=true;message('Waiting for your location permission…');navigator.geolocation.getCurrentPosition(p=>{setPoint(p.coords.latitude,p.coords.longitude);message('Location selected. Press Explore names to send these coordinates to the BC service.');$('#locate').disabled=false;},()=>{message('Location was unavailable or permission was declined. You can still choose a point on the map.',true);$('#locate').disabled=false;},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});
initMap();const shared=location.hash.match(/^#name=(\d+)$/);if(shared)select(shared[1]);
window.addEventListener('hashchange',()=>{const m=location.hash.match(/^#name=(\d+)$/);if(m)select(m[1]);});
