const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const R=require('../../doc/source/_static/reproduction-download.js');
test('download archive preserves UTF-8 names, contents and CRC in a standard ZIP reader',async()=>{
 const blob=R.zip([{name:'recipes/source.py',data:'print("MARIO")\n'},{name:'selections/Italia_è.json',data:'{"value":null}\n'}]);
 const result=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))'],{input:Buffer.from(await blob.arrayBuffer())});
 assert.equal(result.status,0,result.stderr.toString());const files=JSON.parse(result.stdout);assert.equal(files['recipes/source.py'],'print("MARIO")\n');assert.equal(files['selections/Italia_è.json'],'{"value":null}\n');
 assert.throws(()=>R.zip([{name:'../private.py',data:'x'}]),/Invalid archive path/);
});
test('economic code selection retains explicit native geography and macrosector indices',()=>{
 const M=require('../../doc/source/_static/economy-model.js');
 const s={recipe:{year:2022,sectors:['goods','services'],source:'EXIOBASE'},regions:[{code:'CN',iso3:'CHN',kind:'country',name:'China'},{code:'ROW',kind:'aggregate',name:'RoW'}]};
 const state={metric:'value_added',country:'CHN',section:'C',perCapita:false},row={country:'CHN',sector:'C',value:35};
 const p=R.economicPoint(s,row,state,{entries:[{index:0,section:'C'}]},{},M);
 assert.deepEqual(p.region_codes,['CN']);assert.deepEqual(p.sector_indices,[0]);assert.equal(p.expected_value,35);assert.equal(p.row.value,null);
 const world=R.economicPoint(s,{country:'world',sector:'all',value:80},{...state,country:'world',section:'all'},null,{},M);assert.deepEqual(world.region_codes,['CN','ROW']);
});
test('Trade source companion retains the same reading footprint solver without adding selected Trade inputs',async t=>{
 const fs=require('fs'),path=require('path'),{createHash,webcrypto}=require('node:crypto');
 const M=require('../../doc/source/_static/economy-model.js'),T=require('../../doc/source/_static/trade-model.js'),S=require('../../doc/source/_static/source-recipes.js');
 const root=path.resolve(__dirname,'../../doc/source/_static'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const reading=read('data/trade/trade-emerging-22-2023-iot.json'),account=read('data/accounts/emerging-22-2023.json'),economy=read('data/economy/'+reading.recipe_id+'.json');
 const entry=read('data/trade/manifest.json').datasets.find(r=>r.id===reading.id),snapshot=T.catalogue({datasets:[entry]})[0];snapshot.reading=reading;
 const template=fs.readFileSync(path.join(root,'reproduce/source-recipe.template.txt'),'utf8').replace('__CATEGORY_HELPERS__',fs.readFileSync(path.join(root,'reproduce/recipes/indicators/demand_categories.py'),'utf8')).replace('__ACCOUNT_HELPERS__',fs.readFileSync(path.join(root,'reproduce/recipes/indicators/public_accounts.py'),'utf8').replace('from .demand_categories import classify',''));
 const manifest={files:[{name:'source-recipe.template.txt',path:'reproduce/source-recipe.template.txt',sha256:createHash('sha256').update(template).digest('hex')}]},requests=[];
 const previous={TradeModel:global.TradeModel,MarioSourceRecipes:global.MarioSourceRecipes};global.TradeModel=T;global.MarioSourceRecipes=S;
 t.after(()=>Object.assign(global,previous));if(!global.crypto)global.crypto=webcrypto;
 t.mock.method(global,'fetch',async url=>{assert.equal(url,'reproduce/source-recipe.template.txt');return new Response(template);});
 const state={metric:'trade',origin:['CHN'],destination:['ITA'],tradeUse:'total',tradeScope:'all'};
 const row={database:'EMERGING',version:reading.version,year:reading.year,series:M.seriesKey(snapshot.recipe),format:'IOT',value:1,intermediate:1,final:0,total:1};
 const result=await R.create({state,rows:[row],snapshots:[snapshot],accountsByID:new Map([[account.id,account]]),mappings:{},wb:{countries:{}},M,asset:x=>x,getJSON:async name=>{requests.push(name);if(name==='data/economy/'+reading.recipe_id+'.json')return economy;if(name==='reproduce/manifest.json')return manifest;throw Error('Unexpected extra request: '+name);}});
 const extracted=spawnSync('python3',['-c','import ast,io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); config=json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/")))); script=z.read(next(n for n in z.namelist() if n.startswith("source_") and n.endswith(".py"))).decode(); recipe=next(ast.literal_eval(n.value) for n in ast.parse(script).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="RECIPE" for t in n.targets)); print(json.dumps({"source_recipe":recipe,"selected_recipe":config["recipe"],"paths":json.loads(z.read("paths.json"))}))'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});
 assert.equal(extracted.status,0,extracted.stderr);const output=JSON.parse(extracted.stdout);
 assert.deepEqual(output.source_recipe.footprint_compute,{solver:'scipy',strategy:'iterative',refinement_steps:1});
 assert.deepEqual(output.selected_recipe.footprint_compute,economy.recipe.footprint_compute);
 assert.deepEqual(Object.keys(output.paths[snapshot.recipe.id]),['path']);
 assert.deepEqual(requests,['data/economy/'+reading.recipe_id+'.json','reproduce/manifest.json']);
 assert.equal(economy.recipe.footprint_compute,undefined);
 // A successful metric can predate a later collection with different options.
 const retained=structuredClone(account);retained.recipe.footprint_compute={solver:'scipy',strategy:'direct',refinement_steps:0};
 const economic={...economy,account:retained},accountState={metric:'ghg_footprint',country:'CHN',section:'all',perCapita:false};
 const accountRow={database:'EMERGING',year:2023,series:M.seriesKey(economic.recipe),country:'CHN',sector:'all',value:1};
 const metricResult=await R.create({state:accountState,rows:[accountRow],snapshots:[economic],accountsByID:new Map([[retained.id,retained]]),mappings:{},wb:{countries:{}},M,asset:x=>x,getJSON:async name=>{assert.equal(name,'reproduce/manifest.json');return manifest;}});
 const metricConfig=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); c=json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/")))); print(json.dumps(c["recipe"]["footprint_compute"]))'],{input:Buffer.from(await metricResult.blob.arrayBuffer()),encoding:'utf8'});
 assert.equal(metricConfig.status,0,metricConfig.stderr);assert.deepEqual(JSON.parse(metricConfig.stdout),{solver:'scipy',strategy:'iterative',refinement_steps:1});
});


