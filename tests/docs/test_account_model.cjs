const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../../doc/source/_static/account-model.js'),M=require('../../doc/source/_static/economy-model.js'),P=require('../../doc/source/_static/comparison-guide.js');
const recipe={id:'sample',source:'EXIOBASE',release:'3.11.2',year:2022,table:'IOT',currency:'EUR',sectors:['goods'],parser_options:{system:'ixi',unit:'Monetary'},world_total_available:true};
const regions=[{code:'CN',iso3:'CHN',kind:'country',name:'China',gdp:5},{code:'IT',iso3:'ITA',kind:'country',name:'Italy',gdp:7}];
const data={id:'sample',recipe,components:{ghg_footprint:['Domestic','Foreign'],domestic_use:['Domestic','Imported']},metrics:['ghg_footprint','domestic_use'],notes:{ghg_footprint:'Allocable; residual separate',domestic_use:'Model destination'},regions:regions.map((r,i)=>({...r,accounts:{ghg_footprint:i?[40,10]:[30,20],domestic_use:{total:[100,50],intermediate:[60,10],final:[40,40]}}}))};
const wb={countries:{DEU:{years:{2022:{local_currency_per_usd:2}}},ITA:{years:{2022:{population:2}}},WLD:{years:{2022:{population:10}}}}};
const state={families:['EXIOBASE'],versions:{},year:[2022],metric:'ghg_footprint',country:'ITA',section:'all',perCapita:false,accountComponent:'total'};
test('account attachment preserves existing production values and exposes only collected years',()=>{
 const s=A.attach({metadata_only:true,recipe,regions,availability:{gdp:true}},data);
 assert.equal(s.regions[1].gdp,7);assert.equal(s.availability.ghg_footprint,true);
 assert.deepEqual(P.eligible([{recipe:{...recipe,year:1995}},s],state,M).map(s=>s.recipe.year),[2022]);
});
test('physical footprint components do not receive monetary exchange-rate conversion',()=>{
 const s=A.attach({metadata_only:true,recipe,regions,availability:{}},data),rows=A.observations([s],state,wb,M);
 assert.equal(rows.length,2);assert.ok(Math.abs(rows.reduce((n,r)=>n+r.value,0)-.05)<1e-12); // 50 t = .05 Gg
 const person=A.observations([s],{...state,perCapita:true},wb,M);assert.equal(person.reduce((n,r)=>n+r.value,0),25);
 const world=A.observations([s],{...state,country:'world',perCapita:true},wb,M);assert.ok(Math.abs(world.reduce((n,r)=>n+r.value,0)-10)<1e-12);
});
test('domestic use respects intermediate/final selection and same-year currency',()=>{
 const s=A.attach({metadata_only:true,recipe,regions,availability:{}},data);
 const rows=A.observations([s],{...state,metric:'domestic_use',accountUse:'final'},wb,M);
 assert.equal(rows.reduce((n,r)=>n+r.value,0),40); // 80 EUR / 2
});

test('account comparisons retain missing-country reasons instead of filling a regional aggregate',()=>{
 const s=A.attach({metadata_only:true,recipe,regions,availability:{}},data);
 const rows=A.observations([s],{...state,country:'KEN'},wb,M);
 assert.ok(rows.every(r=>r.value===null));assert.match(rows[0].note,/not represented/);
});

test('time-series calculation notes identify the source and years of each residual',()=>{
 const s=A.attach({recipe,regions,availability:{}},data),earlier={...s,recipe:{...recipe,year:2015}},changed={...earlier,account:{...data,notes:{...data.notes,ghg_footprint:'Different residual'}}};
 assert.deepEqual(A.calculationNotes([s,earlier],state.metric,M).map(g=>g.years),[[2015,2022]]);
 const groups=A.calculationNotes([s,changed],state.metric,M);assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.years),[[2022],[2015]]);assert.match(groups[0].label,/EXIOBASE/);
});

test('EMERGING combined consumption retains its observed household boundary in chart notes and CSV',()=>{
 const fs=require('node:fs'),path=require('node:path'),read=(kind)=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../doc/source/_static/data',kind,'emerging-22-2023.json'),'utf8'));
 const account=read('accounts'),s=A.attach(read('economy'),account),selection={...state,families:['EMERGING'],year:[2023],metric:'final_demand',country:'CHN',demandGroup:'households_npish'};
 assert.deepEqual(account.demand_groups.households_npish,['household']);
 const rows=A.observations([s],selection,{countries:{}},M);assert.ok(rows.length>0&&rows.every(r=>Number.isFinite(r.value)));
 for(const row of rows){assert.match(row.note,/NPISH coverage is undocumented/);assert.match(row.note,/not a verified complete/);}
 const csv=A.exportRows(rows,[s],selection,{unit:'USD'},{scaled:v=>v},M);
 assert.ok(csv.every(r=>r.demand==='households_npish'&&r.note.includes('No missing NPISH amount is treated as zero')));
 assert.match(A.calculationNotes([s],'final_demand',M)[0].note,/NPISH coverage is undocumented/);
});
