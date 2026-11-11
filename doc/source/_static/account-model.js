/* Country accounting aggregates; all native producer/consumer regions remain distinct. */
((global)=>{
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./comparison-legend.js'):global.MarioLegend;
 const metrics=['gross_output','domestic_use','final_demand','value_added_footprint','ghg_footprint'];
 const isAccount=metric=>metrics.includes(metric),isEmissions=metric=>['ghg','ghg_footprint','ghg_trade'].includes(metric);
 const isEmbodiedTrade=metric=>['ghg_trade','value_added_trade'].includes(metric);
 const titles={gross_output:'Gross output',domestic_use:'Domestic use',final_demand:'Final demand',value_added_footprint:'Value added embodied in final demand',ghg_footprint:'GHG consumption footprint',ghg_trade:'GHG embodied in gross trade',value_added_trade:'Value added embodied in gross trade'};
 function mergeCountryAccounts(prior,extension){
  if(!extension)return prior;
  const regional=extension.accounts||{},priorRegions=new Map((prior?.regions||[]).map(r=>[r.code||r.label,r])),metricKeys=Object.keys(regional).filter(isAccount);
  const at=(values,i)=>Array.isArray(values)?values[i]:Object.fromEntries(Object.entries(values).map(([key,rows])=>[key,rows[i]]));
  return {...prior,id:extension.recipe.id,recipe:{...prior?.recipe,...extension.recipe},metrics:[...new Set([...(prior?.metrics||[]),...metricKeys])],components:{gross_output:['Total'],domestic_use:['Domestic'],final_demand:['Domestic','Imported'],value_added_footprint:['Domestic value added','Foreign value added'],ghg_footprint:['Domestic emissions','Foreign emissions'],...prior?.components,...extension.components},notes:{...prior?.notes,...extension.notes},residuals:{...prior?.residuals,...extension.residuals},provenance:{...prior?.provenance,...extension.provenance,metric_compute:{...prior?.provenance?.metric_compute,...extension.provenance?.metric_compute}},
   regions:extension.regions.map((r,i)=>({...priorRegions.get(r.code||r.label),...r,accounts:{...priorRegions.get(r.code||r.label)?.accounts,...Object.fromEntries(metricKeys.map(metric=>[metric,at(regional[metric],i)]))}})),
   demand_groups:extension.demand_groups||prior?.demand_groups,demand_schema_version:extension.demand_schema_version||prior?.demand_schema_version,direct_final_user_emissions:extension.direct_final_user_emissions||prior?.direct_final_user_emissions,
   sector_files:extension.sector_files||{},sector_groups:extension.sector_groups||{},sector_classification:extension.sector_classification,sector_scope:extension.sector_scope,sector_accounts:{},sector_notes:{}};
 }
 function attachAccountSector(snapshot,shard){snapshot.account.sector_accounts[shard.section]=shard.accounts||{};snapshot.account.sector_notes[shard.section]=shard.notes||{};}
 function selectedAccountSectors(snapshot,state,T){
  if(!state.section||state.section==='all')return {groups:null,reason:'',note:snapshot.account?.notes?.[state.metric]||''};
  const selected=T.sectorSelection(snapshot.account||{},state.section);
  if(!selected.reason&&selected.groups.some(code=>!snapshot.account.sector_accounts?.[code]?.[state.metric]))selected.reason='No collected '+(titles[state.metric]||state.metric)+' result for every selected sector group.';
  const notes=[...new Set((selected.groups||[]).map(code=>snapshot.account.sector_notes?.[code]?.[state.metric]).filter(Boolean))];
  return {...selected,note:[selected.note,notes.join(' ')||snapshot.account?.notes?.[state.metric]||''].filter(Boolean).join(' ')};
 }
 function attach(snapshot,data){
  if(!data)return snapshot;
  const byCode=new Map(data.regions.map(r=>[r.code||r.label,r]));
  return {...snapshot,account:data,availability:{...snapshot.availability,...Object.fromEntries(data.metrics.map(k=>[k,true]))},
   recipe:{...snapshot.recipe,account_notes:data.notes,account_components:data.components},
   regions:snapshot.regions.map(region=>{const accounts=byCode.get(region.code||region.label)?.accounts;if(!accounts)return region;
    const additions={account_values:accounts};for(const [metric,value] of Object.entries(accounts)){const array=Array.isArray(value)?value:value.total;additions[metric]=array;additions[metric+'_total']=array.reduce((a,b)=>a+b,0);}
    return {...region,...additions};})};
 }
 function array(region,metric,state){const value=region?.account_values?.[metric];return Array.isArray(value)?value:value?.[metric==='domestic_use'?(state.accountUse||'total'):(state.demandGroup||'total')];}
 function numeric(snapshot,state,component,T){
  const selected=selectedAccountSectors(snapshot,state,T),indices=new Map((snapshot.account?.regions||[]).map((r,i)=>[r.code||r.label,i]));
  return {...snapshot,summary_only:true,regions:snapshot.regions.map(r=>{
   let v=array(r,state.metric,state);
   if(selected.groups!==null){
    const index=indices.get(r.code||r.label),parts=selected.groups.map(code=>{const values=snapshot.account.sector_accounts?.[code]?.[state.metric];return Array.isArray(values)?values[index]:values?.[state.metric==='domestic_use'?(state.accountUse||'total'):(state.demandGroup||'total')]?.[index];});
    v=selected.reason||!parts.length||parts.some(values=>!Array.isArray(values)||values.some(x=>!Number.isFinite(x)))?null:parts[0].map((_,i)=>parts.reduce((sum,values)=>sum+values[i],0));
   }
   return {...r,[state.metric+'_total']:v?(component==null?v.reduce((a,b)=>a+b,0):v[component]):null};
  })};
 }
 function value(snapshot,region,state,wb,M,component=null,T){
  if(!snapshot||!region)return null;const s=numeric(snapshot,state,component,T);return M.value(s,s.regions.find(r=>r.code===region.code),{...state,section:'all'},wb,null);
 }
 function observations(snapshots,state,wb,M,T){
  if(state.legendBy==='sector'&&state.section!=='all'&&!state._sectorLegend){
   const groups=L.sectorGroups(state.section,M.selected(snapshots,state).flatMap(s=>Object.keys(s.account?.sector_groups||{})));
   const sections=Object.assign({},...snapshots.map(s=>s.account?.sector_classification?.sections||{}));
   const invalid=new Map(M.selected(snapshots,state).map(s=>[JSON.stringify([M.seriesKey(s.recipe),s.recipe.year]),selectedAccountSectors(s,state,T).reason]));
   return groups.flatMap(group=>observations(snapshots,{...state,section:group,_sectorLegend:true},wb,M,T).map(row=>{const reason=invalid.get(JSON.stringify([row.series,row.year]));return {...row,sector:group,sector_group:group,sector_name:L.sectorName(group,sections),legend_dimension:'sector',...(reason?{value:null,note:reason}:{} )};}));
  }
  if(state.legendBy==='use'&&state.metric==='domestic_use'&&!state._useLegend){
   return (state.accountUse==='total'?['intermediate','final']:[state.accountUse]).flatMap(use=>observations(snapshots,{...state,accountUse:use,_useLegend:true},wb,M,T).map(row=>({...row,sector:use,sector_name:use==='intermediate'?'Intermediate':'Final',account_use:use,legend_dimension:'use'})));
  }
  const base=M.observations(snapshots,{...state,section:'all'},wb,{}),annual=M.selectedYears(snapshots,state).length===1,rows=[];
  for(const row of base){
   const s=snapshots.find(s=>s.recipe.year===row.year&&M.seriesKey(s.recipe)===row.series);
   if(!s?.account?.components[state.metric]){rows.push({...row,value:null,note:[row.note,s?.account?.notes?.[state.metric]].filter(Boolean).join(' ')||'No collected account reading for this year.'});continue;}
   const sectorSelection=selectedAccountSectors(s,state,T),labels=s.account.components[state.metric],chosen=state.accountComponent&&state.accountComponent!=='total'?[Number(state.accountComponent)]:!state._sectorLegend&&!state._useLegend&&(annual||state.legendBy==='component')&&labels.length>1?labels.map((_,i)=>i):[null];
   for(const component of chosen){
    const selected=numeric(s,state,component,T),v=M.isWorld(row.country)?M.worldValue(selected,{...state,section:'all'},wb,null):M.value(selected,M.findRegion(selected,row.country),{...state,section:'all'},wb,null);
    rows.push({...row,indicator:state.metric,value:v,sector:component==null?'all':'account:'+component,sector_name:component==null?'Total':labels[component],component_name:component==null?'Total':labels[component],sector_group:Array.isArray(state.section)?state.section.join(';'):state.section,legend_dimension:state.legendBy==='component'?'component':undefined,classification:sectorSelection.groups===null?'':s.account.sector_classification?.id||'',gwp_basis:isEmissions(state.metric)?s.recipe.gwp_basis||'':'',gwp_horizon:isEmissions(state.metric)?s.recipe.gwp_horizon??null:null,usd_per_native_currency:isEmissions(state.metric)?null:exchangeRate(s.recipe,wb,M),note:v==null?[sectorSelection.reason,row.note,sectorSelection.note].filter(Boolean).join(' '):sectorSelection.note,basis:sectorSelection.note});
   }
  }
  return rows;
 }
 function calculationNotes(snapshots,metric,M){
  const groups=new Map();
  for(const snapshot of snapshots){
   const note=snapshot.account?.notes?.[metric];if(!note)continue;
   const r=snapshot.recipe,key=JSON.stringify([M.seriesKey(r),note]);
   if(!groups.has(key))groups.set(key,{label:r.source+' · '+M.version(r),note,years:[]});
   groups.get(key).years.push(r.year);
  }
  return [...groups.values()].map(g=>({...g,years:[...new Set(g.years)].sort((a,b)=>a-b)}));
 }
 function mergeTradeReadings(legacy,current){
  const merged=new Map(legacy.map(data=>[data.recipe.id,data]));
  for(const data of current){const prior=merged.get(data.recipe.id);if(prior&&['ghg_trade','value_added_trade'].some(metric=>prior[metric]&&!data[metric])&&JSON.stringify(prior.regions.map(r=>r.code||r.label))!==JSON.stringify(data.regions.map(r=>r.code||r.label)))throw Error('Retained embodied-trade axes differ for '+data.recipe.id);merged.set(data.recipe.id,prior?{...prior,...data,notes:{...prior.notes,...data.notes},provenance:{...prior.provenance,...data.provenance,metric_compute:{...prior.provenance?.metric_compute,...data.provenance?.metric_compute}}}:data);}
  return [...merged.values()];
 }
 function exchangeRate(recipe,wb,M){
  if(recipe.currency==='USD')return 1;
  if(recipe.currency!=='EUR')return null;
  const exchange=recipe.year>=1999?M.reference(wb,'DEU',recipe.year).local_currency_per_usd:null;
  const rate=wb.currency_rates?.EUR?.years[String(recipe.year)]??(exchange>0?1/exchange:null);
  return typeof rate==='number'&&Number.isFinite(rate)&&rate>0?rate:null;
 }
 function embodiedCatalogue(readings,T,metric='ghg_trade',wb={},M){
  return readings.filter(data=>data[metric]).map(data=>{
   const r=data.recipe,emissions=metric==='ghg_trade',id=(emissions?'ghg-trade-':'value-added-trade-')+r.id,rate=emissions?1:exchangeRate(r,wb,M);
   const scaleBlock=block=>({intermediate:block.intermediate.map(row=>row.map(v=>Number.isFinite(v)&&rate!=null?v*rate:null)),final:block.final.map(row=>row.map(v=>Number.isFinite(v)&&rate!=null?v*rate:null))});
   const layers=values=>emissions?{total:scaleBlock(values)}:Object.fromEntries(['total','domestic','foreign'].filter(k=>values[k]).map(k=>[k,scaleBlock(values[k])]));
   const content=layers(data[metric]),sectors=Object.fromEntries(Object.entries(data.sector_results||{}).filter(([,values])=>values[metric]).map(([code,values])=>[code,layers(values[metric])]));
   const recipe={...r,id,account_notes:data.notes};
   return {trade:true,sector_files:data.sector_files||{},scopes:['all'],regions:data.regions,recipe,account:data,reading:{id,recipe_id:r.id,family:r.source,version:r.release,year:r.year,regions:data.regions,flows:{all:content.total},content_flows:content,sector_flows:sectors,sector_files:data.sector_files||{},sector_groups:data.sector_groups||{},sector_classification:data.sector_classification,sector_scope:data.sector_scope,embodied_metric:metric,
    conversion_note:rate==null?'No observed same-year exchange rate for '+r.currency+' in '+r.year+'.':'',native_unit:emissions?'t CO2eq':r.currency,native_scale:1,native_currency:emissions?'':r.currency,usd_per_native_currency:rate,
    source_url:r.source_url,license_url:r.license_url,attribution:r.attribution,source_currency:r.currency,source_currency_scale:r.currency_scale,source_price_basis:r.price_basis||'Current prices',price_basis:emissions?'Physical GHG result':r.price_basis||'Current prices',gwp_basis:emissions?r.gwp_basis:'',gwp_horizon:emissions?r.gwp_horizon:null,provenance:data.provenance}};
  });
 }
 function attachTradeSector(snapshot,shard){
  const reading=snapshot.reading,metric=reading.embodied_metric,values=shard[metric]||shard.sector_results?.[shard.section]?.[metric];
  if(!values)throw Error('The selected sector shard has no '+metric+' result.');
  const rate=reading.usd_per_native_currency,scaleBlock=block=>({intermediate:block.intermediate.map(row=>row.map(v=>Number.isFinite(v)&&rate!=null?v*rate:null)),final:block.final.map(row=>row.map(v=>Number.isFinite(v)&&rate!=null?v*rate:null))});
  reading.sector_flows[shard.section]=metric==='ghg_trade'?{total:scaleBlock(values)}:Object.fromEntries(['total','domestic','foreign'].map(k=>[k,scaleBlock(values[k])]));
 }
 const carbonCatalogue=(readings,T)=>embodiedCatalogue(readings,T,'ghg_trade');
 function exportTradeRows(rows,state,T){
  const emissions=state.metric==='ghg_trade',suffix=emissions?'t_co2eq':'usd';
  return rows.map(row=>{const r=row.reading;return {database:row.database,version:row.version,year:row.year,indicator:state.metric,origins:T.group(state.origin).join(';'),destinations:T.group(state.destination).join(';'),domestic_pairs_excluded:true,use:state.tradeUse,value_added_origin:emissions?'':row.value_added_origin||state.tradeOrigin||'total',legend_by:state.legendBy||'auto',breakdown:row.sector_name||'',
   sectors:row.sector_group||(Array.isArray(state.section)?state.section.join(';'):state.section||'all'),sector_boundary:'Exporting supplying sectors; upstream content from all industries',classification:r?.sector_classification?.id||'',
   ['intermediate_'+suffix]:row.intermediate,['final_'+suffix]:row.final,['total_'+suffix]:row.total,['displayed_'+suffix]:row.value,unit:emissions?'t CO2eq':'current USD',
   native_currency:r?.native_currency||'',usd_per_native_currency:emissions?'':r?.usd_per_native_currency??null,source_price_basis:r?.source_price_basis||r?.price_basis||'',source_currency:r?.source_currency||'',source_currency_scale:r?.source_currency_scale??null,gwp_basis:emissions?row.gwp_basis||'':'',gwp_horizon:emissions?row.gwp_horizon??null:'',note:row.note,
   source_url:r?.source_url||'',source_license_url:r?.license_url||'',attribution:r?.attribution||'',source_input_checksums:JSON.stringify(r?.provenance?.metric_inputs?.[state.metric]||r?.provenance?.inputs||[]) };});
 }
 function exportRows(rows,snapshots,state,scale,C,M){
  return rows.map(row=>{const s=snapshots.find(s=>s.recipe.year===row.year&&M.seriesKey(s.recipe)===row.series),r=s?.recipe;
   return {database:row.database,version:row.version,year:row.year,country:row.country_name,indicator:state.metric,component:row.component_name||row.sector_name,sector_group:row.sector_group||'',legend_by:state.legendBy||'auto',value:C.scaled(row.value,scale),unit:scale.unit,sectors:row.sector_group||(Array.isArray(state.section)?state.section.join(';'):state.section||'all'),classification:row.classification||'',sector_boundary:state.metric.endsWith('_footprint')?'Final-demand supplying sectors; upstream contributions from all industries':'Native supplying sectors',
    use:state.metric==='domestic_use'?row.account_use||state.accountUse:'',demand:state.metric==='final_demand'?state.demandGroup:state.metric.endsWith('_footprint')?'total final demand':'',gwp_basis:row.gwp_basis||'',gwp_horizon:row.gwp_horizon??null,native_currency:r?.currency||'',usd_per_native_currency:row.usd_per_native_currency??null,source_price_basis:r?.price_basis||'Current prices',note:row.note,source_url:r?.source_url||'',source_license_url:r?.license_url||'',attribution:r?.attribution||''};});
 }
 const api={metrics,isAccount,isEmissions,isEmbodiedTrade,titles,mergeCountryAccounts,attachAccountSector,selectedAccountSectors,attach,array,numeric,value,observations,calculationNotes,mergeTradeReadings,exchangeRate,embodiedCatalogue,attachTradeSector,carbonCatalogue,exportTradeRows,exportRows};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioAccounts=api;
})(globalThis);
