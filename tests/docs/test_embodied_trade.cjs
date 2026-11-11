const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../../doc/source/_static/account-model.js'),T=require('../../doc/source/_static/trade-model.js'),M=require('../../doc/source/_static/economy-model.js'),P=require('../../doc/source/_static/comparison-guide.js');
const regions=[{code:'AA',label:'Alpha',name:'Alpha',iso3:'AAA',kind:'country'},{code:'BB',label:'Beta',name:'Beta',iso3:'BBB',kind:'country'},{code:'ROW',label:'Rest of World',name:'Rest of World',kind:'aggregate'}];
const block=(n=1)=>({intermediate:[[100,2*n,3*n],[4*n,100,5*n],[6*n,7*n,100]],final:[[200,n,n],[n,200,n],[n,n,200]]});
const recipe={id:'sample',source:'WIOD',release:'2016',year:2022,table:'IOT',currency:'EUR',currency_scale:1e6,price_basis:'Current prices',parser_options:{system:'ixi'},gwp_basis:'AR5',gwp_horizon:100};
const classification={id:'nace-2-common',label:'NACE Rev.2 sections',sections:{A:'Agriculture',B:'Mining',C:'Manufacturing'},groups:['A+C','B']};
const data={id:recipe.id,recipe,regions,notes:{ghg_trade:'Repeated border crossings count emissions more than once.',value_added_trade:'Domestic is relative to the exporter.'},ghg_trade:block(10),value_added_trade:{total:block(4),domestic:block(3),foreign:block(1)},sector_files:{'A+C':'sample-AC.json',B:'sample-B.json'},sector_classification:classification,sector_groups:{'A+C':['combined agriculture/manufacturing'],B:['mining']},provenance:{metric_compute:{value_added_trade:{solver:'scipy',strategy:'iterative',refinement_steps:1}}}};
const wb={countries:{DEU:{years:{2022:{local_currency_per_usd:2}}}},currency_rates:{EUR:{years:{1995:1.25}}}};
const state={metric:'value_added_trade',families:['WIOD'],versions:{},year:[2022],origin:['AAA'],destination:['BBB'],tradeUse:'total',tradeOrigin:'total',tradeScope:'all',section:'all'};
function catalogue(metric='value_added_trade',source=data){return A.embodiedCatalogue([source],T,metric,wb,M)[0];}
test('embodied catalogues retain source identity, format, valuation and physical GWP metadata',()=>{
 const va=catalogue(),ghg=catalogue('ghg_trade');
 assert.equal(M.version(va.recipe),'2016 · Current prices · IOT');assert.equal(va.recipe.currency,'EUR');assert.equal(va.reading.recipe_id,'sample');
 assert.equal(va.reading.native_scale,1);assert.equal(va.reading.usd_per_native_currency,.5);
 assert.equal(ghg.reading.gwp_basis,'AR5');assert.equal(ghg.reading.gwp_horizon,100);assert.deepEqual(ghg.reading.flows.all,data.ghg_trade);
 assert.equal(ghg.reading.native_currency,'');assert.equal(ghg.reading.price_basis,'Physical GHG result');
});
test('value-added origin selection uses the exporter and performs one same-year conversion',()=>{
 const s=catalogue();
 for(const [origin,expected] of [['total',6],['domestic',4.5],['foreign',1.5]]){
  const [row]=T.observations([s],{...state,tradeOrigin:origin},M);assert.equal(row.total,expected);
 }
 assert.equal(A.exchangeRate({...recipe,year:1995},wb,M),1.25);
 assert.equal(A.exchangeRate({...recipe,year:1996},wb,M),null);
 assert.equal(A.exchangeRate({...recipe,currency:'USD'},wb,M),1);
 const noFX=catalogue('value_added_trade',{...data,recipe:{...recipe,year:2021}}),[missing]=T.observations([noFX],{...state,year:[2021]},M);
 assert.equal(missing.value,null);assert.match(missing.note,/same-year.*2021/);
});
test('All embodied origins and destinations retain native aggregates and exclude every diagonal',()=>{
 const s=catalogue('ghg_trade'),all=T.aggregate(s.reading,['all'],['all'],'all',{section:'all'});
 assert.equal(all.value.total,330);assert.equal(all.value.pairs,6);
 assert.deepEqual(T.nativePairs(s.reading,['all'],['BBB']),[['Alpha','Beta'],['Rest of World','Beta']]);
});
test('atomic sector groups are included once and cannot be partially selected',()=>{
 const s=catalogue();A.attachTradeSector(s,{id:'sample',section:'A+C',value_added_trade:{total:block(2),domestic:block(1.5),foreign:block(.5)}});A.attachTradeSector(s,{id:'sample',section:'B',value_added_trade:{total:block(2),domestic:block(1.5),foreign:block(.5)}});
 assert.deepEqual(T.sectorSelection(s.reading,['C','A','A']).groups,['A+C']);
 assert.match(T.aggregate(s.reading,['AAA'],['BBB'],'all',{section:'A'}).reason,/indivisible.*A\+C/);
 assert.equal(T.aggregate(s.reading,['AAA'],['BBB'],'all',{section:['A','B','C']}).value.total,6);
 assert.equal(T.aggregate(s.reading,['AAA'],['BBB'],'all',{section:['A','C'],tradeOrigin:'foreign'}).value.total,.75);
 assert.match(T.sectorSelection(s.reading,'D').reason,/No collected sector coverage/);
});
test('embodied CSV carries selected use, origin, sector, valuation, year and GWP without Comtrade fields',()=>{
 const s=catalogue('ghg_trade'),selection={...state,metric:'ghg_trade'},rows=T.observations([s],selection,M);rows[0].gwp_basis='AR5';rows[0].gwp_horizon=100;
 const [csv]=A.exportTradeRows(rows,selection,T);assert.equal(csv.gwp_basis,'AR5');assert.equal(csv.gwp_horizon,100);assert.equal(csv.year,2022);assert.equal(csv.displayed_t_co2eq,30);assert.equal(csv.domestic_pairs_excluded,true);assert.equal(csv.use,'total');assert.ok(!Object.keys(csv).some(k=>k.includes('comtrade')));
 const [va]=A.exportTradeRows(T.observations([catalogue()],state,M),state,T);assert.equal(va.usd_per_native_currency,.5);assert.equal(va.native_currency,'EUR');assert.equal(va.source_price_basis,'Current prices');assert.equal(va.value_added_origin,'total');
});
test('legacy GHG arrays remain unchanged when a new reading adds value-added content',()=>{
 const update={...data};delete update.ghg_trade;
 const [merged]=A.mergeTradeReadings([data],[update]);assert.deepEqual(merged.ghg_trade,data.ghg_trade);assert.equal(merged.value_added_trade,update.value_added_trade);
 assert.throws(()=>A.mergeTradeReadings([data],[{...update,regions:[...regions].reverse()}]),/axes differ/);
});
test('embodied schematic retains the complete IOT or SUT system for final-only flows',()=>{
 assert.deepEqual(P.method({...state,tradeUse:'final'},'IOT').inputs.map(x=>x.symbol),['V','Z','Y']);
 assert.deepEqual(P.method({...state,metric:'ghg_trade',tradeUse:'final'},'SUT').inputs.map(x=>x.symbol),['Ea','Ec','S','U','Yc']);
 assert.match(P.method(state).meaning,/relative to the exporter/);
});
test('fresh footprint totals and sector slices share native consumer axes and explicit direct-emission notes',()=>{
 const old={id:'sample',recipe,regions:regions.map(r=>({...r,accounts:{ghg_footprint:[999,999]}})),metrics:['ghg_footprint'],components:{ghg_footprint:['Domestic','Foreign']},notes:{ghg_footprint:'Old totals'}};
 const merged=A.mergeCountryAccounts(old,{...data,accounts:{ghg_footprint:[[20,10],[40,30],[60,50]]},notes:{ghg_footprint:'Whole footprint includes direct final users.'}});
 const snapshot=A.attach({recipe,regions,summary_only:true},merged);
 A.attachAccountSector(snapshot,{section:'A+C',accounts:{ghg_footprint:[[2,1],[4,3],[6,5]]},notes:{ghg_footprint:'Supplying sectors; direct final-user emissions remain separate.'}});
 A.attachAccountSector(snapshot,{section:'B',accounts:{ghg_footprint:[[2,1],[4,3],[6,5]]},notes:{ghg_footprint:'Supplying sectors; direct final-user emissions remain separate.'}});
 const selection={...state,metric:'ghg_footprint',country:'BBB',accountComponent:'total',perCapita:false};
 const totals=A.observations([snapshot],selection,wb,M,T);assert.equal(totals.reduce((n,r)=>n+r.value,0),.07);
 const sectors=A.observations([snapshot],{...selection,section:['A','C']},wb,M,T);assert.equal(sectors.reduce((n,r)=>n+r.value,0),.007);assert.match(sectors[0].note,/direct final-user emissions remain separate/);
 const partial=A.observations([snapshot],{...selection,section:'A'},wb,M,T);assert.ok(partial.every(r=>r.value===null));assert.match(partial[0].note,/indivisible/);
});

