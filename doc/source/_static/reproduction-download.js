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
  const {state,rows,snapshots,mappings,wb,M,asset,getJSON}=payload,trade=['trade','ghg_trade'].includes(state.metric),configs=[],fixed=[],referenceRows=[];
  const selected=new Map(snapshots.map(s=>[s.recipe.id,s]));
  for(const row of rows){
   if(['World Bank','EDGAR'].includes(row.database)){referenceRows.push(plain(row));continue;}
   const s=[...selected.values()].find(s=>s.recipe.year===row.year&&s.recipe.source===row.database&&(row.series?M.seriesKey(s.recipe)===row.series:M.version(s.recipe)===row.version));
   if(!s){fixed.push({...plain(row),value:null});continue;}
   let config=configs.find(c=>c.recipe.id===s.recipe.id);
   if(!config){
    const full=trade?s:await getJSON('data/economy/'+s.recipe.id+'.json');
    const recipe=trade?(state.metric==='ghg_trade'?{...structuredClone(s.account.recipe),id:s.recipe.id}:tradeRecipe(s.reading,row)):structuredClone(full.recipe);
    for(const key of Object.keys(recipe.parser_options||{}))if(key.endsWith('path'))recipe.parser_options[key]='/path/to/'+key;
    config={schema_version:1,metric:state.metric,recipe,selection:structuredClone(state),world_bank:wb,points:[],_snapshot:full};configs.push(config);
   }
   if(trade){
    const r=s.reading,byISO=new Map(r.regions.filter(x=>x.kind==='country').map(x=>[x.iso3,x.label]));
    const pairs=global.TradeModel.pairs(state.origin,state.destination).map(([a,b])=>[byISO.get(a),byISO.get(b)]);
    config.native_pairs=pairs;config.native_to_usd=r.native_scale*r.usd_per_native_currency;
    if(state.tradeScope==='goods_proxy'){
     const id=s.recipe.id.replace(/^trade-/,'').replace('figaro-standard-','figaro-'),mapping=mappings[id];
     if(mapping){const accepted=['nace-1.1','cpa-2002'].includes(mapping.classification_id)?['A','B','C','D']:['A','B','C'];config.goods_labels=mapping.entries.filter(e=>accepted.includes(e.section)).map(e=>e.native_label);}
     else if(r.version==='E3')config.goods_code_pattern='^(?:CPA_)?[ABC]\\d';
     else throw Error('The selected proxy has no reviewed sector correspondence');
    }
    config.points.push({row:{...plain(row),value:null,intermediate:null,final:null,total:null},available:Number.isFinite(row.value),expected_value:row.value,expected_components:{intermediate:row.intermediate,final:row.final,total:row.total}});
   }else config.points.push(economicPoint(config._snapshot,row,state,mappings[s.recipe.id],wb,M));
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
   if(c.recipe.parser_options.add_extensions)paths[c.recipe.id].add_extensions='/path/to/matching/exiobase-iot';
   if(c.recipe.source==='EMERGING'&&c.metric==='ghg')paths[c.recipe.id].co2_path='/path/to/matching/CO2-companion';
  }
  const manifest=await getJSON('reproduce/manifest.json');
  for(const item of manifest.files){
   const response=await fetch(asset(item.path));if(!response.ok)throw Error('Cannot load reproduction file '+item.path);
   const bytes=new Uint8Array(await response.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(hash!==item.sha256)throw Error('Reproduction code changed during download. Reload the page.');
   files.push({name:item.name,data:bytes});
  }
  files.push({name:'paths.json',data:JSON.stringify(paths,null,2)+'\n'},{name:'selection.json',data:JSON.stringify({schema_version:1,config_files:names,reference_rows:referenceRows,fixed_rows:fixed,plot:payload.plot},null,2)+'\n'});
  return {blob:zip(files),count:configs.length};
 }
 const api={crc32,zip,economicPoint,tradeRecipe,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioReproduction=api;
})(globalThis);
