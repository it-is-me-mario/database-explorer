const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../../doc/source/_static/trade-model.js');
const M=require('../../doc/source/_static/economy-model.js');
const C=require('../../doc/source/_static/economy-charts.js');
const TC=require('../../doc/source/_static/trade-charts.js');
const reading={regions:[{iso3:'CHN',label:'CN',kind:'country'},{iso3:'ITA',label:'IT',kind:'country'},{iso3:'JPN',label:'JP',kind:'country'}],
 flows:{all:{intermediate:[[100,20,3],[5,100,4],[7,8,100]],final:[[100,-2,1],[2,100,2],[3,4,100]]}}};
test('group flows deduplicate selections and exclude domestic pairs before summing',()=>{
 const v=T.aggregate(reading,['CHN','ITA','CHN'],['CHN','ITA']).value;
 assert.deepEqual(v,{intermediate:25,final:0,total:25,pairs:2});
 assert.equal(T.aggregate(reading,['CHN','JPN'],['ITA']).value.total,30);
});
test('empty groups and purely domestic selections are unavailable, not observed zero',()=>{
 assert.equal(T.aggregate(reading,[],['ITA']).value,null);
 assert.equal(T.aggregate(reading,['ITA'],['ITA']).value,null);
});
test('partial native coverage is never summed as a smaller country group',()=>{
 const v=T.aggregate(reading,['CHN','USA'],['ITA']);assert.equal(v.value,null);assert.match(v.reason,/USA/);
 const r=structuredClone(reading);r.regions[2]={iso3:null,kind:'aggregate'};
 assert.equal(T.aggregate(r,['JPN'],['ITA']).value,null);
 r.regions.push({iso3:'CHN',kind:'country'});assert.match(T.aggregate(r,['CHN'],['ITA']).reason,/Ambiguous/);
});
test('missing cells stay unavailable while actual zero and negative flows survive',()=>{
 const r=structuredClone(reading);r.flows.all.final[0][1]=null;
 assert.equal(T.aggregate(r,['CHN'],['ITA']).value,null);
 r.flows.all.intermediate[0][1]=0;r.flows.all.final[0][1]=0;
 assert.equal(T.aggregate(r,['CHN'],['ITA']).value.total,0);
 assert.equal(T.aggregate(reading,['CHN'],['ITA']).value.final,-2);
});
test('Comtrade bounds are formed after summing complete reporting sides',()=>{
 const pairs=[['CHN','ITA'],['CHN','FRA'],['JPN','ITA'],['JPN','FRA']];
 const rows=pairs.flatMap(([origin,destination],i)=>['export','mirror_import'].map((kind,j)=>({origin,destination,year:2022,kind,value_usd:([10,30,40,20].map((v,k)=>j?[30,10,20,40][k]:v))[i]})));
 const v=T.referenceRange(T.referenceIndex(rows),['CHN','JPN'],['ITA','FRA'],2022);
 assert.equal(v.lower,100);assert.equal(v.upper,100);assert.equal(v.complete,true);
 const partial=T.referenceRange(T.referenceIndex(rows.slice(1)),['CHN','JPN'],['ITA','FRA'],2022);
 assert.equal(partial.exports,null);assert.equal(partial.imports.value,100);assert.equal(partial.complete,false);
 assert.equal(T.referenceRange(T.referenceIndex(rows),['CHN'],['ITA'],2015).lower,null);
 assert.throws(()=>T.referenceIndex([...rows,rows[0]]),/Duplicate/);
});
test('a reported zero reference remains a value',()=>{
 const index=T.referenceIndex([{origin:'CHN',destination:'ITA',year:2022,kind:'export',value_usd:0}]);
 const ref=T.referenceRange(index,['CHN'],['ITA'],2022);assert.equal(ref.lower,0);assert.equal(ref.upper,0);
});
const manifest={datasets:[{id:'a2015',family:'EXIOBASE',version:'3.11.2',year:2015,format:'ixi',file:'a.json',label:'EXIOBASE ixi'},
 {id:'b2022',family:'FIGARO',version:'standard',year:2022,format:'pxp',file:'b.json',label:'FIGARO pxp'}]};
