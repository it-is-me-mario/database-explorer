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
    return finite(value)?{value,observations}:null;
  }
  function referenceRange(index, origins, destinations, year) {
    const exports=referenceTotal(index,origins,destinations,year,'export');
    const imports=referenceTotal(index,origins,destinations,year,'mirror_import');
    const values=[exports?.value,imports?.value].filter(finite);
    return {year:Number(year),exports,imports,lower:values.length?Math.min(...values):null,
      upper:values.length?Math.max(...values):null,complete:!!exports&&!!imports};
  }
  function catalogue(manifest) {
    return manifest.datasets.map(entry=>({trade:true,file:entry.file,regions:[],recipe:{
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
        format:r.table,system:r.parser_options.system,units:'Monetary',unit:'current US$',
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
      query_url:r.query_url,retrieved_at:r.retrieved_at,is_reported:r.is_reported,is_aggregate:r.is_aggregate}))):'';
    return rows.map(row=>{
      const reading=row.reading,ref=ranges.get(row.year);
      return {database:row.database,version:row.version,year:row.year,
        origins:group(state.origin).join(';'),destinations:group(state.destination).join(';'),
        domestic_excluded:true,scope_id:state.tradeScope||'all',mrio_scope:state.tradeScope==='goods_proxy'?'Goods-producing groups (proxy)':'All sectors: goods and services',use:state.tradeUse,
        intermediate_usd:row.intermediate,final_usd:row.final,total_usd:row.total,displayed_usd:row.value,
        unavailable_reason:row.note,comtrade_scope:'Merchandise goods only',
        comtrade_export_usd:ref?.exports?.value??null,comtrade_mirror_import_usd:ref?.imports?.value??null,
        comtrade_lower_usd:ref?.lower??null,comtrade_upper_usd:ref?.upper??null,
        comparison_note:'Different scope and valuation; reported range is context, not a confidence interval or accuracy score.',
        source:reading?.source_url||'',license:reading?.license||'',license_url:reading?.license_url||'',attribution:reading?.attribution||'',
        native_unit:reading?.native_unit||'',native_scale:reading?.native_scale??null,native_currency:reading?.native_currency||'',
        usd_per_native_currency:reading?.usd_per_native_currency??null,source_price_basis:reading?.price_basis||'',proxy_definition:state.tradeScope==='goods_proxy'?reading?.goods_proxy_note||'':'',
        source_input_checksums:reading?JSON.stringify(reading.provenance?.inputs||[]):'',
        comtrade_export_observations:details(ref?.exports),comtrade_import_observations:details(ref?.imports),
        comtrade_reuse_url:'https://uncomtrade.org/docs/re-dissemination-of-data/'};
    });
  }
  const ratio = (value,denominator) => finite(value)&&finite(denominator)&&denominator!==0?value/denominator:null;
  function csv(rows) {
    if (!rows.length) return '';
    const keys=Object.keys(rows[0]),cell=value=>'"'+String(value==null?'':value).replace(/"/g,'""')+'"';
    return [keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n')+'\r\n';
  }
  function pythonStart(row,state) {
    const r=row.reading,year=row.year;
    if(!r)throw Error('Choose one available reading.');
    const args={EXIOBASE:r.version==='REX3'?`parse_exiobase_rex(path=source, year=${year}, calc_all=False)`:
      'parse_exiobase(path=source, table="IOT", unit="Monetary", calc_all=False)',
      GLORIA:`parse_gloria(path=source, year=${year}, satellites="Emissions", calc_all=False)`,
      EMERGING:`parse_emerging(path=source, year=${year}, load_co2=False, calc_all=False)`,
      FIGARO:r.version==='E3'?`parse_figaro_e3(path=source, table=${JSON.stringify(row.format)}, iot_mode=${JSON.stringify(row.system==='pxp'?'product':'industry')}, extensions=False, diagonal_correction=None, calc_all=False)`:
        `parse_figaro(path=source, table="IOT", year=${year}, iot_mode="product", calc_all=False)`};
    const proxy=state.tradeScope==='goods_proxy';
    const mappingId=row.recipe.id.replace(/^trade-/,'').replace('figaro-standard-','figaro-');
    const chooseItems=!proxy?'items = None':r.family==='FIGARO'&&r.version==='E3'?
      'import re\nlabels = db.get_index("Commodity" if db.table_type == "SUT" else "Sector")\nitems = [label for label in labels if re.match(r"^(?:CPA_)?[ABC]\\d", str(label))]':
      `import json\nfrom urllib.request import urlopen\nwith urlopen("https://raw.githubusercontent.com/it-is-me-mario/database-explorer/d19b0036d4023ad3710d077d4b626db87f4404d6/doc/source/_static/data/economy/sector-sections.json") as response:\n    mapping = json.load(response)["mappings"][${JSON.stringify(mappingId)}]\nlabels = db.get_index("Commodity" if db.table_type == "SUT" else "Sector")\nsections = {entry["native_label"]: entry["section"] for entry in mapping["entries"]}\nassert all(str(label) in sections for label in labels)\naccepted = {"A", "B", "C", "D"} if mapping["classification_id"] in {"nace-1.1", "cpa-2002"} else {"A", "B", "C"}\nitems = [label for label in labels if sections[str(label)] in accepted]`;
    const regions=new Map(r.regions.filter(x=>x.kind==='country').map(x=>[x.iso3,x.label]));
    const selected=pairs(state.origin,state.destination).map(([a,b])=>[regions.get(a),regions.get(b)]);
    return `# MARIO 1.3.4; set the local source path before running.\n# Source: ${r.source_url}\n# Terms: ${r.license_url}\n# Native accounting boundaries and signed flows are retained.\nimport mario\n\nsource = "/path/to/source"\ndb = mario.${args[r.family]}\n${chooseItems}\nintermediate = db.calc_trades(item=items, intermediate=True, final=False, total=False)\nfinal = db.calc_trades(item=items, intermediate=False, final=True, total=False)\npairs = ${JSON.stringify(selected)}\n# Exact native labels; country-identical pairs were excluded before aggregation.\nfactor = ${r.native_scale} * ${r.usd_per_native_currency}\nintermediate_usd = sum(float(intermediate.at[a, b]) for a, b in pairs) * factor\nfinal_usd = sum(float(final.at[a, b]) for a, b in pairs) * factor\nprint({"intermediate_usd": intermediate_usd, "final_usd": final_usd, "total_usd": intermediate_usd + final_usd})\n# Comtrade is a separate merchandise reference; no HS-to-industry mapping is applied.\n`;
  }
  const api={flow,reference,ratio,csv,group,pairs,aggregate,referenceIndex,referenceTotal,referenceRange,catalogue,years,observations,exportRows,pythonStart};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TradeModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
