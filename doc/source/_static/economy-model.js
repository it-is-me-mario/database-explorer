/* Pure selection and calculation helpers, shared by the browser and its tests. */
((global) => {
  "use strict";
  // Build-generated summaries share recipes, geography and correspondences.
  // They retain whole-economy totals; sector vectors are loaded on demand.
  function unpackBrowserIndex(index) {
    if (index.schema_version !== 1) throw new Error("Unsupported browser data format");
    const snapshots = index.readings.map(reading => ({
      metadata_only: true, summary_only: true, availability: reading.availability,
      recipe: Object.fromEntries(Object.entries(reading.recipe).map(([key, i]) => [key, index.recipe_values[key][i]])),
      regions: index.geographies[reading.geography].map((region, i) => ({...region,
        gdp: reading.totals[i][0], value_added_total: reading.totals[i][1],
        ghg_total: reading.totals[i][2], household_ghg: reading.totals[i][3]})),
      ...(reading.gdp_validation ? {provenance: {gdp_bridge: {validation: reading.gdp_validation}}} : {})
    }));
    const mappings = Object.fromEntries(Object.entries(index.mappings).map(([id, i]) => [id, index.mapping_values[i]]));
    return {snapshots, mappings};
  }
  function commonMappings(data){
    if(!data.definitions)return data.mappings;
    const definitions=Object.fromEntries(Object.entries(data.definitions).map(([id,definition])=>[id,{...definition,entries:definition.entries.map(entry=>({...entry,evidence:data.evidence?.[entry.evidence]||entry.evidence,qualification:data.qualifications?.[entry.qualification]||entry.qualification}))}]));
    const resolve=reference=>{const definition=definitions[reference.definition];if(!definition)throw Error('Unknown common-sector definition '+reference.definition);return {...definition,...reference,...(reference.additional_mappings?{additional_mappings:reference.additional_mappings.map(resolve)}:{})};};
    return Object.fromEntries(Object.entries(data.mappings).map(([id,reference])=>[id,resolve(reference)]));
  }
  const needsDetailedReading = (snapshot, state) => snapshot.metadata_only === true &&
    !(Array.isArray(state.section) && !state.section.length) &&
    !(Array.isArray(state.country) && !state.country.length) &&
    !(snapshot.summary_only === true && state.section === "all");
  const version = r => r.source === "WIOD" ? [r.release,r.price_basis || "Current prices",r.table || r.parser_options?.table || "IOT"].join(" · ") : (r.source === "ADB" || r.source === "EMERGING" || r.source === "EORA" || r.source === "OECD" && r.parser_options?.dataset === "ICIO") ? String(r.release) : [r.release, r.parser_options?.unit === "Hybrid" ? `hybrid ${r.parser_options?.table || r.table || "SUT"}` : r.table==="SUT" || r.parser_options?.table==="SUT" ? "SUT" : r.parser_options?.system || r.native_system || (r.parser_options?.iot_mode==="product"?"pxp":r.parser_options?.iot_mode==="industry"?"ixi":null) || (r.source==="EXIOBASE"&&r.parser_options?.table==="SUT"?"SUT":r.dimension)].filter(Boolean).join(" · ");
  const seriesKey = r => JSON.stringify([r.source, ...Object.values(recipeFacets(r))]);
  const key = r => r.iso3 || r.code;
  const unique = xs => [...new Set(xs)];
  const recentYears = (available, count, currentYear = new Date().getFullYear()) =>
    unique(available.map(Number)).filter(year => year < currentYear).sort((a,b)=>a-b).slice(-count);
  // Browser scope is international: at least two individually represented
  // countries, independently of whether a complete World total is available.
  const isMRIO = snapshot => unique(snapshot.regions.filter(r=>r.kind==='country').map(r=>r.iso3||r.code||r.label)).length>1;
  const reference = (wb, iso, year) => (wb.countries[iso] || wb.aggregates?.[iso])?.years[String(year)] || {};
  const isWorld = country => country === "world" || country === "all";
  const isGlobal = snapshot => snapshot.recipe.world_total_available !== false && (snapshot.recipe.world_total_available === true || ["EXIOBASE","ADB","Asian Development Bank","OECD","FIGARO","WIOD","EMERGING"].includes(snapshot.recipe.source));
  function regionKey(snapshot, region) {
    if (region.kind === "country") return key(region);
    const geography=snapshot.regions.map(key).sort().join("|");
    let hash=2166136261;for(const c of geography)hash=Math.imul(hash^c.charCodeAt(0),16777619);
    return `aggregate:${snapshot.recipe.source}:${(hash>>>0).toString(16)}:${key(region)}`;
  }
  const findRegion = (snapshot, selection) => snapshot?.regions.find(r=>regionKey(snapshot,r)===selection);
  function regionChoices(snapshots) {
    const choices=new Map();
    for(const s of snapshots)for(const r of s.regions){
      const id=regionKey(s,r);
      if(!choices.has(id)) choices.set(id,{...r,id,source:s.recipe.source,versions:[]});
      const item=choices.get(id);item.versions=unique([...item.versions,version(s.recipe)]);
    }
    return [...choices.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  const metricAvailable = (snapshots, metric) => snapshots.length>0 && snapshots.every(s=>metric==="ghg"&&s.recipe?.ghg_usable===false ? false : s.metadata_only ? s.availability?.[metric] === true : s.regions.length>0 && s.regions.every(r=>metric==="gdp"?r.gdp!=null:Array.isArray(r[metric])));
  const includes = (selection, value) => selection === "all" || (Array.isArray(selection) ? selection.map(String).includes(String(value)) : String(selection) === String(value));
  const selectedYears = (snapshots, state) => state.year === "all" ? years(snapshots, state) : (Array.isArray(state.year) ? state.year : [state.year]).map(Number).sort((a,b)=>a-b);
  // A reading is one combination of units, release, table format and IOT system.
  function recipeFacets(recipe) {
    const p=recipe.parser_options || {}, format=recipe.table || p.table || "IOT";
    // The Hybrid HIOT parser maps its columns onto the product axis.
    const system=format === "SUT" ? null : p.system || recipe.native_system || (p.iot_mode === "product" || recipe.source === "EXIOBASE" && p.unit === "Hybrid" ? "pxp" : p.iot_mode === "industry" ? "ixi" : recipe.dimension || null);
    return {units:recipe.native_units || p.unit || "Monetary", version:String(recipe.release ?? ""), format, system, price:recipe.price_basis || "Current prices"};
  }
  function focusFacets(snapshots, family, requested={}, selectedYears="all") {
    const recipes=snapshots.filter(s=>s.recipe.source===family).map(s=>s.recipe);
    const period=selectedYears==="all"?[]:(Array.isArray(selectedYears)?selectedYears:[selectedYears]).map(Number);
    // Every explicitly selected year must have a reading for an offered option.
    const eligible=(pool,key)=>unique(pool.map(r=>recipeFacets(r)[key])).filter(value=>value!=null &&
      period.every(year=>pool.some(r=>Number(r.year)===year&&recipeFacets(r)[key]===value)));
    const familyUnits=unique(recipes.map(r=>recipeFacets(r).units));
    const allUnits=eligible(recipes,"units");
    function keep(selection, available, fallback) {
      // An empty upstream facet must not erase a still-valid downstream preference.
      if(!available.length)return selection ?? [];
      if(selection==="all")return available.length===1?[available[0]]:"all";
      const kept=(selection==null?[]:Array.isArray(selection)?selection:[selection]).filter(v=>available.includes(v));
      return kept.length?kept:selection!=null&&Array.isArray(selection)&&!selection.length?[]:fallback?[fallback]:[];
    }
    const units=keep(requested.units,allUnits,allUnits.includes("Monetary")?"Monetary":allUnits[0]);
    const unitRecipes=recipes.filter(r=>includes(units,recipeFacets(r).units));
    const releases=eligible(unitRecipes,"version").sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
    const hasVersions=recipes.some(r=>r.release);
    const selectedVersion=hasVersions?keep(requested.version,releases,releases[0]):"all";
    const versionRecipes=unitRecipes.filter(r=>includes(selectedVersion,recipeFacets(r).version));
    const prices=eligible(versionRecipes,"price").sort();
    const price=keep(requested.price,prices,prices.includes("Current prices")?"Current prices":prices[0]);
    const priceRecipes=versionRecipes.filter(r=>includes(price,recipeFacets(r).price));
    const formats=eligible(priceRecipes,"format").sort();
    const format=keep(requested.format,formats,formats.includes("IOT")?"IOT":formats[0]);
    const formatRecipes=priceRecipes.filter(r=>includes(format,recipeFacets(r).format));
    const systems=eligible(formatRecipes,"system").sort();
    const system=keep(requested.system,systems,systems.includes("ixi")?"ixi":systems[0]);
    // SUTs have no IOT system; a System selection only filters applicable IOTs.
    const versions=unique(formatRecipes.filter(r=>recipeFacets(r).system==null || includes(system,recipeFacets(r).system)).map(version));
    const fields=[...(family==="EXIOBASE"||familyUnits.length>1?[{key:"units",label:"Units",options:allUnits}]:[]),
      ...(hasVersions?[{key:"version",label:"Version",options:releases}]:[]),
      ...(unique(recipes.map(r=>recipeFacets(r).price)).length>1?[{key:"price",label:"Price basis",options:prices}]:[]),
      ...(family==="EXIOBASE"||unique(recipes.map(r=>recipeFacets(r).format)).length>1?[{key:"format",label:"Table format",options:formats}]:[]),
      ...(family==="EXIOBASE"||unique(recipes.map(r=>recipeFacets(r).system).filter(v=>v!=null)).length>1?[{key:"system",label:"System",options:systems,
        notApplicable:formatRecipes.length>0&&formatRecipes.every(r=>recipeFacets(r).system==null)}]:[])];
    return {selection:{units,version:selectedVersion,format,system,...(prices.length>1?{price}: {})}, fields, versions};
  }
  function latestVersions(snapshots, family) {
    const recipes=snapshots.filter(s=>s.recipe.source===family).map(s=>s.recipe);
    // Regular and Extended are coexisting ICIO variants, not successive releases.
    if(family === "OECD" && recipes.every(r=>r.parser_options?.dataset === "ICIO")) {
      const latestYear=Math.max(...recipes.map(r=>r.year));
      return unique(recipes.filter(r=>r.year===latestYear).map(version));
    }
    if(family === "WIOD") return unique(recipes.filter(r=>r.price_basis!=="Previous year prices").map(version));
    if(family === "ADB") {
      const largest=Math.max(...recipes.map(r=>Number.parseInt(r.release,10)));
      return unique(recipes.filter(r=>Number.parseInt(r.release,10)===largest).map(version));
    }
    if(recipes.every(r=>!r.release))return unique(recipes.map(version));
    const releases=unique(recipes.map(r=>r.release));
    const numeric=releases.every(r=>/^\d+(\.\d+)*$/.test(String(r)));
    releases.sort((a,b)=>numeric?String(b).localeCompare(String(a),undefined,{numeric:true}):
      Math.max(...recipes.filter(r=>r.release===b).map(r=>r.year))-Math.max(...recipes.filter(r=>r.release===a).map(r=>r.year)));
    return unique(recipes.filter(r=>r.release===releases[0]).map(version));
  }
  function selected(snapshots, state, includeYear = true) {
    return snapshots.filter(s => state.families.includes(s.recipe.source) &&
      (!state.environmentallyExtended || metricAvailable([s], 'ghg')) &&
      (!state.versions[s.recipe.source] || includes(state.versions[s.recipe.source], version(s.recipe))) &&
      (!includeYear || includes(state.year, s.recipe.year)));
  }
  function countryOptions(snapshots, state) {
    const readings=selected(snapshots,state), regions=regionChoices(readings);
    const hasWorld=readings.some(isGlobal), requested=state.country;
    const kept=(Array.isArray(requested)?requested:[requested]).filter(id=>regions.some(r=>r.id===id));
    const selection=Array.isArray(requested)&&!requested.length?[]:isWorld(requested)&&hasWorld?"world":kept.length===1?kept[0]:kept.length?kept:
      hasWorld?"world":regions[0]?.id || [];
    return {regions,hasWorld,selection};
  }
  function metricAvailableForSelection(snapshots, state, metric) {
    // Explicitly reviewed source errors create gaps in an otherwise available
    // time series. Ordinary missing extensions still disable the indicator.
    const readings=selected(snapshots,state);
    const eligible=metric==="ghg"?readings.filter(s=>s.recipe.ghg_usable!==false):readings;
    if(!metricAvailable(eligible,metric))return false;
    // A selected family/version without this indicator cannot become eligible
    // merely because its readings are absent in the requested year.
    const combinations=new Map();
    for(const s of selected(snapshots,state,false)) {
      const id=seriesKey(s.recipe);
      combinations.set(id,(combinations.get(id)||false)||metricAvailable([s],metric));
    }
    return [...combinations.values()].every(Boolean);
  }
  const years = (snapshots, state) => unique(selected(snapshots, state, false).map(s => s.recipe.year)).sort((a,b) => a-b);
  const HOUSEHOLDS = "households", HOUSEHOLDS_LABEL = "Households · direct emissions";
  const householdEmissions = (snapshot, region) => snapshot.recipe.final_demand_emissions_loaded === false ? null : region.household_ghg ?? null;
  function sectorSelection(snapshot,mapping,section,metric='value_added') {
    if(section==='all')return {indices:(metric==='ghg'?snapshot.recipe.ghg_sectors||snapshot.recipe.sectors||[]:snapshot.recipe.sectors||[]).map((_,i)=>i),reason:''};
    let selectedMapping=mapping;
    if(metric==='ghg'&&snapshot.recipe.ghg_sectors){
      const labels=snapshot.recipe.ghg_sectors;
      selectedMapping=[mapping,...mapping?.additional_mappings||[]].find(candidate=>candidate?.entries?.length===labels.length&&candidate.entries.every(e=>e.native_label===labels[e.index]));
      if(!selectedMapping)return {indices:[],reason:'No reviewed common-sector mapping for the emissions account axis.'};
    }
    if(selectedMapping?.classification_id!=='nace-2-common')return {indices:selectedMapping?.entries.filter(e=>e.section===section).map(e=>e.index)||[],reason:''};
    const scopeNote=selectedMapping.coverage_interpretation==='possible_native_scope_not_exhaustive_target_membership'?'These sections describe possible native scope, not exhaustive target-section membership.':selectedMapping.coverage_interpretation==='native_main_activity_proxy'?'NACE Rev. 2 macrosector proxies: whole native categories follow their main activity/product; source boundary differences are documented in the notes.':'';
    const wanted=String(section).split('+'),members=e=>e.section==='unassigned'?['unassigned']:e.section_codes||String(e.section||'').split('+').filter(Boolean);
    const partial=selectedMapping.entries.filter(e=>members(e).some(code=>wanted.includes(code))&&!members(e).every(code=>wanted.includes(code)));
    if(partial.length)return {indices:[],reason:'The selected section crosses an indivisible native group: '+unique(partial.map(e=>e.section)).join(', ')+'. Select a composite containing every section in the group.',note:scopeNote};
    const available=new Set(selectedMapping.entries.flatMap(members)),missing=wanted.filter(code=>!available.has(code));
    if(missing.length)return {indices:[],reason:'No reviewed common-sector coverage for '+missing.join(', ')+'.',note:scopeNote};
    return {indices:selectedMapping.entries.filter(e=>members(e).length&&members(e).every(code=>wanted.includes(code))).map(e=>e.index),reason:'',note:[scopeNote,!wanted.includes('unassigned')&&selectedMapping.entries.some(e=>e.section==='unassigned')?'Identified mapped portion of the selected sections. Unassigned native categories remain a separate selectable group and are included in the whole-economy total.':''].filter(Boolean).join(' ')};
  }
  function sectorIndices(snapshot,mapping,section,metric='value_added'){return sectorSelection(snapshot,mapping,section,metric).indices;}
  function value(snapshot, region, state, wb, mapping) {
    if (!snapshot || !region || state.metric==="ghg"&&snapshot.recipe.ghg_usable===false) return null;
    const r = snapshot.recipe;
    let result;
    if (state.section === HOUSEHOLDS) result = state.metric === "ghg" ? householdEmissions(snapshot, region) : null;
    else if (state.metric === "gdp") result = region.gdp ?? null;
    else if (snapshot.summary_only) {
      // Never substitute a whole-economy total for a requested sector.
      result = state.section === "all" ? region[state.metric + "_total"] ?? null : null;
    }
    else {
      const indices = sectorIndices(snapshot, mapping, state.section, state.metric);
      result = region[state.metric] && indices.length ? indices.reduce((sum,i) => sum + region[state.metric][i], 0) : null;
    }
    if (result == null) return null;
    if (state.metric === "ghg" && state.section === "all" && r.final_demand_emissions_loaded !== false && region.household_ghg != null) result += region.household_ghg;
    if (!isEmissionsMetric(state.metric)) {
      const exchange = r.year >= 1999 ? reference(wb, "DEU", r.year).local_currency_per_usd : null;
      const euroRate = wb.currency_rates?.EUR?.years[String(r.year)] ?? (exchange > 0 ? 1 / exchange : null);
      const rate = r.currency === "USD" ? 1 : r.currency === "EUR" ? euroRate : null;
      if (rate == null) return null;
      result *= rate;
    }
    if (state.perCapita) {
      if (state.section !== "all" || region.kind !== "country") return null;
      const population = reference(wb, region.iso3, r.year).population;
      if (!(population > 0)) return null;
      result /= population;
    }
    else if (isEmissionsMetric(state.metric)) result /= isWorld(state.country) ? 1e6 : 1000; // Match native EDGAR Mt (world) or Gg (country).
    return Number.isFinite(result) ? result : null;
  }
  const basis = (recipe, metric) => metric === "gdp" ? recipe.gdp_basis : metric === "ghg" ? recipe.ghg_basis || "Industry production accounts" : recipe.value_added_basis || "Industry production accounts";
  const unit = state => (isEmissionsMetric(state.metric) ? (state.perCapita ? "t CO₂eq" : state.metric === "ghg_trade" ? "t CO₂eq" : isWorld(state.country) ? "Mt CO₂eq" : "Gg CO₂eq") : state.priceBasis === "Previous year prices" ? "previous-year US$" : state.priceBasis === "mixed" ? "US$ (mixed price bases)" : "current US$") + (state.perCapita ? " / person" : "");
  function worldValue(snapshot, state, wb, mapping) {
    if(!snapshot || !isGlobal(snapshot)) return null;
    const values=snapshot.regions.map(r=>value(snapshot,r,{...state,country:"world",perCapita:false},wb,mapping));
    if(!values.length||values.some(v=>v==null))return null;
    const total=values.reduce((a,b)=>a+b,0);
    if(!state.perCapita)return total;
    const population=reference(wb,"WLD",snapshot.recipe.year).population;
    return state.section==="all"&&population>0?total*(isEmissionsMetric(state.metric)?1e6:1)/population:null;
  }
  const isEmissionsMetric = metric => ['ghg','ghg_footprint','ghg_trade'].includes(metric);
  const isReference = row => ["World Bank","EDGAR"].includes(row.database);
  const sectionName = (mapping, section) => section === "all" ? "Whole economy" : section === HOUSEHOLDS ? HOUSEHOLDS_LABEL : mapping?.sections?.[section] ? `${section} · ${mapping.sections[section]}` : String(section);
  function observations(snapshots, state, wb, mappings, edgar = {countries:{}}) {
    if(Array.isArray(state.country))return state.country.flatMap(country=>observations(snapshots,{...state,country},wb,mappings,edgar));
    // Several sector aggregates: one row per aggregate (charts stack them; whole-economy references are not repeated).
    if(Array.isArray(state.section)){
      const rows=state.section.flatMap(section=>observations(snapshots,{...state,section},wb,mappings,edgar)),members=state.section.flatMap(section=>String(section).split('+'));
      const overlap=new Set(members).size!==members.length||state.section.length>1&&state.section.includes('all');
      return overlap?rows.filter(row=>!isReference(row)).map(row=>({...row,value:null,world_bank:null,difference_percent:null,note:'Selected sector aggregates overlap. Choose non-overlapping sections before comparing their values.'})):rows;
    }
    const world=isWorld(state.country), country=world?"world":state.country, referenceCode=world?"WLD":country;
    const available=selected(snapshots,state,false), templates=[...new Map(available.map(s=>[seriesKey(s.recipe),s])).values()];
    const period=selectedYears(snapshots,state), rows=[];
    for(const template of templates) for(const year of period) {
      const s=available.find(s=>seriesKey(s.recipe)===seriesKey(template.recipe)&&s.recipe.year===year);
      const region=findRegion(s,country), mapping=s&&mappings[s.recipe.id];
      const val=world?worldValue(s,state,wb,mapping):value(s,region,state,wb,mapping);
      const name=world?"World":region?.name || regionChoices(available).find(r=>r.id===country)?.name || country;
      let note=!s?`Available years: ${available.filter(x=>seriesKey(x.recipe)===seriesKey(template.recipe)).map(x=>x.recipe.year).join(", ")}`:
        world&&!isGlobal(s)?s.recipe.scope_note || "National model; a World total is not available":
        !world&&!region?"Region is not represented with this definition in this reading":
        state.metric==="ghg"&&!metricAvailable([s],"ghg")?s.recipe.ghg_unavailable_reason||"No verified GHG aggregate":
        state.section===HOUSEHOLDS&&val==null?"Direct household emissions are not available in this reading":
        ["gdp","value_added"].includes(state.metric)&&s.recipe.value_added_available===false?"GDP and value added are not supplied by this reading":
        state.metric==="gdp"&&val==null?"GDP tax bridge not verified; value added is available":val==null&&state.section!=="all"&&state.section!==HOUSEHOLDS?sectorSelection(s,mapping,state.section,state.metric).reason||"No matching sector result, population or exchange rate":val==null?"No matching population or exchange rate":"";
      if(val!=null&&state.metric==="gdp"&&s.recipe.gdp_bridge_verified===false)note=s.recipe.gdp_proxy?s.recipe.gdp_note:"GDP estimate; market-price bridge unverified";
      if(val!=null&&state.metric==="gdp"&&s.recipe.gdp_quality_note)note=[note,s.recipe.gdp_quality_note].filter(Boolean).join(" ");
      if(val!=null&&state.metric==="ghg") note=[s.recipe.ghg_note, state.section==="all" ? s.recipe.final_demand_emissions_loaded===false ? "Direct final-demand emissions unavailable; industry/commodity accounts only." : "Includes direct final-demand emissions where supplied." : state.section===HOUSEHOLDS ? "Direct final-demand emissions of households, not allocated to producer sectors." : "Producer accounts only; direct final-demand emissions are not allocated to sectors."].filter(Boolean).join(" ");
      if(val!=null&&state.section!=="all"&&state.section!==HOUSEHOLDS)note=[note,sectorSelection(s,mapping,state.section,state.metric).note].filter(Boolean).join(' ');
      const wbVal=state.metric==="gdp"&&template.recipe.price_basis!=="Previous year prices"?reference(wb,referenceCode,year)[state.perCapita?"gdp_per_capita":"gdp"]??null:null;
      rows.push({series:seriesKey(template.recipe),database:template.recipe.source,...recipeFacets(template.recipe),release:String(template.recipe.release ?? ""),version:version(template.recipe),year,country,country_name:name,
        label:`${name} · ${template.recipe.source} · ${version(template.recipe)}`+(state.section==="all"?"":` · ${sectionName(mapping,state.section)}`),indicator:state.metric,sector:state.section,sector_name:sectionName(mapping,state.section),classification:mapping?.classification||"",
        unit:unit(state),value:val,gwp_basis:state.metric==="ghg"?template.recipe.gwp_basis||"":"",gwp_horizon:state.metric==="ghg"?template.recipe.gwp_horizon??null:null,world_bank:wbVal,difference_percent:val!=null&&wbVal>0?(val/wbVal-1)*100:null,basis:basis(template.recipe,state.metric),note});
    }
    if(state.metric==="gdp"&&!available.some(s=>s.recipe.price_basis==="Previous year prices"))for(const year of period) {
      const v=reference(wb,referenceCode,year)[state.perCapita?"gdp_per_capita":"gdp"];
      if(v!=null)rows.push({series:"World Bank",database:"World Bank",version:"WDI",year,country,country_name:world?"World":wb.countries[country]?.name||country,
        indicator:"gdp",sector:"all",classification:"",unit:unit(state),value:v,world_bank:null,difference_percent:null,basis:"GDP at market prices",note:"External reference; published World Bank value"});
    }
    if(state.metric==="ghg"&&state.section==="all")for(const year of period){
      const entry=state.perCapita?edgar.per_capita?.[referenceCode]:world?edgar.world:edgar.countries[country];
      const v=entry?.years[String(year)];
      const report=world||state.perCapita;
      if(v!=null)rows.push({series:"EDGAR",database:"EDGAR",version:"2026 · AR5",year,country,country_name:world?"World":entry.name,
        indicator:"ghg",sector:"all",classification:"",unit:unit(state),value:v,gwp_basis:edgar.gwp||"",world_bank:null,difference_percent:null,
        source_url:report?edgar.report.source_url:edgar.source_url,download_url:report?edgar.report.download_url:edgar.download_url,
        gwp_basis:"IPCC AR5",gwp_horizon:100,basis:"Territorial GHG; excludes LULUCF; AR5 GWP100",note:"Published reference, unchanged; household emissions included. Different boundary from MRIO accounts; some source territories are grouped."});
    }
    return rows;
  }
  function automaticView(snapshots, state) {
    return selectedYears(snapshots,state).length>1?"series":"comparison";
  }
  function exportRows(rows,snapshots,state,scale,charts) {
    // References remain in the chart. Export only selected MRIO observations;
    // in particular, do not redistribute re-scaled IEA-EDGAR reference cells.
    const result=rows.filter(r=>!isReference(r)).map(r=>{
      const recipe=snapshots.find(s=>s.recipe.source===r.database&&version(s.recipe)===r.version&&s.recipe.year===r.year)?.recipe;
      const fx=state.metric!=="ghg"&&recipe?.currency&&recipe.currency!=="USD";
      const ecu=fx&&recipe.currency==="EUR"&&r.year<1999;
      const wbInputs=[...(fx&&!ecu?["official exchange rates (PA.NUS.FCRF)"]:[]),...(state.perCapita?["population (SP.POP.TOTL)"]:[])];
      const inputSources=[...(wbInputs.length?["World Bank, World Development Indicators: "+wbInputs.join("; ")+". CC BY 4.0."]:[]),...(ecu?["Eurostat annual EUR/ECU exchange rates; Eurostat data reuse policy."]:[])];
      return {database:r.database,version:r.version,units:r.units||"",table_format:r.format||"",system:r.system||"",price_basis:r.price||"",year:r.year,country:r.country||state.country,
        indicator:state.metric,legend_by:state.legendBy||'auto',sector:Array.isArray(r.sector)?r.sector.join("; "):r.sector||state.section,
        classification:r.classification||"",value:charts.scaled(r.value,scale),unit:scale.unit,
        basis:r.basis||"",gwp_basis:r.gwp_basis||"",gwp_horizon:r.gwp_horizon??"",note:r.note||"",
        source_url:recipe?.source_url||"",source_license_url:recipe?.license_url||"",attribution:recipe?.attribution||recipe?.label||"",
        additional_inputs:inputSources.join(" "),additional_input_terms:[...(wbInputs.length?["https://datacatalog.worldbank.org/public-licenses"]:[]),...(ecu?["https://ec.europa.eu/eurostat/help/copyright-notice"]:[])].join("; "),
        changes:"MARIO-derived aggregate; see accounting basis and method. Monetary conversion and per-capita adjustment apply where selected; any additional input providers are credited. Reference observations are not included."};
    });
    if(result.length)for(const key of Object.keys(result[0])) {
      if(result.every(row=>row[key]===""))for(const row of result)delete row[key];
    }
    return result;
  }
  // Characterisation convention of one GHG row, from its declared GWP basis.
  function gwpConvention(row){
    const text=row.gwp_basis||"",horizon=row.gwp_horizon??(Number(text.match(/GWP\s*(\d+)/i)?.[1])||null),report=text.match(/AR(\d)/)?.[1];
    if(/CO2 only/i.test(text))return {key:"co2",label:"fossil CO2 only, GWP = 1"};
    if(/CO2, CH4, N2O only/i.test(text))return {key:"AR5-three-gas",label:"AR5 for CO₂/CH₄/N₂O only"};
    if(/source HFC\/PFC CO2eq retained/i.test(text))return {key:"AR5-mixed-HFC",label:"AR5 for mass gases; source HFC/PFC basis unverified"};
    if(/other F-gases unverified/i.test(text))return {key:"AR5-core",label:"native CO₂eq; AR5 GWP100 for principal gases"};
    if(report&&horizon)return {key:`AR${report}-${horizon}`,label:`GWP${horizon}, IPCC AR${report}`};
    return {key:"source",label:"source CO2eq; IPCC report and horizon unverified"};
  }
  const api = {isEmissionsMetric,HOUSEHOLDS, HOUSEHOLDS_LABEL, unpackBrowserIndex, commonMappings, gwpConvention, needsDetailedReading, isMRIO, countryOptions, metricAvailableForSelection, recipeFacets, focusFacets, isWorld, isGlobal, regionKey, findRegion, regionChoices, metricAvailable, worldValue, isReference, includes, selectedYears, latestVersions, version, seriesKey, key, unique, recentYears, reference, selected, years, sectorSelection, sectorIndices, value, basis, unit, observations, automaticView, exportRows};
  if (typeof module !== "undefined") module.exports = api;
  else global.MarioEconomy = api;
})(globalThis);
