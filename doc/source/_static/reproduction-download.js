/* Download the same small Python recipes used by collection, with a frozen selection. */
((global)=>{
 'use strict';
 const utf8=new TextEncoder();
 function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
 function zip(files){
  const chunks=[],directory=[];let offset=0;
  for(const file of files){
   if(file.name.startsWith('/')||file.name.split('/').includes('..'))throw Error('Invalid archive path');
   const name=utf8.encode(file.name),data=typeof file.data==='string'?utf8.encode(file.data):file.data,crc=crc32(data);
   const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
   h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
   const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
   chunks.push(header,data);directory.push(central);offset+=header.length+data.length;
  }
  const size=directory.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end],{type:'application/zip'});
 }
 const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const gloriaOverride="        if recipe['source']=='GLORIA' and metric not in {'ghg_footprint','ghg_trade'}:recipe['parser_options']['satellites']=False\n";
 const gloriaCompatibilityComment='        # Download compatibility: MARIO 1.3.4 requires the configured GLORIA satellite selector; False is invalid.\n';
 const reviewedRunHashes={canonical:'17da9fb6f220d78508eff55864031acd1216482c2983c463e488d51754f2a2e2',fixed:'cbcaba13adbfa7beaf5b83c5ed332bf144e7d9f1d097cb760c9619d18307fb34',packaged:'a611222042433ebf1423857d9f164c59ed196fff2097586c9765ce1db7fd9e80'};
 async function verifiedDownloadFile(item,bytes){
  const canonicalHash=await sha256(bytes);
  if(canonicalHash!==item.sha256)throw Error('Reproduction code changed during download. Reload the page.');
  if(item.name!=='recipes/run.py')return {data:bytes};
  let data=bytes,status='verified_unmodified';
  if(canonicalHash===reviewedRunHashes.canonical){
   const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(source.split(gloriaOverride).length!==2)throw Error('Unexpected GLORIA compatibility override; review the selected runner.');
   data=utf8.encode(source.replace(gloriaOverride,gloriaCompatibilityComment));status='applied';
  }else if(![reviewedRunHashes.fixed,reviewedRunHashes.packaged].includes(canonicalHash))throw Error('Download runner changed; the reviewed compatibility transform needs an update before packaging.');
  const resultHash=await sha256(data);
  if(status==='applied'&&resultHash!==reviewedRunHashes.packaged)throw Error('Unexpected packaged GLORIA compatibility result.');
  return {data,compatibility:{path:item.name,status,canonical_sha256:canonicalHash,result_sha256:resultHash,mario_version:'1.3.4',reason:'MARIO 1.3.4 rejects satellites=False. Preserve the configured GLORIA satellite selector; no satellite archive is required when absent, but an available matching archive may be read. The canonical recipe used by collection is unchanged.'}};
 }
 const clean=id=>id.replace(/[^a-zA-Z0-9_-]/g,'_');
 const plain=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['reading','recipe'].includes(k)));
 function tradeRecipe(reading,row){
  const source=reading.family,release=reading.version,year=reading.year;
  let parser,options;
  if(source==='EXIOBASE'){parser=release==='REX3'?'parse_exiobase_rex':'parse_exiobase';options=release==='REX3'?{year}:{table:'IOT',unit:'Monetary'};}
  if(source==='FIGARO'){parser=release==='E3'?'parse_figaro_e3':'parse_figaro';options=release==='E3'?{table:row.format,iot_mode:row.system==='pxp'?'product':'industry',extensions:false,diagonal_correction:null}:{table:'IOT',year,iot_mode:'product'};}
  if(source==='GLORIA'){parser='parse_gloria';options={year,satellites:'Emissions',dtype:'float64'};}
  if(source==='EMERGING'){parser='parse_emerging';options={year,load_co2:false};}
  if(!parser)throw Error('No reviewed reproduction adapter for '+source);
  return {id:reading.id,source,release,year,table:row.format,parser,parser_options:options,source_url:reading.source_url,license_url:reading.license_url,attribution:reading.attribution};
 }
 function extensionPath(recipe){
  const reviewed=recipe.parser_options?.add_extensions;
  if(typeof reviewed==='string'&&reviewed.startsWith('/path/to/'))return reviewed;
  return recipe.source==='ADB'?'/path/to/same-year-Air-Emissions.xlsx':recipe.source==='WIOD'?'/path/to/matching/Socio_Economic_Accounts.xlsx':recipe.source==='EXIOBASE'?'/path/to/matching/exiobase-iot':'/path/to/matching/extension';
 }
 function embodiedSelectionMetadata(state,reading,recipe){
  const emissions=state.metric==='ghg_trade',T=global.TradeModel;
  return {indicator:state.metric,origins:T.group(state.origin).join(';'),destinations:T.group(state.destination).join(';'),origin_destination_basis:'ISO3 country groups; all means every native region, including intact aggregates',domestic_pairs_excluded:true,
   use:state.tradeUse||'total',value_added_origin:emissions?'':state.tradeOrigin||'total',value_added_origin_basis:emissions?'':'Relative to the exporting native region',sectors:Array.isArray(state.section)?state.section.join(';'):state.section||'all',sector_boundary:'Exporting supplying sectors; upstream content from all industries',sector_classification:reading.sector_classification?.id||'',
   native_unit:reading.native_unit||'',native_currency:reading.native_currency||'',usd_per_native_currency:emissions?null:reading.usd_per_native_currency??null,exchange_rate_year:emissions?null:recipe.year,
   source_currency:reading.source_currency||recipe.currency||'',source_currency_scale:reading.source_currency_scale??recipe.currency_scale??null,source_price_basis:reading.source_price_basis||recipe.price_basis||'Current prices',
   gwp_basis:emissions?reading.gwp_basis||recipe.gwp_basis||'':'',gwp_horizon:emissions?reading.gwp_horizon??recipe.gwp_horizon??null:null,source_url:reading.source_url||recipe.source_url||'',source_license_url:reading.license_url||recipe.license_url||'',attribution:reading.attribution||recipe.attribution||''};
 }
 function economicPoint(snapshot,row,state,mapping,wb,M){
  const sector=row.sector??(Array.isArray(state.section)?state.section[0]:state.section),world=M.isWorld(row.country),region=M.findRegion(snapshot,row.country);
  const country=world?'WLD':region?.iso3;
  return {row:{...plain(row),value:null},available:Number.isFinite(row.value),expected_value:row.value,
   region_codes:world?snapshot.regions.map(r=>r.code||r.label):region?[region.code||region.label]:[],
   sector_indices:M.sectorIndices(snapshot,mapping,sector,state.metric),households:sector==='households',whole_economy:sector==='all',
   population:state.perCapita?M.reference(wb,country,snapshot.recipe.year).population??null:null,
   ghg_tonnes_per_unit:M.isWorld(state.country)?1e6:1e3,account_component:String(row.sector||'').startsWith('account:')?Number(row.sector.split(':')[1]):state.accountComponent&&state.accountComponent!=='total'?Number(state.accountComponent):null};
 }
 async function create(payload){
  const {state,rows,snapshots,mappings,wb,M,asset,getJSON}=payload,trade=['trade','ghg_trade','value_added_trade'].includes(state.metric),embodied=['ghg_trade','value_added_trade'].includes(state.metric),configs=[],fixed=[],referenceRows=[];
  const selected=new Map(snapshots.map(s=>[s.recipe.id,s])),sourceComputes=new Map();
  for(const row of rows){
   if(['World Bank','EDGAR'].includes(row.database)){referenceRows.push(plain(row));continue;}
   const s=[...selected.values()].find(s=>s.recipe.year===row.year&&s.recipe.source===row.database&&(row.series?M.seriesKey(s.recipe)===row.series:M.version(s.recipe)===row.version));
   if(!s){fixed.push({...plain(row),value:null});continue;}
   let config=configs.find(c=>c.recipe.id===s.recipe.id);
   if(!config){
    const full=trade?s:s.account?{...s,recipe:s.account.recipe}:await getJSON('data/economy/'+s.recipe.id+'.json');
    const recipe=trade?(embodied?{...structuredClone(s.account.recipe),id:s.recipe.id}:s.reading.recipe_id?{...structuredClone((await getJSON('data/economy/'+s.reading.recipe_id+'.json')).recipe),id:s.recipe.id}:tradeRecipe(s.reading,row)):structuredClone(full.recipe);
    const metricCompute=s.account?.provenance?.metric_compute?.[state.metric];
    if((state.metric.endsWith('_footprint')||embodied)&&metricCompute)recipe.footprint_compute=Object.fromEntries(['solver','strategy','refinement_steps'].filter(k=>metricCompute[k]!==undefined).map(k=>[k,metricCompute[k]]));
    if(embodied&&metricCompute)recipe.trade_compute={...recipe.footprint_compute};
    for(const key of Object.keys(recipe.parser_options||{}))if(key.endsWith('path')&&!(typeof recipe.parser_options[key]==='string'&&recipe.parser_options[key].startsWith('/path/to/')))recipe.parser_options[key]='/path/to/'+key;
    if(recipe.parser_options?.add_extensions)recipe.parser_options.add_extensions=extensionPath(recipe);
    config={schema_version:1,metric:state.metric,recipe,selection:structuredClone(state),world_bank:wb,points:[],_snapshot:full};
    if(!trade&&['value_added','ghg'].includes(state.metric)&&state.section!=='all'&&mappings[s.recipe.id])config.sector_mapping=structuredClone(mappings[s.recipe.id]);
    configs.push(config);
    const sourceId=s.reading?.recipe_id||s.account?.id||(!trade?s.recipe.id:null),compute=s.account?.recipe?.footprint_compute||payload.accountsByID?.get(sourceId)?.recipe?.footprint_compute;
    if(compute)sourceComputes.set(recipe.id,structuredClone(compute));
   }
   if(trade){
    const r=s.reading;
    const pairs=global.TradeModel.nativePairs(r,state.origin,state.destination);
    config.native_pairs=pairs;config.native_to_usd=Number.isFinite(r.native_scale)&&Number.isFinite(r.usd_per_native_currency)?r.native_scale*r.usd_per_native_currency:null;
    if(embodied&&state.section!=='all'){
     const chosen=global.TradeModel.sectorSelection(r,state.section);
     if(chosen.reason){config.sector_labels=[];}else config.sector_labels=[...new Set(chosen.groups.flatMap(code=>r.sector_groups[code]||[]))];
     if(!chosen.reason&&chosen.groups.some(code=>!r.sector_groups[code]?.length))throw Error('Selected sector groups have no reviewed native supplying-node labels');
    }
    if(state.tradeScope==='goods_proxy'){
     const id=r.recipe_id||s.recipe.id.replace(/^trade-/,'').replace('figaro-standard-','figaro-'),mapping=(payload.tradeMappings||mappings)[id];
     if(r.goods_proxy_labels)config.goods_labels=structuredClone(r.goods_proxy_labels);
     else if(mapping){const accepted=['nace-1.1','nace-1.1-adb','cpa-2002'].includes(mapping.classification_id)?['A','B','C','D']:['A','B','C'];config.goods_labels=mapping.entries.filter(e=>e.section.split('+').every(section=>accepted.includes(section))).map(e=>e.native_label);}
     else if(r.version==='E3')config.goods_code_pattern='^(?:CPA_)?[ABC]\\d';
     else throw Error('The selected proxy has no reviewed sector correspondence');
    }
    config.points.push({row:{...plain(row),...(embodied?embodiedSelectionMetadata(state,r,config.recipe):{}),value:null,intermediate:null,final:null,total:null},available:Number.isFinite(row.value),expected_value:row.value,expected_components:{intermediate:row.intermediate,final:row.final,total:row.total}});
   }else{
    if(['gross_output','domestic_use','final_demand','value_added_footprint','ghg_footprint'].includes(state.metric)&&state.section!=='all'){
     const chosen=global.TradeModel.sectorSelection(s.account,state.section);
     config.sector_labels=chosen.reason?[]:[...new Set(chosen.groups.flatMap(code=>s.account.sector_groups[code]||[]))];
     if(!chosen.reason&&chosen.groups.some(code=>!s.account.sector_groups[code]?.length))throw Error('Selected sector groups have no reviewed native supplying-node labels');
    }
    config.points.push(economicPoint(config._snapshot,row,state,mappings[s.recipe.id],wb,M));
   }
  }
  const files=[],names=[],paths={};
  for(const c of configs){
   delete c._snapshot;
   // Retain only the supporting observation year: no API access is needed.
   const year=String(c.recipe.year),needed=new Set(['WLD','DEU',...c.points.flatMap(p=>p.row.country==='world'?[]:[p.row.country])]);
   c.world_bank={countries:Object.fromEntries([...needed].filter(k=>wb.countries[k]||wb.aggregates?.[k]).map(k=>[k,{years:{[year]:(wb.countries[k]||wb.aggregates[k]).years[year]||{}}}])),currency_rates:{EUR:{years:{[year]:wb.currency_rates?.EUR?.years[year]}}}};
   const id=clean(c.recipe.id)+'_'+clean(c.metric),name='selections/'+id+'.json';names.push(name);
   files.push({name,data:JSON.stringify(c,null,2)+'\n'},{name:'run_'+id+'.py',data:'# Source: '+(c.recipe.source_url||'')+'\n# Attribution: '+(c.recipe.attribution||'')+'\nfrom pathlib import Path\nfrom recipes.run import main\nif __name__ == "__main__":\n    main(Path(__file__).parent / '+JSON.stringify(name)+')\n'});
   paths[c.recipe.id]={path:'/path/to/source'};
   const unusedExtension=['ADB','WIOD','EXIOBASE'].includes(c.recipe.source)&&['gross_output','domestic_use','final_demand','value_added_footprint','value_added_trade'].includes(c.metric);
   if(c.metric!=='trade'&&!unusedExtension&&c.recipe.parser_options.add_extensions)paths[c.recipe.id].add_extensions=extensionPath(c.recipe);
   if(c.recipe.source==='EMERGING'&&['ghg','ghg_footprint','ghg_trade'].includes(c.metric))paths[c.recipe.id].co2_path=c.recipe.parser_options.co2_path||'/path/to/matching/CO2-companion';
  }
  const manifest=await getJSON('reproduce/manifest.json'),compatibility=[];
  for(const item of manifest.files){
   const response=await fetch(asset(item.path));if(!response.ok)throw Error('Cannot load reproduction file '+item.path);
   const checked=await verifiedDownloadFile(item,new Uint8Array(await response.arrayBuffer()));
   files.push({name:item.name,data:checked.data});if(checked.compatibility)compatibility.push(checked.compatibility);
  }
  if(compatibility.length){
   files.push({name:'download-compatibility.json',data:JSON.stringify({schema_version:1,files:compatibility},null,2)+'\n'});
   const readme=files.find(f=>f.name==='README.txt'),note='\n\nDownloaded runner compatibility\n===============================\nThe packaged recipes/run.py preserves the configured GLORIA satellite selector for MARIO 1.3.4. See download-compatibility.json for the verified canonical and downloaded SHA256 values, status and reason.\n';
   if(readme)readme.data=(typeof readme.data==='string'?readme.data:new TextDecoder().decode(readme.data))+note;
   else files.push({name:'README.txt',data:note.trimStart()});
  }
  const inputNotes=configs.filter(c=>c.recipe.input_layout).map(c=>{
   if(!global.MarioSourceRecipes?.inputInstructions)throw Error('Cannot load source input instructions. Reload the page.');
   return c.recipe.id+'\n'+global.MarioSourceRecipes.inputInstructions(c.recipe).join('\n');
  });
  if(inputNotes.length){
   const name='README.txt',readme=files.find(f=>f.name===name),notes='\n\nSource input preparation\n========================\n'+inputNotes.join('\n\n')+'\n';
   if(readme)readme.data=(typeof readme.data==='string'?readme.data:new TextDecoder().decode(readme.data))+notes;
   else files.push({name,data:notes.trimStart()});
  }
  const sourceTemplate=files.find(f=>f.name==='source-recipe.template.txt');
  if(sourceTemplate&&global.MarioSourceRecipes){
   const template=new TextDecoder().decode(sourceTemplate.data);
   for(const c of configs)if(c.recipe.value_added_rows?.length){
    // The all-indicator companion retains the collected footprint solver;
    // the selected chart configuration keeps only its own requirements.
    const compute=sourceComputes.get(c.recipe.id),recipe=compute?{...c.recipe,footprint_compute:compute}:c.recipe;
    const script=global.MarioSourceRecipes.render(template,recipe),name='source_'+clean(c.recipe.id)+'_indicators';
    files.push({name:name+'.py',data:script},{name:name+'.ipynb',data:global.MarioSourceRecipes.notebook(script)});
   }
  }
  files.push({name:'paths.json',data:JSON.stringify(paths,null,2)+'\n'},{name:'selection.json',data:JSON.stringify({schema_version:1,config_files:names,reference_rows:referenceRows,fixed_rows:fixed,plot:payload.plot},null,2)+'\n'});
  return {blob:zip(files),count:configs.length};
 }
 const api={crc32,zip,verifiedDownloadFile,economicPoint,tradeRecipe,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioReproduction=api;
})(globalThis);
