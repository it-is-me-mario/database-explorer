/* Native bilateral observations; no sector concordance or country estimates. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const group = values => [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean))];
  const pairs = (origins, destinations) => group(origins).flatMap(a => group(destinations).filter(b => b !== a).map(b => [a,b]));
  function flow(reading, origin, destination, scope) {
    const i = reading.regions.findIndex(r => r.iso3 === origin && r.kind === 'country');
    const j = reading.regions.findIndex(r => r.iso3 === destination && r.kind === 'country');
    const block = reading.flows[scope];
    if (i < 0 || j < 0 || !block) return null;
    const intermediate = block.intermediate[i]?.[j], final = block.final[i]?.[j];
    return finite(intermediate) && finite(final) ? {intermediate, final, total: intermediate + final} : null;
  }
  function aggregate(reading, origins, destinations, scope = 'all') {
    const selected = pairs(origins, destinations);
    if (!selected.length) return {value:null, reason:'Choose origins and destinations with at least one international pair.'};
    const index = new Map();
    for (const [i,r] of reading.regions.entries()) if (r.kind === 'country' && r.iso3) {
      if (index.has(r.iso3)) return {value:null, reason:'Ambiguous native country classification.'};
      index.set(r.iso3,i);
    }
    const missing = group([...group(origins),...group(destinations)]).filter(c => !index.has(c));
    if (missing.length) return {value:null, reason:'Countries not individually represented: ' + missing.join(', ') + '.'};
    const block = reading.flows[scope];
    if (!block) return {value:null, reason:scope==='goods_proxy'?'Goods-producing-group proxy unavailable for this reading.':'Selected trade scope is unavailable.'};
    let intermediate = 0, final = 0;
    for (const [a,b] of selected) {
      const i=index.get(a), j=index.get(b), u=block.intermediate[i]?.[j], y=block.final[i]?.[j];
      if (!finite(u) || !finite(y)) return {value:null, reason:'A selected bilateral observation is unavailable.'};
      intermediate += u; final += y;
    }
    if (!finite(intermediate + final)) return {value:null, reason:'Non-finite aggregate.'};
    return {value:{intermediate,final,total:intermediate+final,pairs:selected.length}, reason:''};
  }
  function reference(rows, origin, destination, year, kind) {
    return rows.find(r => r.origin === origin && r.destination === destination && r.year === Number(year) && r.kind === kind) || null;
  }
  function referenceIndex(rows) {
    const result=new Map();
    for(const row of rows) {
      const key=JSON.stringify([row.origin,row.destination,row.year,row.kind]);
      if(result.has(key)) throw Error('Duplicate Comtrade country/year/reporting-side observation.');
      result.set(key,row);
    }
    return result;
  }
  function referenceTotal(index, origins, destinations, year, kind) {
    const selected=pairs(origins,destinations);
    if(!selected.length)return null;
    let value=0;const observations=[];
    for(const [a,b] of selected) {
      const row=index.get(JSON.stringify([a,b,Number(year),kind]));
      if(!row || !finite(row.value_usd) || row.value_usd<0)return null;
      value+=row.value_usd;observations.push(row);
    }
    if((group(origins).length>1&&observations.some(r=>r.origin_area_note))||(group(destinations).length>1&&observations.some(r=>r.destination_area_note)))return null;
    return finite(value)?{value,observations}:null;
  }
  function referenceRange(index, origins, destinations, year) {
    const exports=referenceTotal(index,origins,destinations,year,'export');
    const imports=referenceTotal(index,origins,destinations,year,'mirror_import');
    const values=[exports?.value,imports?.value].filter(finite);
    return {year:Number(year),exports,imports,lower:values.length?Math.min(...values):null,
      upper:values.length?Math.max(...values):null,complete:!!exports&&!!imports,geography_notes:[...new Set(pairs(origins,destinations).flatMap(([a,b])=>['export','mirror_import'].flatMap(kind=>{const r=index.get(JSON.stringify([a,b,Number(year),kind]));return r?[r.origin_area_note,r.destination_area_note].filter(Boolean):[]})))]};
  }
  function catalogue(manifest) {
    return manifest.datasets.map(entry=>({trade:true,file:entry.file,scopes:entry.scopes||[],regions:[],recipe:{
      id:entry.id,label:entry.label,source:entry.family,release:entry.version,year:entry.year,
      table:entry.format==='sut'?'SUT':'IOT',native_units:'Monetary',price_basis:'Current prices',
      parser_options:{unit:'Monetary',...(entry.format==='sut'?{table:'SUT'}:
        {system:({industry:'ixi',product:'pxp',iot:'ixi'})[entry.format]||entry.format})}
    }}));
  }
  function years(snapshots,state) {
    return (state.year==='all'?[...new Set(snapshots.map(s=>s.recipe.year))]:
      (Array.isArray(state.year)?state.year:[state.year]).map(Number)).sort((a,b)=>a-b);
  }
  function observations(snapshots,state,M) {
    const templates=new Map();
    for(const s of M.selected(snapshots,state,false))templates.set(M.seriesKey(s.recipe),s);
    const result=[];
    for(const [series,template] of templates)for(const year of years(snapshots,state)) {
      const snapshot=snapshots.find(s=>M.seriesKey(s.recipe)===series&&s.recipe.year===year);
      const reading=snapshot?.reading;
      const calculated=reading?aggregate(reading,state.origin,state.destination,state.tradeScope||'all'):{value:null,reason:'No collected reading for this year.'};
      const r=template.recipe,v=calculated.value;
      result.push({database:r.source,release:r.release,version:M.version(r),label:r.label,year,series,
        format:r.table,system:r.parser_options.system,units:'Monetary',unit:state.metric==='ghg_trade'?'t CO₂eq':'current US$',
        country:'trade-group',country_name:'Selected origins → selected destinations',sector:'all',
        intermediate:v?.intermediate??null,final:v?.final??null,total:v?.total??null,
        value:v?.[state.tradeUse||'total']??null,note:calculated.reason,
        reading:reading||null,recipe:snapshot?.recipe||r});
    }
    return result;
  }
  function exportRows(rows,references,state) {
    const ranges=new Map(references.map(r=>[r.year,r]));
    const details=reference=>reference?JSON.stringify(reference.observations.map(r=>({
      origin:r.origin,destination:r.destination,value_usd:r.value_usd,valuation:r.valuation,
      query_url:r.query_url,retrieved_at:r.retrieved_at,reporter_code:r.reporter_code,partner_code:r.partner_code,reporter_iso:r.reporter_iso,partner_iso:r.partner_iso,reporter_name:r.reporter_name,partner_name:r.partner_name,origin_area_note:r.origin_area_note,destination_area_note:r.destination_area_note,is_reported:r.is_reported,is_aggregate:r.is_aggregate}))):'';
    return rows.map(row=>{
      const reading=row.reading,ref=ranges.get(row.year);
      return {database:row.database,version:row.version,year:row.year,
        origins:group(state.origin).join(';'),destinations:group(state.destination).join(';'),
        domestic_excluded:true,scope_id:state.tradeScope||'all',mrio_scope:state.tradeScope==='goods_proxy'?'Goods-producing groups (proxy)':'All sectors: goods and services',use:state.tradeUse,
        intermediate_usd:row.intermediate,final_usd:row.final,total_usd:row.total,displayed_usd:row.value,
        unavailable_reason:row.note,
        ...(state.tradeScope==='goods_proxy'?{
          comtrade_scope:'Merchandise goods only',comtrade_geography_notes:(ref?.geography_notes||[]).join('; '),
          comtrade_export_usd:ref?.exports?.value??null,comtrade_mirror_import_usd:ref?.imports?.value??null,
          comtrade_lower_usd:ref?.lower??null,comtrade_upper_usd:ref?.upper??null,
          comparison_note:'Different scope, reporting geography and valuation; reported range is context, not a confidence interval or accuracy score.',
          comtrade_export_observations:details(ref?.exports),comtrade_import_observations:details(ref?.imports),
          comtrade_reuse_url:'https://uncomtrade.org/docs/re-dissemination-of-data/'}:{}),
        source:reading?.source_url||'',license:reading?.license||'',license_url:reading?.license_url||'',attribution:reading?.attribution||'',
        native_unit:reading?.native_unit||'',native_scale:reading?.native_scale??null,native_currency:reading?.native_currency||'',
        usd_per_native_currency:reading?.usd_per_native_currency??null,source_price_basis:reading?.price_basis||'',proxy_definition:state.tradeScope==='goods_proxy'?reading?.goods_proxy_note||'':'',
        source_input_checksums:reading?JSON.stringify(reading.provenance?.inputs||[]):''};
    });
  }
  const ratio = (value,denominator) => finite(value)&&finite(denominator)&&denominator!==0?value/denominator:null;
  function csv(rows) {
    if (!rows.length) return '';
    const keys=Object.keys(rows[0]),cell=value=>'"'+String(value==null?'':value).replace(/"/g,'""')+'"';
    return [keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n')+'\r\n';
  }
  const api={flow,reference,ratio,csv,group,pairs,aggregate,referenceIndex,referenceTotal,referenceRange,catalogue,years,observations,exportRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TradeModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
