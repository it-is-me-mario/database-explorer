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