test('downloaded embodied charts keep intermediate/final stacks without Comtrade references',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const html=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/reproduce/chart.template.txt'),'utf8'),code=html.match(/<script>\s*([\s\S]*)<\/script>/)[1];
 const C=require('../../doc/source/_static/economy-charts.js'),T=require('../../doc/source/_static/trade-charts.js');
 for(const metric of ['value_added_trade','ghg_trade']){
  const row={database:'SAMPLE',release:'1',version:'1',year:2022,series:'sample',country:'trade-group',country_name:'Selected pairs',sector:'all',intermediate:4,final:6,total:10,value:10};
  const options={state:{metric,tradeUse:'total',tradeScope:'all',families:['SAMPLE']},years:[2022],nativeUnit:metric==='ghg_trade'?'t CO₂eq':'current US$',colors:{palette:['blue'],ink:'black',background:'white',grid:'gray',reference:'orange'},width:900};
  const nodes={'#chart':{clientWidth:900,style:{}}},plots=[];
  vm.runInNewContext(code,{window:{MARIO_REPRODUCED:{view:'chart',rows:[row],options,references:[{year:2022,lower:99,upper:100}],sources:[],notes:[],image_notes:[],layout:{}}},document:{querySelector:id=>nodes[id]},MarioEconomyCharts:C,MarioTradeCharts:T,MarioFigureDownload:{withCredit:x=>x},ResizeObserver:class{observe(){}},Plotly:{react:(_node,data,layout)=>plots.push({data,layout})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(plots.length,1);assert.deepEqual(plots[0].data.map(t=>t.meta.tradeComponent),['intermediate','final']);assert.equal(plots[0].layout.barmode,'relative');assert.ok(plots[0].data.every(t=>!t.meta.tradeReference));
 }
});


test('reproduced chart headings wrap for the current width without restoring desktop geometry',()=>{
 const C=require('../../doc/source/_static/economy-charts.js');
 const base={height:460,margin:{l:76,r:22,t:36,b:95},xaxis:{tickangle:-90},legend:{orientation:'h'},annotations:[{text:'current width'}]};
 const saved={height:2000,margin:{t:900},xaxis:{tickangle:0},annotations:[],title:{text:'<b>Foreign value added embodied in gross trade · China &amp; Italy → Germany</b>',subtitle:{text:'2023 · Whole economy · Intermediate and final use<br>IPCC AR5 · GWP100'}},legend:{title:{text:'GHG conventions retain their source-specific qualifications and original attribution.'}}};
 const mobile=C.reproductionLayout(base,saved,326),desktop=C.reproductionLayout(base,saved,1100),flatten=s=>s.replace(/<br>/g,' ').replace(/<\/?b>/g,'');
 assert.equal(flatten(mobile.title.text),flatten(saved.title.text));assert.match(mobile.title.text,/<br>/);assert.match(mobile.title.subtitle.text,/<br>IPCC AR5 · GWP100$/);
 assert.equal(mobile.xaxis,base.xaxis);assert.equal(mobile.annotations,base.annotations);assert.equal(mobile.margin.l,base.margin.l);assert.ok(mobile.height<saved.height);assert.ok(mobile.margin.t>desktop.margin.t);assert.equal(mobile.title.pad.t,52);assert.equal(desktop.title.pad.t,18);assert.equal(base.height,460);
 assert.equal(flatten(mobile.legend.title.text),saved.legend.title.text);
});


test('downloaded charts recompute wrapping when their observed width changes',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),C=require('../../doc/source/_static/economy-charts.js'),T=require('../../doc/source/_static/trade-charts.js');
 const code=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/reproduce/chart.template.txt'),'utf8').match(/<script>\s*([\s\S]*)<\/script>/)[1];
 const node={clientWidth:1100,style:{}},plots=[],row={database:'ADB',release:'62 economies',version:'62 economies',year:2023,series:'adb',country:'trade-group',country_name:'China → Italy',sector:'all',value:10,intermediate:4,final:6,total:10};
 const options={state:{metric:'value_added_trade',tradeUse:'total',tradeScope:'all',families:['ADB']},years:[2023],nativeUnit:'current US$',colors:{palette:['blue'],ink:'black',background:'white',grid:'gray'}};let observed;
 vm.runInNewContext(code,{window:{MARIO_REPRODUCED:{view:'chart',rows:[row],options,references:[],sources:[],notes:[],image_notes:[],layout:{height:9999,title:{text:'<b>Foreign value added embodied in gross trade · China → Italy</b>',subtitle:{text:'2023 · All sectors'}}}}},document:{querySelector:()=>node},MarioEconomyCharts:C,MarioTradeCharts:T,MarioFigureDownload:{withCredit:x=>x},ResizeObserver:class{constructor(callback){observed=callback;}observe(){}},Plotly:{react:(_node,data,layout)=>plots.push({data,layout})}});
 await new Promise(resolve=>setImmediate(resolve));node.clientWidth=326;observed();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(plots.length,2);assert.doesNotMatch(plots[0].layout.title.text,/<br>/);assert.match(plots[1].layout.title.text,/<br>/);assert.ok(plots[1].layout.height<9999);assert.equal(plots[1].layout.title.pad.t,52);assert.deepEqual(plots[0].data.map(t=>t.y),plots[1].data.map(t=>t.y));
 observed();await new Promise(resolve=>setImmediate(resolve));assert.equal(plots.length,2,'height-only resize notifications do not redraw');
});


