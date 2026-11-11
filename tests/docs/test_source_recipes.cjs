const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const R=require('../../doc/source/_static/source-recipes.js'),P=require('../../doc/source/_static/comparison-guide.js'),M=require('../../doc/source/_static/economy-model.js');
const base=path.resolve(__dirname,'../../doc/source/_static/reproduce');
const template=fs.readFileSync(path.join(base,'source-recipe.template.txt'),'utf8').replace('__CATEGORY_HELPERS__',fs.readFileSync(path.join(base,'recipes/indicators/demand_categories.py'),'utf8')).replace('__ACCOUNT_HELPERS__',fs.readFileSync(path.join(base,'recipes/indicators/public_accounts.py'),'utf8').replace('from .demand_categories import classify',''));
test('source download exposes actual parser and native indicator cells without explorer imports',()=>{
 for(const [source,parser,table,options] of [['WIOD','parse_wiod','SUT',{table:'SUT',year:2000,add_extensions:'/private/source/SEA.xlsx'}],['EMERGING','parse_emerging','IOT',{variant:'E',year:2018,regions:['China'],load_co2:false}]]){
  const script=R.render(template,{id:'test',source,parser,year:2000,table,parser_options:options,currency_scale:1e6,value_added_rows:['value added'],ghg_factors:{}});
  assert.match(script,new RegExp('db = mario\\.'+parser));assert.match(script,/# %% Gross output/);assert.match(script,/x = require_finite\(db\.query/);assert.match(script,/# %% Domestic use/);assert.match(script,/# %% Final demand/);assert.match(script,/common_categories = \["total", "households_npish"/);assert.match(script,/NPISH coverage is undocumented/);assert.match(script,/calc_m_from_z/);assert.doesNotMatch(script,/from recipes|\/private\/source|add_extensions=str|ADD_EXTENSIONS =/);
  const result=spawnSync('python3',['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:script,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const notebook=JSON.parse(R.notebook(script));assert.equal(notebook.nbformat,4);assert.equal(notebook.cells.filter(c=>c.cell_type==='code').length,12);assert.ok(notebook.cells.filter(c=>c.cell_type==='code').every(c=>c.outputs.length===0));
 }
});
test('common final-demand categories filter unavailable sources without inventing NPISH',()=>{
 const snapshot=(id,groups)=>({recipe:{id,source:id,year:2022,table:'IOT'},metadata_only:true,availability:{final_demand:true},account:{metrics:['final_demand'],demand_groups:groups},regions:[]});
 const e=snapshot('EMERGING',{total:['household','government','capital'],households_npish:['household'],government:['government'],capital_formation:['capital']}),o=snapshot('OECD',{total:['HFCE','NPISH','GGFC','GFCF','INVNT'],households_npish:['HFCE','NPISH'],capital_formation:['GFCF','INVNT']});
 assert.equal(P.available([e,o],{metric:'final_demand',demandGroup:'capital_formation'},M).length,2);
 assert.equal(P.available([e,o],{metric:'final_demand',demandGroup:'households_npish'},M).length,2);
 assert.equal(P.available([e,o],{metric:'final_demand',demandGroup:'npish'},M).length,0);
 assert.deepEqual(P.method({metric:'gross_output'},'SUT').inputs.map(x=>x.symbol),['Xc']);
 const method=P.method({metric:'value_added_footprint'},'SUT');assert.deepEqual(method.inputs.map(x=>x.symbol),['Va','Vc','S','U','Yc']);assert.match(method.formula,/va · s \+ vc/);
});

test('legacy hybrid source recipes disable mixed-unit direct sums and withhold incompatible SUT upstream allocation',()=>{
 const recipe={id:'hybrid',source:'EXIOBASE',parser:'parse_exiobase',year:2011,table:'SUT',parser_options:{table:'SUT',unit:'Hybrid'},currency:'EUR',currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1},gwp_basis:'AR5',gwp_horizon:100};
 const script=R.render('__RECIPE__',recipe);assert.match(script,/"direct_account_usable": False/);assert.match(script,/"upstream_account_usable": False/);assert.match(script,/co-produce outputs in incompatible units/);assert.match(script,/"gwp_basis": "AR5"/);assert.match(script,/"currency": "EUR"/);
 const iot=R.render('__RECIPE__',{...recipe,table:'IOT',parser_options:{table:'IOT',unit:'Hybrid'}});assert.match(iot,/"direct_account_usable": False/);assert.doesNotMatch(iot,/"upstream_account_usable": False/);
 const reviewed=R.render('__RECIPE__',{...recipe,upstream_account_usable:true});assert.match(reviewed,/"upstream_account_usable": True/);assert.doesNotMatch(reviewed,/Upstream allocation is unavailable/);
});

test('standalone source cells preserve reviewed source-specific companion placeholders',()=>{
 const script=R.render('__PATHS__',{id:'adb',source:'ADB',parser:'parse_adb',year:2023,table:'IOT',parser_options:{add_extensions:'/path/to/same-year-Air-Emissions.xlsx'},currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1}});assert.match(script,/ADD_EXTENSIONS = Path\("\/path\/to\/same-year-Air-Emissions.xlsx"\)/);
});


test('EM source cells require an explicit CO2 companion only when GHG is available',()=>{
 const recipe={id:'em',source:'EMERGING',parser:'parse_emerging',year:2023,table:'IOT',parser_options:{year:2023},currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1}};
 const fallback=R.render('__PATHS__\n__PARSER__',recipe);assert.match(fallback,/CO2_PATH = Path\("\/path\/to\/matching\/CO2-companion"\)/);assert.match(fallback,/co2_path=str\(CO2_PATH\)/);assert.match(fallback,/load_co2=True/);
 const reviewed=R.render('__PATHS__',{...recipe,parser_options:{...recipe.parser_options,co2_path:'/path/to/EM-E_CO2_2023.csv'}});assert.match(reviewed,/EM-E_CO2_2023.csv/);
 const unavailable=R.render('__PATHS__\n__PARSER__',{...recipe,ghg_usable:false,parser_options:{...recipe.parser_options,co2_path:'/path/to/EM-E_CO2_2023.csv'}});assert.doesNotMatch(unavailable,/CO2_PATH|co2_path/);assert.match(unavailable,/load_co2=False/);
});


