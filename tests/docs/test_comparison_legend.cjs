const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../../doc/source/_static/comparison-legend.js'),M=require('../../doc/source/_static/economy-model.js'),A=require('../../doc/source/_static/account-model.js'),T=require('../../doc/source/_static/trade-model.js'),C=require('../../doc/source/_static/economy-charts.js'),TC=require('../../doc/source/_static/trade-charts.js');
const regions=[{code:'AA',name:'Alpha',label:'Alpha',iso3:'AAA',kind:'country'},{code:'BB',name:'Beta',label:'Beta',iso3:'BBB',kind:'country'}];
const recipe={id:'fixture',source:'WIOD',release:'2016',year:2024,table:'IOT',currency:'USD',currency_scale:1,parser_options:{system:'ixi'}};
const wb={countries:{}},state={families:['WIOD'],versions:{},year:[2024],metric:'value_added_footprint',section:'all',country:'BBB',accountComponent:'total',perCapita:false,legendBy:'auto',accountUse:'total'};
const sectionAccounts={C:{value_added_footprint:[[3,1],[2,1]]},D:{value_added_footprint:[[5,1],[4,3]]}};
function snapshot(year=2024){const r={...recipe,id:'fixture-'+year,year},data=A.mergeCountryAccounts(null,{recipe:r,regions,accounts:{value_added_footprint:[[8,2],[6,4]],domestic_use:{total:[[10],[20]],intermediate:[[6],[15]],final:[[4],[5]]}},sector_groups:{C:['manufacturing'],D:['utilities']},sector_classification:{id:'nace-2-common',sections:{C:'Manufacturing',D:'Electricity'}}});const s=A.attach({recipe:r,regions,summary_only:true},data);for(const [section,accounts] of Object.entries(sectionAccounts))A.attachAccountSector(s,{section,accounts});return s;}
const observed=(snapshots,selection)=>A.observations(snapshots,selection,wb,M,T),sum=rows=>rows.reduce((n,r)=>n+r.value,0);
const block=(n)=>({intermediate:[[0,n],[n,0]],final:[[0,n/2],[n/2,0]]});
function trade(){const s=A.embodiedCatalogue([{recipe,regions,value_added_trade:{total:block(10),domestic:block(7),foreign:block(3)},sector_groups:{C:['manufacturing'],D:['utilities']},sector_classification:{sections:{C:'Manufacturing',D:'Electricity'}}}],T,'value_added_trade',wb,M)[0];for(const [section,n] of [['C',4],['D',6]])A.attachTradeSector(s,{section,value_added_trade:{total:block(n),domestic:block(n*.7),foreign:block(n*.3)}});return s;}
const ts={...state,metric:'value_added_trade',origin:['AAA'],destination:['BBB'],tradeOrigin:'total',tradeUse:'total',tradeScope:'all'};
const opts=(selection,years=[2024])=>({state:selection,years,colors:{palette:['#123','#456','#789'],background:'#fff',grid:'#ddd'},catalogue:[M.seriesKey(recipe)],nativeUnit:'current US$',databaseFamilies:['WIOD','ADB']});
test('legend groups coalesce transitive native combinations without allocation or duplicates',()=>{
 assert.deepEqual(L.sectorGroups(['A','B','C','D','A'],['A+B','B+C']),['A+B+C','D']);
 assert.deepEqual(L.sectorGroups(['A','C'],['A+B']),['A','C']);
 assert.deepEqual(L.sectorGroups(['A+C','C','B']),['A+C','B']);
 assert.deepEqual(L.sectorGroups('all',['A+B']),[]);
 assert.equal(L.choices({...state,section:'all'},{components:['Domestic','Foreign'],sectors:true}).find(o=>o.value==='sector').disabled,true);
});
test('account origins stay additive in annual and temporal selections and preserve filters',()=>{
 const snapshots=[snapshot(),snapshot(2023)],selection={...state,year:[2023,2024],legendBy:'component'};
 const rows=observed(snapshots,selection);assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.value).sort((a,b)=>a-b),[4,4,6,6]);
 for(const year of selection.year)assert.equal(sum(rows.filter(r=>r.year===year)),sum(observed(snapshots,{...selection,year:[year],legendBy:'auto'})));
 assert.ok(observed(snapshots,{...selection,accountComponent:'1'}).every(r=>r.value===4));
 const csv=A.exportRows(rows,snapshots,selection,{factor:1,unit:'USD'},C,M);assert.deepEqual(new Set(csv.map(r=>r.component)),new Set(['Domestic value added','Foreign value added']));assert.ok(csv.every(r=>r.legend_by==='component'));
});
test('account sector and domestic-use legends preserve totals and per-row CSV boundaries',()=>{
 const s=snapshot(),selection={...state,section:['C','D'],legendBy:'sector'},rows=observed([s],selection);
 assert.deepEqual(rows.map(r=>r.value),[3,7]);assert.equal(sum(rows),sum(observed([s],{...selection,legendBy:'auto'})));
 assert.deepEqual(observed([s],{...selection,accountComponent:'1'}).map(r=>r.value),[1,3]);
 const csv=A.exportRows(rows,[s],selection,{factor:1,unit:'USD'},C,M);assert.deepEqual(csv.map(r=>r.sectors),['C','D']);
 const uses=observed([s],{...state,metric:'domestic_use',legendBy:'use'});assert.deepEqual(uses.map(r=>r.value),[15,5]);assert.equal(sum(uses),20);
 assert.deepEqual(observed([s],{...state,metric:'domestic_use',legendBy:'use',accountUse:'final'}).map(r=>r.value),[5]);
});
test('sector legend applies a native combined group to every selected reading',()=>{
 const first=snapshot(),other=snapshot();other.recipe={...other.recipe,id:'combined',source:'ADB'};other.account.sector_groups={'C+D':['combined']};other.account.sector_accounts={'C+D':{value_added_footprint:[[8,2],[6,4]]}};
 const rows=observed([first,other],{...state,families:['WIOD','ADB'],section:['C','D'],legendBy:'sector'});assert.equal(rows.length,2);assert.ok(rows.every(r=>r.sector==='C+D'&&r.value===10));
 const isolated=observed([first,other],{...state,section:['C','D'],legendBy:'sector'});assert.deepEqual(isolated.map(r=>r.sector),['C','D']);
});
test('embodied trade origin and sector breakdowns preserve signed values, use and CSV identities',()=>{
 const s=trade(),origins=T.observations([s],{...ts,legendBy:'component'},M);assert.deepEqual(origins.map(r=>r.value),[10.5,4.5]);assert.equal(sum(origins),15);
 const csv=A.exportTradeRows(origins,{...ts,legendBy:'component'},T);assert.deepEqual(csv.map(r=>r.value_added_origin),['domestic','foreign']);
 const sectors=T.observations([s],{...ts,section:['C','D'],legendBy:'sector',tradeOrigin:'foreign',tradeUse:'final'},M);assert.deepEqual(sectors.map(r=>r.value),[.6,.8999999999999999]);assert.ok(sectors.every(r=>r.value===r.final));assert.deepEqual(A.exportTradeRows(sectors,ts,T).map(r=>r.sectors),['C','D']);
 s.reading.content_flows.domestic.intermediate[0][1]=-7;const signed=T.observations([s],{...ts,legendBy:'component'},M);assert.ok(signed[0].value<0);
});
test('chart legend choices change groups and colours while preserving plotted observations',()=>{
 const rows=observed([snapshot()],{...state,legendBy:'component'}),values=rows.map(r=>r.value);
 for(const legendBy of ['component','database','series']){const figure=C.figure(rows,opts({...state,legendBy}));assert.deepEqual(figure.data.flatMap(t=>t.y),values);assert.ok(figure.data.every(t=>!t.offsetgroup));const shown=figure.data.filter(t=>t.showlegend);assert.equal(shown.length,legendBy==='component'?2:1);assert.ok(shown.every(t=>t.legendgroup.startsWith(legendBy==='component'?'sector:':legendBy+':')));}
 const twoYears=observed([snapshot(),snapshot(2023)],{...state,year:[2023,2024],legendBy:'component',families:['WIOD','ADB']});assert.ok(C.figure(twoYears,opts({...state,legendBy:'component',families:['WIOD','ADB']},[2023,2024])).data.every(t=>t.type==='scatter'));
});
test('trade custom stacks include complete heights and temporal use never overlays a total reference',()=>{
 const rows=T.observations([trade()],{...ts,legendBy:'component'},M),f=TC.figure(rows,[],opts({...ts,legendBy:'component'}),C);assert.ok(f.layout.yaxis.range[1]>15);assert.equal(f.layout.barmode,'relative');assert.deepEqual(f.data.filter(t=>t.showlegend).map(t=>t.name),['Domestic','Foreign']);
 const ref={year:2024,lower:3,upper:9,complete:true,exports:{value:3},imports:{value:9}},temporal=TC.figure(rows,[ref],opts({...ts,metric:'trade',tradeScope:'goods_proxy',legendBy:'use'},[2023,2024]),C);assert.equal(temporal.referenceIndices.length,0);assert.ok(temporal.data.every(t=>t.type==='scatter'));
});

test('sector legends never turn unavailable combined selections into partial source totals',()=>{
 const s=snapshot();s.account.sector_groups={C:['manufacturing'],'D+E':['utilities']};s.account.sector_accounts['D+E']=s.account.sector_accounts.D;delete s.account.sector_accounts.D;
 const rows=observed([s],{...state,section:['C','D'],legendBy:'sector'});assert.equal(rows.length,2);assert.ok(rows.every(r=>r.value===null&&/indivisible/.test(r.note)));
 const t=trade();t.reading.sector_groups={C:['manufacturing'],'D+E':['utilities']};t.reading.sector_flows['D+E']=t.reading.sector_flows.D;delete t.reading.sector_flows.D;
 assert.ok(T.observations([t],{...ts,section:['C','D'],legendBy:'sector'},M).every(r=>r.value===null&&r.total===null));
});