test('embodied chart adapters reject monetary reference overlays even with stale proxy state',()=>{
 const C=require('../../doc/source/_static/economy-charts.js'),TC=require('../../doc/source/_static/trade-charts.js');
 for(const metric of ['ghg_trade','value_added_trade']){
  const selection={...state,metric,tradeScope:'goods_proxy'},snapshot=catalogue(metric),rows=T.observations([snapshot],{...selection,tradeScope:'all'},M);
  const figure=TC.figure(rows,[{year:2022,lower:1e12,upper:2e12,exports:{value:1e12},imports:{value:2e12},complete:true}],{state:selection,years:[2022],nativeUnit:metric==='ghg_trade'?'t CO₂eq':'current US$',colors:{reference:'#999',palette:['#339','#f80']},catalogue:[M.seriesKey(snapshot.recipe)]},C);
  assert.equal(figure.referenceIndices.length,0);assert.ok(!figure.data.some(t=>t.meta?.tradeReference));assert.ok(figure.layout.yaxis.range[1]<1e6);
 }
});

test('production common-sector comparisons withhold partial groups and retain native SUT emission axes',()=>{
 const s={recipe:{...recipe,sectors:['combined','mining','agriculture'],ghg_sectors:['commodity combined','commodity mining']}};
 const mapping={classification_id:'nace-2-common',sections:classification.sections,entries:[{index:0,native_label:'combined',section:'A+C',section_codes:['A','C']},{index:1,native_label:'mining',section:'B',section_codes:['B']},{index:2,native_label:'agriculture',section:'A',section_codes:['A']}],additional_mappings:[{classification_id:'nace-2-common',entries:[{index:0,native_label:'commodity combined',section:'A+C',section_codes:['A','C']},{index:1,native_label:'commodity mining',section:'B',section_codes:['B']}]}]};
 assert.deepEqual(M.sectorIndices(s,mapping,'A'),[]);assert.match(M.sectorSelection(s,mapping,'A').reason,/indivisible/);
 assert.deepEqual(M.sectorIndices(s,mapping,'A+C'),[0,2]);assert.deepEqual(M.sectorIndices(s,mapping,'A+C','ghg'),[0]);
 assert.deepEqual(M.sectorIndices(s,mapping,'B','ghg'),[1]);assert.match(M.sectorSelection(s,mapping,'D').reason,/No reviewed common-sector coverage/);
 assert.deepEqual(T.sectorSelection(catalogue().reading,['A+C','B']).groups,['A+C','B']);
});

