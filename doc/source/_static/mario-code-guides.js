/* One readable MARIO API guide per database. No chart-reproduction payload. */
((global)=>{
 'use strict';
 const py=value=>global.MarioSourceRecipes.literal(value);
 const emissions=metric=>['ghg','ghg_footprint','ghg_trade'].includes(metric);
 function indicator(recipe,metric,region){
  const sut=recipe.table==='SUT',hybrid=recipe.parser_options?.unit==='Hybrid',Z=sut?'db.U':'db.Z',Y=sut?'db.Yc':'db.Y',F=sut?'db.Fc':'db.F',M=sut?'db.Mc':'db.M';
  const lines=[];
  if(emissions(metric)){
   if(!Object.keys(recipe.ghg_factors||{}).length)throw Error('This reading has no environmental characterisation recipe.');
   lines.push('# Characterise gases with the database profile bundled with MARIO.');
   lines.push('# Units and gas coverage follow that profile; source-characterised totals retain their basis.');
   if(recipe.source==='EXIOBASE'&&recipe.release!=='REX3')lines.push('# The built-in EXIOBASE profile covers combustion CO2, CH4 and N2O.');
   const report=/^AR[456]$/.test(recipe.gwp_basis||'')?recipe.gwp_basis:'AR6';
   lines.push('db.calc_ghg(ipcc_report='+py(report)+', time_horizon=100, label="GHG")','');
  }
  if(metric==='gdp')return ['# MARIO GDP in the database\'s native monetary unit.','result = db.GDP()'];
  if(metric==='value_added')return ['# Keep the income rows used for value added in this source.','VALUE_ADDED_ROWS = '+py(recipe.value_added_rows),`result = ${sut?'db.Va':'db.V'}.loc[VALUE_ADDED_ROWS].sum(axis=0, skipna=False)`,...(sut?['result = pd.concat([result, db.Vc.loc[VALUE_ADDED_ROWS].sum(axis=0, skipna=False)])']:[])];
  if(metric==='gross_output')return ['# Commodity output for a SUT; sector output for an IOT.',`result = ${sut?'db.Xc':'db.X'}`];
  if(metric==='trade')return hybrid?['# Physical outputs have different units; select one native commodity.','ITEM = db.get_index("Sector")[0]','result = db.calc_trades(item=ITEM, intermediate=True, final=True)']:['# Native MARIO trade accounting; toggle intermediate/final for each use.','result = db.calc_trades(intermediate=True, final=True)'];
  if(metric==='domestic_use')return [`REGION = ${py(region)}  # Native code; see db.get_index("Region").`,`intermediate = ${Z}`,`final = ${Y}`,'domestic_intermediate = intermediate.loc[','    intermediate.index.get_level_values(0) == REGION,','    intermediate.columns.get_level_values(0) == REGION,','].sum().sum()','domestic_final = final.loc[','    final.index.get_level_values(0) == REGION,','    final.columns.get_level_values(0) == REGION,','].sum().sum()','result = pd.Series({"Intermediate": domestic_intermediate, "Final": domestic_final})'];
  if(metric==='final_demand')return [`REGION = ${py(region)}  # Native destination code.`,`final = ${Y}`, 'demand = final.loc[:, final.columns.get_level_values(0) == REGION]','domestic = demand.loc[demand.index.get_level_values(0) == REGION]','imported = demand.loc[demand.index.get_level_values(0) != REGION]','result = pd.DataFrame({','    "Domestic": domestic.sum(axis=0).groupby(level=-1).sum(),','    "Imported": imported.sum(axis=0).groupby(level=-1).sum(),','})','# Rows retain the native final-demand categories.'];
  if(metric==='ghg')return [...lines,`production = ${sut?'pd.concat([db.Ea.loc["GHG"], db.Ec.loc["GHG"]])':'db.E.loc["GHG"]'}`, 'result = production.groupby(level=0).sum()','# Direct final-user emissions remain identifiable separately.','direct_final_users = db.EY.loc["GHG"].groupby(level=0).sum()'];
  if(metric==='value_added_footprint')return ['# M (IOT) or Mc (SUT) is value added embodied in final-demand products.','VALUE_ADDED_ROWS = '+py(recipe.value_added_rows),`result = ${M}.loc[VALUE_ADDED_ROWS]`,'# For totals by consuming region, apply the multipliers to regional final demand.',`final_by_region = ${Y}.T.groupby(level=0).sum().T`,`by_consumer = ${sut?'db.mc':'db.m'}.loc[VALUE_ADDED_ROWS] @ final_by_region`];
  if(metric==='ghg_footprint')return [...lines,'# F (IOT) or Fc (SUT) contains upstream emissions in final-demand products.',`result = ${F}.loc[["GHG"]]`,`final_by_region = ${Y}.T.groupby(level=0).sum().T`,`by_consumer = ${sut?'db.fc':'db.f'}.loc["GHG"] @ final_by_region`,'# Add direct final-user emissions once for the full consumption footprint.','by_consumer = by_consumer.add(db.EY.loc["GHG"].groupby(level=0).sum(), fill_value=0)'];
  if(metric==='ghg_trade')return [...lines,'# Direct plus upstream content in native MARIO trade accounting.','result = db.calc_trades_content(indicator="GHG", '+(hybrid?'item=db.get_index("Sector"), ':'')+'method="total")','# Gross trade can count upstream emissions at successive border crossings.'];
  if(metric==='value_added_trade')return ['# Direct plus upstream value added in native MARIO trade accounting.','result = db.calc_trades_content(indicator="total value added", '+(hybrid?'item=db.get_index("Sector"), ':'')+'method="total")','# To inspect the contributing production origins, use breakdown=True:', '# by_contributor = db.calc_trades_content("total value added", breakdown=True)', '# Domestic content is generated in the exporter; Foreign is generated elsewhere.', '# Repeated border crossings can count the same value added again.'];
  throw Error('No MARIO guide for '+metric);
 }
 function render(recipes,state){
  const source=recipes[0].source,groups=new Map();
  for(const r of recipes){
   const options={...r.parser_options};delete options.year;delete options.regions;delete options.calc_all;
   if(!emissions(state.metric)){delete options.add_extensions;delete options.co2_path;delete options.ghg_path;if(source==='EMERGING')options.load_co2=false;}
   const key=JSON.stringify([r.parser,r.release,r.table,options,r.ghg_factors,r.gwp_basis,r.value_added_rows,r.sectors]);
   if(!groups.has(key))groups.set(key,{recipe:r,options,years:[]});groups.get(key).years.push(r.year);
  }
  const lines=[`# ${source}: ${state.metric.replaceAll('_',' ')}`, '# MARIO API guide. Edit the local paths and run the cells below.','# Results use native units and geography; no chart, FX or reference data is reproduced.','# Install: pip install mariopy==1.3.4','from pathlib import Path','import pandas as pd','import mario',''];
  for(const {recipe:r,options,years} of groups.values()){
   const ys=[...new Set(years)].sort((a,b)=>a-b),opts={...options},variables=[];
   if(!r.parser||!/^parse_[a-z0-9_]+$/.test(r.parser))throw Error('No public parser is recorded for '+r.source);
   const system=r.id?.match(/-(ixi|pxp)$/)?.[1]||'';
   lines.push(`# %% ${r.release||source} · ${r.table||'IOT'} ${system} · parse and calculate`,'# Source: '+(r.source_url||''),'# Licence: '+(r.license_url||''));
   if(source==='GLORIA')lines.push('# Keep economic and satellite ZIPs alongside the matching GLORIA ReadMe.');
   if(source==='EMERGING')lines.push('# Use matching-year MAT and CO2 files; EMERGING-E also needs its Figure data workbook.');
   // Paths are editable examples; the guide deliberately has no manifest/config framework.
   const hasYear=['GLORIA','FIGARO','EMERGING','ADB','OECD'].includes(source)||r.parser==='parse_exiobase_rex';
   const figaroAnnual=source==='FIGARO'&&r.parser==='parse_figaro';
   if(figaroAnnual)lines.push('# Use one cache directory per year: SOURCE_PATH / "2024", etc.');
   if(hasYear){lines.push(`SOURCE_PATH = Path("/path/to/${source}/${figaroAnnual?'yearly_caches':r.release||'database'}")`,`YEARS = ${py(ys)}`);}
   else {lines.push('FILES = {',...ys.map(y=>`    ${y}: Path("/path/to/${source}/${r.release||'database'}/${y}${system?'_'+system:''}"),`),'}');}
   for(const [key,value] of Object.entries(opts)){
    if(key.endsWith('path')||key==='add_extensions'){
     const variable=key.toUpperCase();lines.push(`${variable} = Path(${py(typeof value==='string'&&value.startsWith('/path/to/')?value:'/path/to/'+key)})`);variables.push([key,variable]);delete opts[key];
    }
   }
   lines.push('','for year'+(hasYear?' in YEARS:':', source_path in FILES.items():'));
   const args=[`path=str(${figaroAnnual?'SOURCE_PATH / str(year)':hasYear?'SOURCE_PATH':'source_path'})`,'calc_all=False',...((hasYear||['parse_exiobase','parse_wiod'].includes(r.parser))?['year=year']:[]),...Object.entries(opts).map(([k,v])=>k+'='+py(v)),...variables.map(([key,v])=>key+'=str('+v+')')];
   lines.push(`    db = mario.${r.parser}(`,...args.map(a=>'        '+a+','),'    )','');
   const requested=['trade','ghg_trade','value_added_trade'].includes(state.metric)?(Array.isArray(state.origin)?state.origin[0]:state.origin):state.country;
   const region=r.regions?.find(x=>x.iso3===requested)?.label||r.regions?.[0]?.label||'YOUR_REGION';
   lines.push(...indicator(r,state.metric,region).map(line=>line?'    '+line:''),'','    # Save each year separately; inspect result interactively for further analysis.');
   const prefix=(source+'_'+(r.release||'database')+'_'+(r.table||'IOT')+'_'+system+'_'+state.metric).replace(/[^a-zA-Z0-9_-]/g,'_');
   lines.push(`    result.to_csv(f"${prefix}_{year}.csv")`);
   if(state.metric==='domestic_use')lines.push('    del intermediate, final');
   if(state.metric==='final_demand')lines.push('    del final, demand, domestic, imported');
   lines.push('    del db','');
  }
  return lines.join('\n')+'\n';
 }
 async function create({snapshots,state,getJSON}){
  const grouped=new Map(),seen=new Set();
  for(const snapshot of snapshots){
   let recipe=snapshot.account?.recipe||snapshot.recipe;
   if(!recipe?.parser){const id=snapshot.reading?.recipe_id||recipe?.id;if(!id)continue;recipe=(await getJSON('data/economy/'+id+'.json')).recipe;}
   if(!recipe?.parser)continue;
   const id=recipe.id||JSON.stringify(recipe);if(seen.has(id))continue;seen.add(id);
   if(!grouped.has(recipe.source))grouped.set(recipe.source,[]);grouped.get(recipe.source).push(recipe);
  }
  const files=[...grouped].map(([source,recipes])=>({name:source.toLowerCase().replace(/[^a-z0-9_-]/g,'_')+'.py',data:render(recipes,state)}));
  if(!files.length)throw Error('No parser recipe is available for the selected databases.');
  return {files,blob:global.MarioReproduction.zip(files),count:files.length};
 }
 const api={indicator,render,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioCodeGuides=api;
})(globalThis);