const snapshots=T.catalogue(manifest);snapshots[0].reading=reading;
const state={families:['EXIOBASE'],versions:{},year:'all',origin:['CHN'],destination:['ITA'],tradeUse:'total',metric:'trade',perCapita:false};
test('time selection retains explicit missing years rather than substituting a native year',()=>{
 const rows=T.observations(snapshots,state,M);
 assert.deepEqual(rows.map(r=>r.year),[2015,2022]);assert.equal(rows[0].total,18);assert.equal(rows[1].value,null);
 assert.match(rows[1].note,/No collected reading/);
 assert.equal(T.observations(snapshots,{...state,tradeUse:'intermediate'},M)[0].value,20);
 assert.equal(T.observations(snapshots,{...state,tradeUse:'final'},M)[0].value,-2);
});
const colors={background:'#fff',surface:'#fff',ink:'#111',muted:'#888',grid:'#ddd',reference:'#786e9c',font:'Arial',palette:['#339','#f80']};
const opts={state:{...state,tradeScope:'goods_proxy'},years:[2015],colors,catalogue:snapshots.map(s=>M.seriesKey(s.recipe)),databaseFamilies:['EXIOBASE'],width:900,nativeUnit:'current US$'};
test('annual trade stacks signed intermediate/final uses and displays descriptive range',()=>{
 const rows=T.observations(snapshots,{...state,year:2015},M);
 const fig=TC.figure(rows,[{year:2015,lower:25,upper:30,complete:true}],opts,C);
 assert.equal(fig.layout.barmode,'relative');assert.ok(fig.data.filter(t=>!t.meta?.tradeReference).every(t=>t.type==='bar'));
 assert.deepEqual(new Set(fig.data.filter(t=>t.meta?.tradeComponent).map(t=>t.meta.tradeComponent)),new Set(['intermediate','final']));
 const band=fig.layout.shapes[fig.referenceIndices[0]];assert.equal(band.y0,25);assert.equal(band.y1,30);
 assert.ok(fig.layout.yaxis.range[1]>30);
});
test('multiple years use markers even for a single database and retain reference gaps',()=>{
 const rows=T.observations(snapshots,state,M);rows[1]={...rows[1],value:21,intermediate:22,final:-1,total:21};
 const fig=TC.figure(rows,[{year:2015,lower:20,upper:25,complete:true},{year:2022,lower:24,upper:29,complete:true}],{...opts,years:[2015,2022]},C);
 assert.ok(fig.data.every(t=>t.type==='scatter'&&t.mode==='markers'));
 assert.equal(fig.referenceIndices.length,2);
 assert.deepEqual(fig.referenceIndices.map(i=>fig.layout.shapes[i].x0),[2014.6,2021.6]);
 const partial=TC.figure(rows,[],{...opts,years:[2015,2022],state:{...state,tradeUse:'intermediate'}},C);
 assert.equal(partial.referenceIndices.length,0);
});
test('CSV exports preserve both reference sides and boundaries without accuracy ratios',()=>{
 const rows=T.observations(snapshots,state,M),ref={year:2015,exports:{value:10,observations:[{origin:'CHN',destination:'ITA',value_usd:10,is_reported:false,is_aggregate:true}]},imports:null,lower:10,upper:10};
 const exports=T.exportRows(rows,[ref],{...state,tradeScope:'goods_proxy'});
 assert.equal(exports[0].comtrade_export_usd,10);assert.equal(exports[0].comtrade_mirror_import_usd,null);
 assert.match(exports[0].comparison_note,/not a confidence interval/);
 assert.equal('ratio_to_reference' in exports[0],false);assert.equal(exports[1].total_usd,null);
});

test('the goods-producing proxy is a separate scope and never falls back to all-sector totals',()=>{
 const r=structuredClone(reading);r.flows.goods_proxy={intermediate:[[0,6,0],[0,0,0],[0,0,0]],final:[[0,2,0],[0,0,0],[0,0,0]]};
 const s=T.catalogue({datasets:[manifest.datasets[0]]})[0];s.reading=r;
 const chosen={...state,year:2015,tradeScope:'goods_proxy'};
 assert.equal(T.observations([s],chosen,M)[0].total,8);
 assert.equal(T.exportRows(T.observations([s],chosen,M),[],chosen)[0].mrio_scope,'Goods-producing groups (proxy)');
 delete r.flows.goods_proxy;assert.equal(T.observations([s],chosen,M)[0].value,null);
});


test('merchandise references never accompany all-sector charts or downloads',()=>{
 const rows=T.observations(snapshots,{...state,year:2015},M);
 const ref={year:2015,exports:{value:1000,observations:[]},imports:{value:2000,observations:[]},lower:1000,upper:2000,complete:true};
 for(const years of [[2015],[2015,2022]]) {
  const fig=TC.figure(rows,[ref],{...opts,years,state:{...state,tradeScope:'all'}},C);
  assert.equal(fig.referenceIndices.length,0);
  assert.equal(fig.data.some(t=>t.meta?.tradeReference),false);
  assert.ok(fig.layout.yaxis.range[1]<1000,'Hidden reference bounds must not stretch the all-sector axis');
 }
 for(const scope of [undefined,'all']) {
  const exported=T.exportRows(rows,[ref],{...state,tradeScope:scope})[0];
  assert.equal(exported.total_usd,18);
  assert.equal(Object.keys(exported).some(k=>k.startsWith('comtrade_')||k==='comparison_note'),false);
 }
});


test('qualified reporting areas remain intact and uncertain group sums are withheld',()=>{
 const note='Comtrade reporting area 842: USA, Puerto Rico and US Virgin Islands';
 const rows=['CHN','ITA'].map(origin=>({origin,destination:'USA',year:2022,kind:'export',value_usd:10,destination_area_note:note,partner_code:842,partner_iso:'USA'}));
 rows.push({origin:'CHN',destination:'PRI',year:2022,kind:'export',value_usd:2});
 const index=T.referenceIndex(rows),single=T.referenceRange(index,['CHN'],['USA'],2022);
 assert.equal(single.exports.value,10);assert.deepEqual(single.geography_notes,[note]);
 assert.equal(T.referenceRange(index,['CHN','ITA'],['USA'],2022).exports.value,20);
 const overlapping=T.referenceRange(index,['CHN'],['USA','PRI'],2022);
 assert.equal(overlapping.exports,null);assert.equal(overlapping.lower,null);assert.deepEqual(overlapping.geography_notes,[note]);
 const reversed=T.referenceIndex(rows.map(r=>({...r,origin:r.destination,destination:r.origin,origin_area_note:r.destination_area_note,destination_area_note:''})));
 assert.equal(T.referenceRange(reversed,['USA','PRI'],['CHN'],2022).exports,null);
 const exported=T.exportRows([{year:2022}], [single],{tradeScope:'goods_proxy',origin:['CHN'],destination:['USA']})[0];
 assert.equal(exported.comtrade_geography_notes,note);assert.match(exported.comtrade_export_observations,/842/);
});