test('downloaded embodied selections freeze origin component, native sector labels and exact compute options',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 const snapshot=catalogue(),selection={...state,section:['A','C'],tradeOrigin:'foreign'};A.attachTradeSector(snapshot,{id:'sample',section:'A+C',value_added_trade:{total:block(2),domestic:block(1.5),foreign:block(.5)}});
 const rows=T.observations([snapshot],selection,M),result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{},wb,M,asset:x=>x,getJSON:async name=>{assert.equal(name,'reproduce/manifest.json');return {files:[]};}});
 const decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read(next(n for n in z.namelist() if n.startswith("selections/"))).decode())'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);
 const config=JSON.parse(decoded.stdout);assert.equal(config.metric,'value_added_trade');assert.equal(config.selection.tradeOrigin,'foreign');assert.deepEqual(config.sector_labels,['combined agriculture/manufacturing']);assert.equal(config.native_to_usd,.5);assert.deepEqual(config.recipe.trade_compute,{solver:'scipy',strategy:'iterative',refinement_steps:1});assert.deepEqual(config.native_pairs,[['Alpha','Beta']]);assert.equal(config.points[0].expected_components.total,.75);
 const frozen=config.points[0].row;assert.equal(frozen.value_added_origin,'foreign');assert.equal(frozen.origins,'AAA');assert.equal(frozen.destinations,'BBB');assert.match(frozen.origin_destination_basis,/ISO3.*every native region/);assert.equal(frozen.domestic_pairs_excluded,true);assert.equal(frozen.use,'total');assert.equal(frozen.sectors,'A;C');assert.equal(frozen.sector_classification,'nace-2-common');assert.equal(frozen.native_currency,'EUR');assert.equal(frozen.usd_per_native_currency,.5);assert.equal(frozen.exchange_rate_year,2022);assert.equal(frozen.source_currency_scale,1e6);assert.equal(frozen.source_price_basis,'Current prices');assert.equal(frozen.gwp_basis,'');assert.equal(frozen.sector,rows[0].sector);assert.equal(frozen.value,null);assert.equal(frozen.intermediate,null);assert.equal(config.points[0].expected_value,rows[0].value);
});