test('source input cells expose exact portable companions and metadata boundaries without changing indicator calculations',()=>{
 const examples=[
  {source:'EMERGING',parser:'parse_emerging',files:[{name:'EMERGING_V2_2023_m.mat',role:'economic MATLAB input'},{name:'EMERGING_CO2_2023.mat',role:'matching CO2 companion'}],metadata_boundary:'Sector and region labels come from the economic MATLAB input. No optional labels workbook is present.',instructions:'Place the listed files together in a dedicated source directory.\nThe selected value-added runner does not require the CO2 companion; the full source companion does.'},
  {source:'EMERGING',parser:'parse_emerging',files:[{name:'EMERGING_E_2018.mat',role:'economic MATLAB input'},{name:'Figure data.xlsx',role:'native country ordering'},{name:'EMERGING_CO2_2018.mat',role:'matching CO2 companion'}],metadata_boundary:'Figure data.xlsx supplies the reviewed native ordering.',instructions:'Keep Figure data.xlsx beside the economic input for every indicator.'},
  {source:'GLORIA',parser:'parse_gloria',files:[{name:'GLORIA_MRIO.zip',role:'economic archive'},{name:'GLORIA_ReadMe.xlsx',role:'native metadata'},{name:'GLORIA_Satellite.zip',role:'environmental satellite archive'}],metadata_boundary:'Use the matching ReadMe workbook.',instructions:'Selected non-GHG accounts do not require the satellite archive, but do require the ReadMe workbook.'}
 ];
 for(const example of examples){
  const {source,parser,...input_layout}=example,recipe={id:'layout',source,parser,year:2023,table:'IOT',parser_options:{year:2023},currency_scale:1e6,value_added_rows:['income'],ghg_factors:{CO2:1}},layout={kind:'documented_inputs',...input_layout};
  const before=R.render(template,recipe),script=R.render(template,{...recipe,input_layout:layout}),cell=JSON.parse(R.notebook(script)).cells.find(c=>c.cell_type==='code').source.join('');
  assert.match(cell,/# Full-source companion inputs:/);for(const file of layout.files)assert.ok(cell.includes('# - '+file.name+' — '+file.role));assert.ok(cell.includes('# Metadata boundary: '+layout.metadata_boundary));for(const line of layout.instructions.split('\n'))assert.ok(cell.includes('# '+line));
  const compared=spawnSync('python3',['-c','import ast,json,sys; before,after=json.load(sys.stdin); assert ast.dump(ast.parse(before)) == ast.dump(ast.parse(after))'],{input:JSON.stringify([before.slice(before.indexOf('db = mario.')),script.slice(script.indexOf('db = mario.'))]),encoding:'utf8'});assert.equal(compared.status,0,compared.stderr);
  assert.doesNotMatch(script,/\/Users\/|\/private\//);
 }
 const recipe={id:'bad',source:'EMERGING',parser:'parse_emerging',currency_scale:1,value_added_rows:['income'],input_layout:{files:[{name:'/private/source/data.mat'}]}};
 assert.throws(()=>R.render('__PATHS__',recipe),/portable basenames/);
 assert.throws(()=>R.render('__PATHS__',{...recipe,input_layout:{files:[{name:'..\\data.mat'}]}}),/portable basenames/);
});
