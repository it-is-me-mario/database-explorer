const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
global.MarioSourceRecipes=require('../../doc/source/_static/source-recipes.js');
global.MarioReproduction=require('../../doc/source/_static/reproduction-download.js');
const G=require('../../doc/source/_static/mario-code-guides.js');
const folder=path.resolve(__dirname,'../../doc/source/_static/data/embodied-trade');
const reading=id=>JSON.parse(fs.readFileSync(path.join(folder,id+'.json'))).recipe;
test('one Python guide per database combines years without chart machinery',async()=>{
 const first=reading('adb-2023-62-economies'),second={...first,id:'adb-2022',year:2022};
 const result=await G.create({snapshots:[{recipe:first},{recipe:second},{recipe:reading('wiod-2016-2014-sut')}],state:{metric:'gdp'},getJSON:()=>{throw Error('unexpected fetch');}});
 assert.deepEqual(result.files.map(f=>f.name).sort(),['adb.py','wiod.py']);
 assert.match(result.files[0].data,/YEARS = \[2022, 2023\]/);assert.match(result.files[0].data,/mario\.parse_adb\(/);assert.match(result.files[0].data,/db\.GDP\(\)/);
 for(const file of result.files)assert.doesNotMatch(file.data,/run_selection|selection.json|sys.path|recipes\.|manifest|Plotly|expected_value|hashlib/);
 const encoded=Buffer.from(await result.blob.arrayBuffer()).toString('base64');
 const names=JSON.parse(cp.execFileSync('python3',['-c','import base64,io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.argv[1]))); print(json.dumps(z.namelist()))',encoded],{encoding:'utf8'}));
 assert.deepEqual(names.sort(),['adb.py','wiod.py']);
});
test('all reviewed guides compile and use the public indicator APIs',()=>{
 let count=0;
 for(const entry of JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).readings){
  const r=reading(entry.id);
  const metrics=['gdp','value_added','gross_output','domestic_use','final_demand','trade','value_added_footprint','value_added_trade',...(r.ghg_usable!==false&&Object.keys(r.ghg_factors||{}).length?['ghg','ghg_footprint','ghg_trade']:[])];
  for(const metric of metrics){const script=G.render([r],{metric,country:'ITA'});cp.execFileSync('python3',['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:script});count++;}
 }
 assert.ok(count>=299);
 assert.match(G.render([reading('gloria-060-2025-sut')],{metric:'ghg_trade'}),/db\.calc_trades_content\(indicator="GHG"/);
 assert.match(G.render([reading('exiobase-3112-2024-ixi')],{metric:'value_added_trade'}),/db\.calc_trades_content\(indicator="total value added"/);
 assert.match(G.render([reading('wiod-2016-2014-sut')],{metric:'domestic_use'}),/db\.U[\s\S]*db\.Yc/);
});
