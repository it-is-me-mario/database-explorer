/* Transparent cell-based MARIO scripts; source matrices remain local. */
((global)=>{
 'use strict';
 function literal(value){
  if(value===null||value===undefined)return 'None';
  if(value===true)return 'True';if(value===false)return 'False';
  if(typeof value==='string')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(literal).join(', ')+']';
  if(typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>literal(k)+': '+literal(v)).join(', ' )+'}';
  if(!Number.isFinite(value))throw Error('Non-finite recipe constant');return String(value);
 }
 function render(template,recipe){
  const hasGHG=Object.keys(recipe.ghg_factors||{}).length>0&&recipe.ghg_usable!==false;
  const options={...recipe.parser_options},paths=['SOURCE_PATH = Path("/path/to/source")'];
  // Account scripts require all nodes, even when the downloaded chart selects countries.
  delete options.regions;delete options.calc_all;
  if(recipe.source==='EMERGING'){options.load_co2=hasGHG;if(!hasGHG)delete options.co2_path;}
  if(['ADB','WIOD','EXIOBASE'].includes(recipe.source)&&!hasGHG)delete options.add_extensions;
  for(const key of Object.keys(options))if(key.endsWith('path')||key==='add_extensions'){
   const variable=key.toUpperCase();paths.push(variable+' = Path('+literal('/path/to/'+key)+')');options[key]={pathVariable:variable};
  }
  const argumentsText=Object.entries(options).map(([k,v])=>k+'='+(v&&typeof v==='object'&&v.pathVariable?'str('+v.pathVariable+')':literal(v)));
  const parser='db = mario.'+recipe.parser+'(path=str(SOURCE_PATH), calc_all=False'+(argumentsText.length?',\n    '+argumentsText.join(',\n    '):'')+')';
  const constants=Object.fromEntries(['id','source','year','table','currency_scale','value_added_rows','ghg_factors','ghg_usable','ghg_note','final_demand_emissions_loaded','demand_category_policy','footprint_compute'].filter(k=>recipe[k]!==undefined).map(k=>[k,recipe[k]]));
  const units=new Set(Object.entries(recipe.expected_units||{}).filter(([name])=>['Sector','Activity','Commodity'].includes(name)).flatMap(([,items])=>Object.values(items)));
  if(recipe.native_monetary_unit)constants.native_monetary_unit=recipe.native_monetary_unit;else if(units.size===1)constants.native_monetary_unit=[...units][0];
  if(!constants.currency_scale||!constants.value_added_rows?.length)throw Error('This reading has no reviewed native account recipe');
  const replacements={SOURCE_URL:recipe.source_url||'',ATTRIBUTION:recipe.attribution||'',LICENSE_URL:recipe.license_url||'',PATHS:paths.join('\n'),RECIPE:literal(constants),PARSER:parser,OUTPUT:literal('results_'+recipe.id.replace(/[^a-zA-Z0-9_-]/g,'_'))};
  return template.replace(/__(SOURCE_URL|ATTRIBUTION|LICENSE_URL|PATHS|RECIPE|PARSER|OUTPUT)__/g,(_,key)=>replacements[key]);
 }
 function notebook(script){
  const cells=script.split(/^# %% /m).filter(Boolean).map(text=>{const end=text.indexOf('\n'),title=text.slice(0,end),body=text.slice(end+1);return [{cell_type:'markdown',metadata:{},source:['## '+title+'\n']},{cell_type:'code',metadata:{},execution_count:null,outputs:[],source:body.match(/.*(?:\n|$)/g).filter(Boolean)}];}).flat();
  return JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.12'}},cells},null,2)+'\n';
 }
 const api={literal,render,notebook};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioSourceRecipes=api;
})(globalThis);
