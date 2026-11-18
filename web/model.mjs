export const API = 'https://apps.gov.bc.ca/pub/bcgnws/';
export const PAGE_SIZE = 50;
export function queryURL(q, start = 1) {
  const p = new URLSearchParams({outputFormat:'json', outputSRS:'4326', outputStyle:'detail', itemsPerPage:String(PAGE_SIZE), startIndex:String(start)});
  let path = 'names/search';
  if(q.mode === 'near') {
    const lat=Number(q.lat), lon=Number(q.lon), distance=Number(q.radius);
    if(!String(q.lat).trim() || !String(q.lon).trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || lat<48 || lat>61 || lon< -140 || lon> -113) throw new Error('Choose a point in or near British Columbia (48–61° N, 140–113° W).');
    if(![1,5,10,25].includes(distance)) throw new Error('Choose a supported search radius.');
    p.set('featurePoint',`${lon},${lat}`); p.set('distance',String(distance)); path='names/near';
  } else {
    const name=String(q.name||'').trim(); if(!name || name.length>120) throw new Error('Enter a place name, up to 120 characters.');
    p.set('name',name); p.set('exactSpelling',q.fuzzy?'0':'1');
    if(q.status==='official') path='names/official/search';
    if(q.status==='recorded') path='names/notOfficial/search';
  }
  if(q.category && q.category!=='all') {if(!/^\d+$/.test(q.category))throw new Error('Invalid feature category.');p.set('featureCategory',q.category);}
  p.set('sortBy',q.mode==='near'?'name':'relevance');
  return API+path+'?'+p;
}
export function normalizeFeature(f) {
  if(!f || f.type!=='Feature' || !f.properties) throw new Error('The service returned an unexpected place record.');
  const p=f.properties, id=String(p.uri||'').match(/\/names\/(\d+)$/)?.[1];
  if(!id || !p.name) throw new Error('The place record is missing its identifier or name.');
  let coords=f.geometry?.type==='Point'?f.geometry.coordinates:null;
  if(!Array.isArray(coords)||coords.length<2||!coords.slice(0,2).every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90)coords=null;
  return {id,name:String(p.name),type:String(p.featureType||'Geographical feature'),status:String(p.status||'Not stated'),official:Number(p.isOfficial)===1,
    coords:coords?.slice(0,2)||null,position:String(p.position||'Not stated'),decision:p.decisionDate||'',changed:p.changeDate||'',
    location:p.feature?.relativeLocation||'',mapsheet:p.ntsMap||'',language:p.languageVariant?.primaryLanguageVariantName?.languageVariantName||'',
    featureId:String(p.feature?.id||''),related:(Array.isArray(p.feature?.names)?p.feature.names:[]).map(u=>String(u).match(/\/names\/(\d+)$/)?.[1]).filter(Boolean),
    url:`${API}names/${id}.html`};
}
export function parseResponse(d, detail=false) {
  if(d?.crs?.properties?.name && d.crs.properties.name!=='EPSG:4326')throw new Error('The service returned a different coordinate system. Please try again.');
  if(detail) return normalizeFeature(d.feature || d.features?.[0]);
  if(!Array.isArray(d?.features)||!Number.isInteger(Number(d?.properties?.totalResults))||Number(d.properties.totalResults)<0)throw new Error('The service returned an unexpected search response.');
  return {items:d.features.map(normalizeFeature),total:Number(d.properties.totalResults)};
}
export function filterStatus(items,status) {return items.filter(x=>status==='all'||(status==='official'?x.official:!x.official));}
export function distanceKm(a,b) {const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlon=(b[0]-a[0])*r; const h=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
export function csv(items) {
  const cell=v=>'"'+(typeof v==='string'?v.replace(/^[=+@\-\t\r]/,"'$&"):String(v??'')).replaceAll('"','""')+'"';
  return [['name','type','status','official','longitude','latitude','position','decision_date','source'],...items.map(x=>[x.name,x.type,x.status,x.official,x.coords?.[0],x.coords?.[1],x.position,x.decision,x.url])].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function geojson(items) {return {type:'FeatureCollection',features:items.map(x=>({type:'Feature',geometry:x.coords?{type:'Point',coordinates:x.coords}:null,properties:{name:x.name,type:x.type,status:x.status,isOfficial:x.official,position:x.position,decisionDate:x.decision,source:x.url}}))};}
