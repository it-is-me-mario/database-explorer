const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const R=require('../../doc/source/_static/source-recipes.js'),P=require('../../doc/source/_static/comparison-guide.js'),M=require('../../doc/source/_static/economy-model.js');
const base=path.resolve(__dirname,'../../doc/source/_static/reproduce');
const template=fs.readFileSync(path.join(base,'source-recipe.template.txt'),'utf8').replace('__CATEGORY_HELPERS__',fs.readFileSync(path.join(base,'recipes/indicators/demand_categories.py'),'utf8')).replace('__ACCOUNT_HELPERS__',fs.readFileSync(path.join(base,'recipes/indicators/public_accounts.py'),'utf8').replace('from .demand_categories import classify',''));
test('source download exposes actual parser and native indicator cells without explorer imports',()=>{
 for(const [source,parser,table,options] of [['WIOD','parse_wiod','SUT',{table:'SUT',year:2000,add_extensions:'/private/source/SEA.xlsx'}],['EMERGING','parse_emerging','IOT',{variant:'E',year:2018,regions:['China'],load_co2:false}]]){
  const script=R.render(template,{id:'test',source,parser,year:2000,table,parser_options:options,currency_scale:1e6,value_added_rows:['value added'],ghg_factors:{}});
  assert.match(script,new RegExp('db = mario\\.'+parser));assert.match(script,/# %% Gross output/);assert.match(script,/x = require_finite\(db\.query/);assert.match(script,/# %% Domestic use/);assert.match(script,/# %% Final demand/);assert.match(script,/common_categories = \["total", "households_npish"/);assert.match(script,/NPISH coverage is undocumented/);assert.match(script,/calc_m_from_z/);assert.doesNotMatch(script,/from recipes|\/private\/source|add_extensions=str|ADD_EXTENSIONS =/);
  const result=spawnSync('python3',['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:script,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const notebook=JSON.parse(R.notebook(script));assert.equal(notebook.nbformat,4);assert.equal(notebook.cells.filter(c=>c.cell_type==='code').length,10);assert.ok(notebook.cells.filter(c=>c.cell_type==='code').every(c=>c.outputs.length===0));
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