test('common-sector definition references hydrate once with source evidence and SUT axes intact',()=>{
 const dictionary={definitions:{activity:{classification_id:'nace-2-common',dimension:'Activity',entries:[{native_label:'activity',index:0,section:'A',evidence:'ev',qualification:'qualified'}]},commodity:{classification_id:'nace-2-common',dimension:'Commodity',entries:[{native_label:'commodity',index:0,section:'A'}]}},mappings:{one:{definition:'activity',family:'SAMPLE',additional_mappings:[{definition:'commodity'}]},two:{definition:'activity',family:'SAMPLE'}},evidence:{ev:{source_url:'https://example.test/source'}},qualifications:{qualified:'Native group retained.'}};
 const mappings=M.commonMappings(dictionary);assert.equal(mappings.one.dimension,'Activity');assert.equal(mappings.one.additional_mappings[0].dimension,'Commodity');assert.equal(mappings.one.entries,mappings.two.entries);assert.deepEqual(mappings.one.entries[0].evidence,{source_url:'https://example.test/source'});assert.equal(mappings.one.entries[0].qualification,'Native group retained.');
 assert.throws(()=>M.commonMappings({...dictionary,mappings:{bad:{definition:'missing'}}}),/Unknown common-sector definition/);
});

test('unassigned production categories stay separately measurable and qualify named portions',()=>{
 const snapshot={recipe:{sectors:['agriculture','unspecified']}},mapping={classification_id:'nace-2-common',entries:[{index:0,native_label:'agriculture',section:'A',section_codes:['A']},{index:1,native_label:'unspecified',section:'unassigned',section_codes:[]}]};
 assert.deepEqual(M.sectorIndices(snapshot,mapping,'unassigned'),[1]);assert.deepEqual(M.sectorIndices(snapshot,mapping,'all'),[0,1]);assert.match(M.sectorSelection(snapshot,mapping,'A').note,/Identified mapped portion/);
});
test('monetary goods-proxy downloads retain the original reviewed mapping independently of new common controls',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 const snapshot=T.catalogue({datasets:[{id:'trade-sample',label:'EXIOBASE fixture',family:'EXIOBASE',version:'3.11.2',year:2022,format:'ixi',scopes:['all','goods_proxy']} ]})[0];snapshot.reading={id:'trade-sample',family:'EXIOBASE',version:'3.11.2',year:2022,regions,flows:{goods_proxy:block()},native_scale:1,usd_per_native_currency:1};
 const selection={...state,metric:'trade',families:['EXIOBASE'],tradeScope:'goods_proxy'},rows=T.observations([snapshot],selection,M);
 const result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{sample:{classification_id:'nace-2-common',entries:[{section:'A',native_label:'new-common-group'}]}},tradeMappings:{sample:{classification_id:'nace-1.1',entries:[{section:'D',native_label:'original-manufacturing'}]}},wb:{countries:{}},M,asset:x=>x,getJSON:async()=>({files:[]})});
 const decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read(next(n for n in z.namelist() if n.startswith("selections/"))).decode())'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);assert.deepEqual(JSON.parse(decoded.stdout).goods_labels,['original-manufacturing']);
});

test('a newly collected account identity retains direct component/category metadata without a legacy snapshot',()=>{
 const extension={...data,accounts:{gross_output:[[10],[20],[30]],final_demand:{total:[[8,2],[16,4],[24,6]]}},demand_groups:{total:['households'],households_npish:['households']},demand_schema_version:2,direct_final_user_emissions:[1,2,3]},merged=A.mergeCountryAccounts(null,extension);
 assert.deepEqual(merged.components.gross_output,['Total']);assert.deepEqual(merged.components.final_demand,['Domestic','Imported']);assert.deepEqual(merged.demand_groups,extension.demand_groups);assert.equal(merged.demand_schema_version,2);assert.deepEqual(merged.direct_final_user_emissions,[1,2,3]);assert.deepEqual(merged.regions[1].accounts.final_demand.total,[16,4]);
});