test('selected bundles retain reviewed input instructions while VA paths omit the full-source CO2 companion',async t=>{
 const fs=require('node:fs'),path=require('node:path'),{createHash,webcrypto}=require('node:crypto'),M=require('../../doc/source/_static/economy-model.js'),S=require('../../doc/source/_static/source-recipes.js');
 const input_layout={kind:'isolated_directory',bindings:{economic:'EMERGING_V2_2023_m.mat',co2:'EMERGING_CO2_2023.mat'},absent_roles:['labels','figure'],files:[{name:'EMERGING_V2_2023_m.mat',role:'economic MATLAB input'},{name:'EMERGING_CO2_2023.mat',role:'matching CO2 companion'}],metadata_boundary:'Labels are embedded in the economic MATLAB file; no optional labels workbook is present.',instructions:'Place these files together in a dedicated directory. The selected value-added runner does not require the CO2 companion; the full source companion does.'};
 const recipe={id:'em-layout',source:'EMERGING',release:'2.2',year:2023,table:'IOT',parser:'parse_emerging',parser_options:{year:2023,co2_path:'/path/to/EMERGING_CO2_2023.mat'},currency:'USD',currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1},input_layout};
 const snapshot={recipe,account:{recipe},regions:[{code:'CN',iso3:'CHN',name:'China',kind:'country'}]},row={database:'EMERGING',version:M.version(recipe),year:2023,country:'CHN',sector:'all',value:1};
 const sourceTemplate=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/reproduce/source-recipe.template.txt'),'utf8'),contents={'README.txt':'MARIO comparison reproduction\n','source-recipe.template.txt':sourceTemplate},manifest={files:Object.entries(contents).map(([name,text])=>({name,path:'reproduce/'+name,sha256:createHash('sha256').update(text).digest('hex')}))};
 const previous=global.MarioSourceRecipes;global.MarioSourceRecipes=S;t.after(()=>{global.MarioSourceRecipes=previous;});if(!global.crypto)global.crypto=webcrypto;
 t.mock.method(global,'fetch',async url=>new Response(contents[url.replace(/^reproduce\//,'')]));
 for(const metric of ['value_added_footprint','ghg_footprint']){
  const result=await R.create({state:{metric,country:'CHN',section:'all',perCapita:false},rows:[row],snapshots:[snapshot],mappings:{},wb:{countries:{}},M,asset:x=>x,getJSON:async name=>{assert.equal(name,'reproduce/manifest.json');return manifest;}});
  const extracted=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({"readme":z.read("README.txt").decode(),"paths":json.loads(z.read("paths.json")),"script":z.read(next(n for n in z.namelist() if n.startswith("source_") and n.endswith(".py"))).decode(),"config":json.loads(z.read(next(n for n in z.namelist() if n.startswith("selections/"))))}))'],{input:Buffer.from(await result.blob.arrayBuffer()),encoding:'utf8'});
  assert.equal(extracted.status,0,extracted.stderr);const output=JSON.parse(extracted.stdout);assert.match(output.readme,/^MARIO comparison reproduction/);assert.match(output.readme,/Full-source companion inputs:/);assert.ok(output.readme.includes(input_layout.metadata_boundary));assert.ok(output.readme.includes(input_layout.instructions));for(const file of input_layout.files){assert.ok(output.readme.includes(file.name));assert.ok(output.script.includes('# - '+file.name));}
  assert.deepEqual(output.config.recipe.input_layout,input_layout);assert.equal(output.paths['em-layout'].path,'/path/to/source');assert.equal(output.paths['em-layout'].co2_path,metric==='ghg_footprint'?'/path/to/EMERGING_CO2_2023.mat':undefined);assert.doesNotMatch(JSON.stringify(output),/\/Users\/|\/private\//);
 }
});


test('GLORIA compatibility verifies canonical checksums and changes only the reviewed invalid override',async()=>{
 const fs=require('node:fs'),path=require('node:path'),{createHash,webcrypto}=require('node:crypto');if(!global.crypto)global.crypto=webcrypto;
 const source=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/reproduce/recipes/run.py'),'utf8'),hash=text=>createHash('sha256').update(text).digest('hex'),item={name:'recipes/run.py',sha256:hash(source)},bytes=new TextEncoder().encode(source);
 await assert.rejects(R.verifiedDownloadFile({...item,sha256:'0'.repeat(64)},bytes),/Reproduction code changed during download/);
 const output=await R.verifiedDownloadFile(item,bytes),packaged=new TextDecoder().decode(output.data);
 assert.equal(output.compatibility.status,'applied');assert.equal(output.compatibility.canonical_sha256,hash(source));assert.equal(output.compatibility.result_sha256,hash(packaged));assert.match(packaged,/# Download compatibility: MARIO 1.3.4/);assert.doesNotMatch(packaged,/\['satellites'\]=False/);
 const result=spawnSync('python3',['-c',String.raw`
import ast,json,sys,types
source,packaged=json.load(sys.stdin)
line="        if recipe['source']=='GLORIA' and metric not in {'ghg_footprint','ghg_trade'}:recipe['parser_options']['satellites']=False\n"
assert source.count(line)==1
fixed=source.replace(line,'')
assert ast.dump(ast.parse(fixed))==ast.dump(ast.parse(packaged))
compute=next(n for n in ast.parse(packaged).body if isinstance(n,ast.FunctionDef) and n.name=='compute')
class ReachedParser(Exception): pass
forwarded=[]
def load_database(recipe,path):
    forwarded.append(recipe['parser_options'].copy())
    raise ReachedParser()
sys.modules['mario']=types.SimpleNamespace(__version__='1.3.4')
namespace={'load_database':load_database}
exec(compile(ast.Module(body=[compute],type_ignores=[]),'<downloaded runner>','exec'),namespace)
for metric in ['gross_output','domestic_use','final_demand','value_added_footprint','value_added_trade','ghg_footprint','ghg_trade']:
    config={'recipe':{'source':'GLORIA','parser_options':{'satellites':'Emissions'}},'metric':metric,'points':[{'available':True}]}
    try: namespace['compute'](config,'/path/to/source')
    except ReachedParser: pass
    else: raise AssertionError('Parser was not reached')
    assert forwarded[-1]['satellites']=='Emissions',metric
print('reviewed AST and parser options passed')
`],{input:JSON.stringify([source,packaged]),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const line="        if recipe['source']=='GLORIA' and metric not in {'ghg_footprint','ghg_trade'}:recipe['parser_options']['satellites']=False\n",fixed=source.replace(line,''),unchanged=await R.verifiedDownloadFile({...item,sha256:hash(fixed)},new TextEncoder().encode(fixed));
 assert.equal(unchanged.compatibility.status,'verified_unmodified');assert.equal(new TextDecoder().decode(unchanged.data),fixed);assert.equal(unchanged.compatibility.canonical_sha256,unchanged.compatibility.result_sha256);
 const unexpected=source.replace("['satellites']=False","['satellites']=[]");await assert.rejects(R.verifiedDownloadFile({...item,sha256:hash(unexpected)},new TextEncoder().encode(unexpected)),/reviewed compatibility transform needs an update/);
 const duplicate=source+line;await assert.rejects(R.verifiedDownloadFile({...item,sha256:hash(duplicate)},new TextEncoder().encode(duplicate)),/reviewed compatibility transform needs an update/);
});


test('every selected launcher imports the corrected packaged runner with an auditable compatibility receipt',async t=>{
 const fs=require('node:fs'),path=require('node:path'),{createHash,webcrypto}=require('node:crypto'),M=require('../../doc/source/_static/economy-model.js');if(!global.crypto)global.crypto=webcrypto;
 const root=path.resolve(__dirname,'../../doc/source/_static/reproduce'),contents=Object.fromEntries(['recipes/run.py','run_selection.py','README.txt'].map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')])),hash=text=>createHash('sha256').update(text).digest('hex'),manifest={files:Object.entries(contents).map(([name,text])=>({name,path:'reproduce/'+name,sha256:hash(text)}))};
 t.mock.method(global,'fetch',async url=>new Response(contents[url.replace(/^reproduce\//,'')]));
 const recipe={id:'gloria-download',source:'GLORIA',release:'060',year:2023,table:'IOT',parser_options:{satellites:'Emissions'}},snapshot={recipe,account:{recipe},regions:[{code:'CN',iso3:'CHN',name:'China',kind:'country'}]},row={database:'GLORIA',version:M.version(recipe),year:2023,country:'CHN',sector:'all',value:1};
 const payload={state:{metric:'value_added_footprint',country:'CHN',section:'all',perCapita:false},rows:[row],snapshots:[snapshot],mappings:{},wb:{countries:{}},M,asset:x=>x,getJSON:async name=>{assert.equal(name,'reproduce/manifest.json');return manifest;}};
 const output=await R.create(payload),parsed=spawnSync('python3',['-c',String.raw`
import ast,hashlib,io,json,sys,zipfile
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
receipt=json.loads(z.read('download-compatibility.json'))['files'][0]
assert receipt['path']=='recipes/run.py' and receipt['status']=='applied'
assert receipt['result_sha256']==hashlib.sha256(z.read(receipt['path'])).hexdigest()
assert 'download-compatibility.json' in z.read('README.txt').decode()
assert len([n for n in z.namelist() if n=='recipes/run.py'])==1
for name in ['run_selection.py',next(n for n in z.namelist() if n.startswith('run_gloria-download_'))]:
    imports=[n.module for n in ast.walk(ast.parse(z.read(name))) if isinstance(n,ast.ImportFrom)]
    assert 'recipes.run' in imports,name
print(json.dumps(receipt))
`],{input:Buffer.from(await output.blob.arrayBuffer()),encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);assert.equal(JSON.parse(parsed.stdout).canonical_sha256,hash(contents['recipes/run.py']));
 manifest.files.find(f=>f.name==='recipes/run.py').sha256='0'.repeat(64);await assert.rejects(R.create(payload),/Reproduction code changed during download/);
});
