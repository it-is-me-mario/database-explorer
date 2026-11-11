/* Numerical values retain the reviewed scope qualification through every export. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../../doc/source/_static/economy-model.js'),T=require('../../doc/source/_static/trade-model.js'),A=require('../../doc/source/_static/account-model.js'),C=require('../../doc/source/_static/economy-charts.js'),R=require('../../doc/source/_static/reproduction-download.js');
const document=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/data/economy/common-sector-sections.json'),'utf8'));
const mappings=M.commonMappings(document),qualified=/NACE Rev\. 2 macrosector proxies|possible native scope.*not exhaustive target-section membership/i;
const interpretation='native_main_activity_proxy';
const wb={countries:{}};
function production(id){
 const mapping=mappings[id],recipe={id,source:mapping.family,release:mapping.version,year:2024,table:mapping.dimension==='Sector'?'IOT':'SUT',currency:'USD',currency_scale:1,parser_options:{},sectors:mapping.entries.map(e=>e.native_label),gwp_basis:'AR5',gwp_horizon:100,final_demand_emissions_loaded:false};
 return {recipe,regions:[{code:'AA',name:'Alpha',iso3:'AAA',kind:'country',value_added:recipe.sectors.map(()=>1),ghg:recipe.sectors.map(()=>2)}]};
}
function state(snapshot,metric,section){return {families:[snapshot.recipe.source],versions:{},year:[2024],metric,section,country:'AAA',perCapita:false};}
for(const [id,section] of [['exiobase-3112-2024-ixi','D'],['wiod-2016-2014-sut','A']])for(const metric of ['value_added','ghg']){
 test(`${id} ${metric} preserves its actual qualified ${section} scope in selections and exports`,()=>{
  const snapshot=production(id),mapping=mappings[id],selection=state(snapshot,metric,section);
  assert.equal(mapping.coverage_interpretation,interpretation);
  const chosen=M.sectorSelection(snapshot,mapping,section,metric);assert.ok(chosen.indices.length);assert.match(chosen.note,qualified);
  const rows=M.observations([snapshot],selection,wb,{[id]:mapping});assert.equal(rows.length,1);assert.ok(Number.isFinite(rows[0].value));assert.match(rows[0].note,qualified);
  const csv=M.exportRows(rows,[snapshot],selection,{factor:1,unit:'test'},C);assert.match(csv[0].note,qualified);
  const point=R.economicPoint(snapshot,rows[0],selection,mapping,wb,M);assert.match(point.row.note,qualified);assert.equal(point.expected_value,rows[0].value);
  const all=M.sectorSelection(snapshot,mapping,'all',metric);assert.doesNotMatch(all.note||'',qualified);
  const totals=M.observations([snapshot],{...selection,section:'all'},wb,{[id]:mapping}).filter(row=>row.database===snapshot.recipe.source);assert.ok(totals.length);assert.doesNotMatch(totals[0].note||'',qualified);
 });
}

const regions=[{code:'AA',label:'Alpha',name:'Alpha',iso3:'AAA',kind:'country'},{code:'BB',label:'Beta',name:'Beta',iso3:'BBB',kind:'country'}];
const block={intermediate:[[1,2],[3,4]],final:[[2,3],[4,5]]};
const va={total:block,domestic:block,foreign:{intermediate:[[0,0],[0,0]],final:[[0,0],[0,0]]}};
function account(classification={id:'nace-2-common',coverage_interpretation:interpretation}){
 return {sector_classification:classification,sector_scope:{},sector_files:{A:'a.json'},sector_groups:{A:['native agriculture']},notes:{value_added_footprint:'Whole-economy upstream account.'},sector_notes:{A:{value_added_footprint:'Supplying-sector account.'}},sector_accounts:{A:{value_added_footprint:[[1,2],[3,4]]}}};
}

test('trade and account selections preserve qualified scope even when shard notes already exist',()=>{
 const data=account();assert.match(T.sectorSelection(data,'A').note,qualified);assert.doesNotMatch(T.sectorSelection(data,'all').note||'',qualified);
 const selected=A.selectedAccountSectors({account:data},{metric:'value_added_footprint',section:'A'},T);assert.match(selected.note,qualified);assert.match(selected.note,/Supplying-sector account/);
 assert.doesNotMatch(A.selectedAccountSectors({account:data},{metric:'value_added_footprint',section:'all'},T).note,qualified);
});

test('legacy common-sector metadata remains qualified but an explicit different interpretation wins',()=>{
 assert.match(T.sectorSelection(account({id:'nace-2-common'}),'A').note,qualified);
 const exact=account({id:'nace-2-common',coverage_interpretation:'reviewed_exhaustive_target_membership'});
 assert.doesNotMatch(T.sectorSelection(exact,'A').note||'',qualified);
});

test('embodied trade observations and CSV retain the qualified supplying-sector boundary',()=>{
 const recipe={id:'fixture',source:'WIOD',release:'2016',year:2024,table:'IOT',currency:'USD',currency_scale:1,parser_options:{}};
 const source={id:'fixture',recipe,regions,...account(),value_added_trade:va};
 const snapshot=A.embodiedCatalogue([source],T,'value_added_trade',wb,M)[0];
 A.attachTradeSector(snapshot,{section:'A',value_added_trade:va});
 const selected={families:['WIOD'],versions:{},year:[2024],metric:'value_added_trade',section:'A',origin:['AAA'],destination:['BBB'],tradeUse:'total',tradeOrigin:'total',tradeScope:'all'};
 const rows=T.observations([snapshot],selected,M);assert.equal(rows[0].value,5);assert.match(rows[0].note,qualified);assert.match(A.exportTradeRows(rows,selected,T)[0].note,qualified);
 assert.doesNotMatch(T.observations([snapshot],{...selected,section:'all'},M)[0].note||'',qualified);
});

test('externally supplied overlapping production aggregates never become additive stacks',()=>{
 const id='wiod-2016-2014-sut',snapshot=production(id),mapping=mappings[id];
 const first=M.sectorSelection(snapshot,mapping,'A+C').indices,second=M.sectorSelection(snapshot,mapping,'C').indices;
 assert.equal(first.length,22);assert.equal(second.length,19);assert.ok(second.every(index=>first.includes(index)));
 for(const sections of [['A+C','C'],['all','C']]){
  const rows=M.observations([snapshot],state(snapshot,'value_added',sections),wb,{[id]:mapping});
  assert.ok(rows.length);assert.ok(rows.every(row=>row.value===null));assert.ok(rows.every(row=>/overlap/i.test(row.note)));
 }
 const disjoint=M.observations([snapshot],state(snapshot,'value_added',['A','C']),wb,{[id]:mapping});assert.equal(disjoint.length,2);assert.equal(disjoint.reduce((sum,row)=>sum+row.value,0),22);
});
