/* Country accounting aggregates; all native producer/consumer regions remain distinct. */
((global)=>{
 'use strict';
 const metrics=['gross_output','domestic_use','final_demand','value_added_footprint','ghg_footprint'];
 const isAccount=metric=>metrics.includes(metric),isEmissions=metric=>['ghg','ghg_footprint','ghg_trade'].includes(metric);
 const titles={gross_output:'Gross output',domestic_use:'Domestic use',final_demand:'Final demand',value_added_footprint:'Value-added footprint',ghg_footprint:'GHG consumption footprint',ghg_trade:'GHG embodied in trade'};
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
 function numeric(snapshot,state,component){return {...snapshot,summary_only:true,regions:snapshot.regions.map(r=>{const v=array(r,state.metric,state);return {...r,[state.metric+'_total']:v?(component==null?v.reduce((a,b)=>a+b,0):v[component]):null};})};}
 function value(snapshot,region,state,wb,M,component=null){
  if(!snapshot||!region)return null;const s=numeric(snapshot,state,component);return M.value(s,s.regions.find(r=>r.code===region.code),{...state,section:'all'},wb,null);
 }
 function observations(snapshots,state,wb,M){
  const base=M.observations(snapshots,{...state,section:'all'},wb,{}),annual=M.selectedYears(snapshots,state).length===1,rows=[];
  for(const row of base){
   const s=snapshots.find(s=>s.recipe.year===row.year&&M.seriesKey(s.recipe)===row.series);
   if(!s?.account?.components[state.metric]){rows.push({...row,value:null,note:row.note||'No collected account reading for this year.'});continue;}
   const labels=s.account.components[state.metric],chosen=state.accountComponent&&state.accountComponent!=='total'?[Number(state.accountComponent)]:annual&&labels.length>1?labels.map((_,i)=>i):[null];
   for(const component of chosen){
    const selected=numeric(s,state,component),v=M.isWorld(row.country)?M.worldValue(selected,{...state,section:'all'},wb,null):M.value(selected,M.findRegion(selected,row.country),{...state,section:'all'},wb,null);
    rows.push({...row,indicator:state.metric,value:v,sector:component==null?'all':'account:'+component,sector_name:component==null?'Total':labels[component],classification:'',gwp_basis:isEmissions(state.metric)?s.recipe.gwp_basis||'':'',gwp_horizon:isEmissions(state.metric)?s.recipe.gwp_horizon??null:null,note:v==null?[row.note,s.account.notes[state.metric]].filter(Boolean).join(' '):s.account.notes[state.metric],basis:s.account.notes[state.metric]});
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
 function carbonCatalogue(readings,T){
  return readings.filter(r=>r.ghg_trade).map(data=>{
   const r=data.recipe,format=r.table==='SUT'?'sut':r.parser_options.system||'pxp',id='ghg-trade-'+r.id;
   const snapshot=T.catalogue({datasets:[{id,label:r.source+' '+r.release,family:r.source,version:r.release,year:r.year,format,file:'',scopes:['all']} ]})[0];
   Object.assign(snapshot.recipe,{account_notes:data.notes,gwp_basis:r.gwp_basis,gwp_horizon:r.gwp_horizon});snapshot.account=data;snapshot.reading={id,family:r.source,version:r.release,year:r.year,regions:data.regions,flows:{all:data.ghg_trade},native_unit:'t CO2eq',native_scale:1,usd_per_native_currency:1,source_url:r.source_url,license_url:r.license_url,attribution:r.attribution,price_basis:'Physical GHG result'};
   return snapshot;
  });
 }
 function exportRows(rows,snapshots,state,scale,C,M){
  return rows.map(row=>{const s=snapshots.find(s=>s.recipe.year===row.year&&M.seriesKey(s.recipe)===row.series),r=s?.recipe;
   return {database:row.database,version:row.version,year:row.year,country:row.country_name,indicator:state.metric,component:row.sector_name,value:C.scaled(row.value,scale),unit:scale.unit,
    use:state.metric==='domestic_use'?state.accountUse:'',demand:state.metric==='final_demand'?state.demandGroup:state.metric.endsWith('_footprint')?'total final demand':'',gwp_basis:row.gwp_basis||'',note:row.note,source_url:r?.source_url||'',source_license_url:r?.license_url||'',attribution:r?.attribution||''};});
 }
 const api={metrics,isAccount,isEmissions,titles,attach,array,numeric,value,observations,calculationNotes,carbonCatalogue,exportRows};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioAccounts=api;
})(globalThis);
