const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../../doc/source/_static/comparison-guide.js');
const M=require('../../doc/source/_static/economy-model.js');
const recipe=(source,release,year=2022)=>({source,release,year,table:'IOT',parser_options:{unit:'Monetary',system:'ixi'}});
const snapshot=(source,release,year,availability)=>({metadata_only:true,recipe:recipe(source,release,year),regions:[],availability});
test('comparison curation keeps recent and structurally distinct EXIOBASE releases',()=>{
 const readings=['3.8.2','3.9.4','3.9.5','3.9.6','3.10.1','3.10.2','3.11.2','3.3.18','REX3'].map(r=>({recipe:recipe('EXIOBASE',r)}));
 readings.push({recipe:recipe('FIGARO','standard')});
 assert.deepEqual(P.curate(readings).map(s=>s.recipe.release),['3.8.2','3.10.2','3.11.2','3.3.18','REX3','standard']);
});
test('indicator choices use published availability without losing gaps inside an eligible series',()=>{
 const source=[snapshot('EXIOBASE','3.10.2',2022,{gdp:true,ghg:true}),snapshot('EXIOBASE','3.10.2',2023,{gdp:true,ghg:false}),snapshot('WIOD','2016',2014,{gdp:true,ghg:false})];
 assert.equal(P.available(source,{metric:'ghg'},M).length,1);
 assert.deepEqual(P.eligible(source,{metric:'ghg'},M).map(s=>s.recipe.year),[2022,2023]);
 assert.equal(P.available(source,{metric:'gdp'},M).length,3);
});
test('goods-proxy choices exclude readings whose collected scopes contain only all sectors',()=>{
 const source=[{trade:true,recipe:recipe('EXIOBASE','REX3'),scopes:['all']},{trade:true,recipe:recipe('EXIOBASE','3.11.2'),scopes:['all','goods_proxy']}];
 assert.equal(P.available(source,{metric:'trade',tradeScope:'all'},M).length,2);
 assert.equal(P.available(source,{metric:'trade',tradeScope:'goods_proxy'},M).length,1);
});
test('licence routing distinguishes EXIOBASE monetary, Hybrid, REX and FIGARO E3',()=>{
 assert.equal(P.licenceKey(recipe('EXIOBASE','REX3')),'exiobase-rex3');
 const r=recipe('EXIOBASE','3.3.18');r.parser_options.unit='Hybrid';assert.equal(P.licenceKey(r),'exiobase-hybrid');
 assert.equal(P.licenceKey(recipe('EXIOBASE','3.11.2')),'exiobase-monetary');
 assert.equal(P.licenceKey(recipe('FIGARO','E3')),'figaro-e3');
});
test('trade method diagrams use native intermediate/final blocks without a Leontief solve',()=>{
 for(const format of ['IOT','SUT'])for(const tradeUse of ['total','intermediate','final']){
  const d=P.method({metric:'trade',tradeUse,tradeScope:'all'},format),symbols=d.inputs.map(i=>i.symbol);
  assert.deepEqual(symbols,tradeUse==='intermediate'?[format==='SUT'?'U':'Z']:tradeUse==='final'?[format==='SUT'?'Yc':'Y']:[format==='SUT'?'U':'Z',format==='SUT'?'Yc':'Y']);
  assert.match(d.steps.join(' '),/exclude domestic pairs/);assert.doesNotMatch(d.steps.join(' '),/inverse|Leontief/);
 }
});
test('economic and emission diagrams retain distinct accounts, axes and source tax bridge',()=>{
 assert.deepEqual(P.method({metric:'value_added'},'SUT').inputs.map(x=>x.symbol),['Va']);
 assert.deepEqual(P.method({metric:'ghg',section:'all'},'SUT').inputs.map(x=>x.symbol),['Ea','EY']);
 assert.match(P.method({metric:'gdp'},'IOT').inputs.find(x=>x.symbol==='Tax bridge').detail,/source may supply separate valuation tables/);
 assert.match(P.method({metric:'ghg',section:'A'},'IOT').meaning,/households remain separate/);
 assert.deepEqual(P.method({metric:'ghg',section:'A'},'IOT').inputs.map(x=>x.symbol),['E']);
 assert.deepEqual(P.method({metric:'ghg',section:'households'},'SUT').inputs.map(x=>x.symbol),['EY']);
});

test('GDP proxies never display an invented product-tax bridge',()=>{
 const d=P.method({metric:'gdp'},'IOT',[{gdp_proxy:true}]);
 assert.deepEqual(d.inputs.map(x=>x.symbol),['V']);assert.match(d.meaning,/GDP proxy/);
 assert.equal(P.method({metric:'gdp'},'IOT',[{gdp_proxy:true},{gdp_bridge_verified:true}]).inputs.length,2);
 assert.match(P.method({metric:'ghg',section:['A','households']},'SUT').meaning,/Selected producers and direct final-demand/);
});


test('comparison keeps only the Regular OECD ICIO edition across observation types',()=>{
 const readings=['Regular','Extended'].flatMap(release=>[1995,2022].map(year=>({recipe:{...recipe('OECD',release,year),parser_options:{dataset:'ICIO'}},availability:{gdp:true},trade:true,account:{metrics:['gross_output','value_added_footprint']}})));
 const selected=P.curate(readings);
 assert.equal(selected.length,2);
 assert.ok(selected.every(s=>s.recipe.release==='Regular'));
 assert.deepEqual(selected.map(s=>s.recipe.year),[1995,2022]);
 const T=require('../../doc/source/_static/trade-model.js');
 const manifest=require('../../doc/source/_static/data/trade/manifest.json');
 const monetary=P.curate(T.catalogue(manifest)).filter(s=>s.recipe.source==='OECD');
 assert.equal(monetary.length,28);assert.ok(monetary.every(s=>s.recipe.release==='Regular'));assert.ok(monetary.every(s=>M.version(s.recipe)==='Regular'));
});