test('ADB selected downloads name the reviewed air-emissions companion and sanitize a private fallback',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 for(const extension of ['/path/to/same-year-Air-Emissions.xlsx','/private/source/air.xlsx']){
  const snapshot=catalogue('ghg_trade',{...data,recipe:{...recipe,source:'ADB',parser_options:{...recipe.parser_options,add_extensions:extension}}}),selection={...state,metric:'ghg_trade',families:['ADB']},rows=T.observations([snapshot],selection,M);
  const result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{},wb,M,asset:x=>x,getJSON:async()=>({files:[]})}),decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); c=json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/")))); p=json.loads(z.read("paths.json")); print(json.dumps({"paths":p[c["recipe"]["id"]],"recipe":c["recipe"]}))'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);const value=JSON.parse(decoded.stdout);assert.equal(value.paths.add_extensions,'/path/to/same-year-Air-Emissions.xlsx');assert.equal(value.recipe.parser_options.add_extensions,value.paths.add_extensions);assert.doesNotMatch(decoded.stdout,/private\/source/);
 }
});

test('recomputed GHG trade rows retain group/use/GWP metadata without a monetary conversion',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 const snapshot=catalogue('ghg_trade'),selection={...state,metric:'ghg_trade',origin:['all'],destination:['BBB'],tradeUse:'intermediate'},rows=T.observations([snapshot],selection,M);
 const result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{},wb,M,asset:x=>x,getJSON:async()=>({files:[]})}),decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(z.read(next(n for n in z.namelist() if n.startswith("selections/"))).decode())'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);const config=JSON.parse(decoded.stdout),row=config.points[0].row;
 assert.equal(row.indicator,'ghg_trade');assert.equal(row.origins,'all');assert.equal(row.destinations,'BBB');assert.equal(row.use,'intermediate');assert.equal(row.sectors,'all');assert.equal(row.value_added_origin,'');assert.equal(row.gwp_basis,'AR5');assert.equal(row.gwp_horizon,100);assert.equal(row.usd_per_native_currency,null);assert.equal(row.exchange_rate_year,null);assert.equal(row.source_currency,'EUR');assert.equal(row.native_unit,'t CO2eq');assert.equal(row.unit,rows[0].unit);assert.equal(row.sector,rows[0].sector);assert.deepEqual(config.points[0].expected_components,{intermediate:rows[0].intermediate,final:rows[0].final,total:rows[0].total});

});


test('EM embodied bundles preserve the reviewed CO2 companion filename',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 const snapshot=catalogue('ghg_trade',{...data,recipe:{...recipe,source:'EMERGING',parser_options:{...recipe.parser_options,co2_path:'/path/to/EM-E_CO2_2023.csv'}}}),selection={...state,metric:'ghg_trade',families:['EMERGING']},rows=T.observations([snapshot],selection,M);
 const result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{},wb,M,asset:x=>x,getJSON:async()=>({files:[]})}),decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); c=json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/")))); p=json.loads(z.read("paths.json")); print(json.dumps({"path":p[c["recipe"]["id"]]["co2_path"],"recipe":c["recipe"]["parser_options"]["co2_path"]}))'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);assert.deepEqual(JSON.parse(decoded.stdout),{path:'/path/to/EM-E_CO2_2023.csv',recipe:'/path/to/EM-E_CO2_2023.csv'});
});


test('selected VA trade downloads omit unused extensions while retaining the full source recipe',async t=>{
 const R=require('../../doc/source/_static/reproduction-download.js'),{spawnSync}=require('node:child_process'),previous=global.TradeModel;global.TradeModel=T;t.after(()=>{global.TradeModel=previous;});
 for(const source of ['ADB','WIOD','EXIOBASE']){
  const snapshot=catalogue('value_added_trade',{...data,recipe:{...recipe,source,parser_options:{...recipe.parser_options,add_extensions:'/path/to/reviewed-extension.xlsx'}}}),selection={...state,families:[source]},rows=T.observations([snapshot],selection,M);
  const result=await R.create({state:selection,rows,snapshots:[snapshot],mappings:{},wb,M,asset:x=>x,getJSON:async()=>({files:[]})}),decoded=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); c=json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/")))); p=json.loads(z.read("paths.json")); print(json.dumps({"paths":p[c["recipe"]["id"]],"recipe":c["recipe"]["parser_options"]}))'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);const resultData=JSON.parse(decoded.stdout);assert.deepEqual(resultData.paths,{path:'/path/to/source'});assert.equal(resultData.recipe.add_extensions,'/path/to/reviewed-extension.xlsx');
 }
});
