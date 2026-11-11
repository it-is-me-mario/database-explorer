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
 assert.match(G.render([reading('exiobase-3112-2024-ixi')],{metric:'value_added_trade'}),/db\.calc_trades_content\(indicator=row/);
 assert.match(G.render([reading('wiod-2016-2014-sut')],{metric:'domestic_use'}),/db\.U[\s\S]*db\.Yc/);
});

test('FIGARO annual guides select each year directory and keep E3 archive roots separate',()=>{
 const r=reading('figaro-2024-sut'),historical={...r,id:'figaro-2010-sut',year:2010};
 const script=G.render([r,historical],{metric:'trade'});
 assert.match(script,/YEARS = \[2010, 2024\]/);assert.match(script,/path=str\(SOURCE_PATH \/ str\(year\)\)/);
 const e3=G.render([reading('figaro-e3-2015-sut')],{metric:'trade'});
 assert.match(e3,/mario\.parse_figaro_e3\(/);assert.match(e3,/path=str\(SOURCE_PATH\)/);assert.doesNotMatch(e3,/SOURCE_PATH \/ str\(year\)/);
});

test('ADB temporal GHG guides select matching-year emissions inside each loop',()=>{
 const r=reading('adb-2022-62-economies'),earlier={...r,id:'adb-2017-62-economies',year:2017};
 const s=G.render([earlier,r],{metric:'ghg_trade'});assert.match(s,/YEARS = \[2017, 2022\]/);
 assert.match(s,/AIR_EMISSIONS_PATH \/ f"\{year\} EE-MRIOT \(Air Emissions\).xlsx"/);assert.doesNotMatch(s,/ADD_EXTENSIONS = Path/);
 assert.doesNotMatch(G.render([r],{metric:'value_added_trade'}),/AIR_EMISSIONS_PATH|add_extensions=/);
});

test('EMERGING benchmark guides keep observed years and select matching CO2 companions',()=>{
 const latest=reading('emerging-22-2023'),recipes=[2015,2018,2021,2023].map(year=>({...latest,id:'emerging-22-'+year,year,parser_options:{...latest.parser_options,year,co2_path:'/path/to/EMERGING_CO2_'+year+'.mat'}}));
 const s=G.render(recipes,{metric:'ghg_trade'});assert.match(s,/YEARS = \[2015, 2018, 2021, 2023\]/);
 assert.equal((s.match(/mario\.parse_emerging\(/g)||[]).length,1);assert.match(s,/co2_path=str\(SOURCE_PATH \/ f"EMERGING_CO2_\{year\}.mat"\)/);
 assert.ok(s.indexOf('mario.set_compute_method("solve")')>s.indexOf('db = mario.parse_emerging('));assert.match(s,/mario\.set_linear_strategy\("iterative"\)/);assert.match(s,/fossil CO2 only/);
 assert.doesNotMatch(s,/range\(/);assert.doesNotMatch(G.render(recipes,{metric:'value_added_trade'}),/co2_path=str/);
});


test('EXIOBASE history guides select annual archives and reviewed value-added rows',()=>{
 const latest=reading('exiobase-3112-2024-ixi');
 const history={...latest,id:'exiobase-3112-1995-ixi',year:1995};
 const script=G.render([history,latest],{metric:'value_added_trade'});
 assert.match(script,/YEARS = \[1995, 2024\]/);
 assert.match(script,/path=str\(SOURCE_PATH \/ f"IOT_\{year\}_ixi\.zip"\)/);
 assert.doesNotMatch(script,/FILES =/);
 assert.match(script,/for row in VALUE_ADDED_ROWS/);
 assert.doesNotMatch(script,/Taxes less subsidies on products purchased: Total/);
 for(const row of latest.value_added_rows)assert.ok(script.includes(row));
 const product=reading('exiobase-3112-2024-pxp');
 assert.match(G.render([product],{metric:'value_added_trade'}),/IOT_\{year\}_pxp\.zip/);
});
