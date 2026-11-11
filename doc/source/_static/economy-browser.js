/* Pinned local observations, rendered with the documentation Plotly runtime. */
(() => {
  "use strict";
  const root = document.querySelector("[data-economy-browser]");
  if (!root) return;
  const M = window.MarioEconomy;
  const C = window.MarioEconomyCharts;
  const T = window.TradeModel, TC = window.MarioTradeCharts, P = window.MarioComparison, A = window.MarioAccounts;
  const base = new URL(root.dataset.root || "../../", location.href);
  const asset = path => new URL("_static/" + path, base).href;
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const compact = x => x == null ? "Unavailable" : new Intl.NumberFormat("en", {notation:"compact",maximumFractionDigits:2}).format(x);
  const exact = x => x == null ? "—" : new Intl.NumberFormat("en", {maximumFractionDigits:2}).format(x);
  const getJSON = window.MarioJSONAssets.create(new URL("_static/",base)).getJSON;
  const save = (text,name,mime) => {const url=URL.createObjectURL(new Blob([text],{type:mime})); const a=document.createElement("a"); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const csv = rows => {
    const cell = x => '"'+String(x??"").replace(/^[=+@\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';
    return "\ufeff"+[M.unique(rows.flatMap(Object.keys)),...rows.map(row=>M.unique(rows.flatMap(Object.keys)).map(key=>row[key]))].map(row=>row.map(cell).join(",")).join("\r\n");
  };
  Promise.all([getJSON("data/economy/browser-index.json"),getJSON("data/economy/world-bank.json"),getJSON("data/world-country-map.json"),getJSON("data/economy/edgar.json"),getJSON("data/trade/manifest.json"),getJSON("data/database_licences.json"),getJSON("data/accounts/manifest.json"),getJSON("data/embodied-trade/manifest.json"),getJSON("data/economy/common-sector-sections.json")])
    .then(async ([index,wb,world,edgar,tradeManifest,licences,accountManifest,embodiedManifest,commonSectors]) => {
      const unpacked = M.unpackBrowserIndex(index), mappings = M.commonMappings(commonSectors);
      let snapshots = P.curate(unpacked.snapshots);
      const economySnapshots=snapshots, tradeSnapshots=T.catalogue(tradeManifest);
      const legacyAccounts=await Promise.all(accountManifest.readings.map(r=>getJSON('data/accounts/'+r.file)));
      const embodiedReadings=await Promise.all(embodiedManifest.readings.map(async entry=>{const data=await getJSON('data/embodied-trade/'+entry.file);return {...data,...entry,sector_files:entry.sector_files||data.sector_files||{}};}));
      const embodiedByID=new Map(embodiedReadings.map(r=>[r.recipe.id,r]));
      const accountReadings=legacyAccounts.map(data=>A.mergeCountryAccounts(data,embodiedByID.get(data.recipe.id))),accountsByID=new Map(accountReadings.map(r=>[r.id,r]));
      for(const data of embodiedReadings)if(!accountsByID.has(data.recipe.id)&&data.accounts){const merged=A.mergeCountryAccounts(null,data);accountReadings.push(merged);accountsByID.set(merged.id,merged);}
      for(let i=0;i<economySnapshots.length;i++)economySnapshots[i]=A.attach(economySnapshots[i],accountsByID.get(economySnapshots[i].recipe.id));
      const originalIDs=new Set(economySnapshots.map(s=>s.recipe.id));
      for(const data of accountReadings)if(!originalIDs.has(data.id)){
        economySnapshots.push(A.attach({metadata_only:true,summary_only:true,availability:{},recipe:data.recipe,regions:data.regions.map(r=>({code:r.code||r.label,name:r.name||r.code||r.label,iso3:r.iso3,kind:r.kind}))},data));
      }
      const mergedTradeReadings=A.mergeTradeReadings(legacyAccounts,embodiedReadings);
      const embodiedSnapshots=Object.fromEntries(['ghg_trade','value_added_trade'].map(metric=>[metric,A.embodiedCatalogue(mergedTradeReadings,T,metric,wb,M)]));
      let tradeReferenceIndex=null;
      const ensureTradeReferences=async()=>{if(!tradeReferenceIndex)tradeReferenceIndex=T.referenceIndex((await getJSON("data/trade/comtrade.json")).observations);};
      // Keep international MRIO readings; retain national snapshots outside this UI.
      for (let i = snapshots.length - 1; i >= 0; i--) if (!M.isMRIO(snapshots[i]) || snapshots[i].recipe.price_basis === "Previous year prices") snapshots.splice(i, 1);
      const pendingSnapshots = new Map();
      let renderSequence = 0;
      const ensureLoaded = async snapshot => {
        if(snapshot.trade) {
          if(!snapshot.reading) {
            if(!pendingSnapshots.has(snapshot.recipe.id))pendingSnapshots.set(snapshot.recipe.id,getJSON('data/trade/'+snapshot.file).then(reading=>{
              snapshot.reading=reading;Object.assign(snapshot.recipe,{attribution:reading.attribution,source_url:reading.source_url,license_url:reading.license_url});
            }).catch(error=>{pendingSnapshots.delete(snapshot.recipe.id);throw error;}));
            await pendingSnapshots.get(snapshot.recipe.id);
          }
          if(snapshot.reading?.embodied_metric){
            const sectors=T.sectorSelection(snapshot.reading,state.section);
            for(const code of sectors.groups||[])if(!snapshot.reading.sector_flows[code]){
              const file=snapshot.sector_files[code],key='embodied-sector:'+file;
              if(!pendingSnapshots.has(key))pendingSnapshots.set(key,getJSON('data/embodied-trade/'+file).catch(error=>{pendingSnapshots.delete(key);throw error;}));
              A.attachTradeSector(snapshot,await pendingSnapshots.get(key));
            }
          }
          return;
        }
        if (A.isAccount(state.metric)&&snapshot.account){
          const sectors=T.sectorSelection(snapshot.account,state.section);
          for(const code of sectors.groups||[])if(!snapshot.account.sector_accounts?.[code]){
            const file=snapshot.account.sector_files[code],key='embodied-sector:'+file;
            if(!pendingSnapshots.has(key))pendingSnapshots.set(key,getJSON('data/embodied-trade/'+file).catch(error=>{pendingSnapshots.delete(key);throw error;}));
            A.attachAccountSector(snapshot,await pendingSnapshots.get(key));
          }
          return;
        }
        if (!M.needsDetailedReading(snapshot, state)) return;
        const id = snapshot.recipe.id;
        if (!pendingSnapshots.has(id)) pendingSnapshots.set(id, getJSON(`data/economy/${id}.json`).then(loaded=>{
          const index = economySnapshots.findIndex(s=>s.recipe.id===id);
          if(index>=0)economySnapshots[index] = A.attach(loaded,accountsByID.get(id));
        }).catch(error=>{pendingSnapshots.delete(id);throw error;}));
        await pendingSnapshots.get(id);
      };
      let families=M.unique(snapshots.map(s=>s.recipe.source)).sort((a,b)=>a==="EXIOBASE"?-1:b==="EXIOBASE"?1:a.localeCompare(b));
      const state = {families:families.filter(f=>snapshots.some(s=>s.recipe.source===f&&M.metricAvailable([s],"gdp"))),versions:{},year:"all",metric:"gdp",section:"all",perCapita:false,country:"world",origin:["CHN"],destination:["ITA"],tradeUse:"total",tradeScope:"all",tradeOrigin:"total",accountUse:"total",accountComponent:"total",demandGroup:"total",environmentallyExtended:false};
      const versionChoices={}, compareFacets={}, openFamilies=new Set();
      const DEFAULT_YEARS=20;
      let defaultYears=true;
      let manualView=null, zoom=1, panX=0, panY=0, drag=null, dragged=false, chartRows=[], displayScale={factor:1,unit:M.unit(state)};
      const $ = selector=>root.querySelector(selector);
      const isTrade=()=>['trade','ghg_trade','value_added_trade'].includes(state.metric);
      const isEmbodiedTrade=()=>A.isEmbodiedTrade(state.metric);
      const currentYears=()=>isTrade()?T.years(candidates(),state):M.selectedYears(comparisonReadings(),state);
      const groupNames=selection=>T.isAll(selection)?'All native regions':T.group(selection).map(code=>tradeManifest.countries.find(r=>r.iso3===code)?.name||code).join(' + ');
      const groupTitle=(selection,kind)=>T.isAll(selection)?'All '+kind:T.group(selection).length>2?T.group(selection).length+' regions':groupNames(selection)||'None';
      const savedModes={};
      let methodFormat='IOT',methodDefinition;
      function switchMetric(metric) {
        if(metric===state.metric)return;
        const previousFamilies=[...state.families],previousYear=structuredClone(state.year);
        savedModes[state.metric]={families:[...state.families],year:structuredClone(state.year),country:structuredClone(state.country),section:structuredClone(state.section),perCapita:state.perCapita,
          versionChoices:structuredClone(versionChoices),compareFacets:structuredClone(compareFacets),manualView,defaultYears,openFamilies:[...openFamilies],accountUse:state.accountUse,accountComponent:state.accountComponent,demandGroup:state.demandGroup,origin:T.group(state.origin),destination:T.group(state.destination),tradeUse:state.tradeUse,tradeScope:state.tradeScope,tradeOrigin:state.tradeOrigin};
        state.metric=metric;state.environmentallyExtended=false;
        snapshots=metric==='trade'?tradeSnapshots:A.isEmbodiedTrade(metric)?embodiedSnapshots[metric]:economySnapshots;
        state.tradeScope=A.isEmbodiedTrade(metric)?'all':savedModes[metric]?.tradeScope||state.tradeScope;
        const allowed=M.unique(P.available(snapshots,state,M).map(s=>s.recipe.source));
        const saved=savedModes[metric],kept=previousFamilies.filter(f=>allowed.includes(f));
        state.families=saved?.families||(!previousFamilies.length?[]:kept.length?kept:allowed);
        state.year=saved?.year??(metric==='trade'?Math.max(...snapshots.map(s=>s.recipe.year)):previousYear);
        state.country=saved?.country??state.country;state.section=saved?.section??'all';state.perCapita=saved?.perCapita??false;state.versions={};
        for(const object of [versionChoices,compareFacets])for(const key of Object.keys(object))delete object[key];
        Object.assign(versionChoices,saved?.versionChoices||{});Object.assign(compareFacets,saved?.compareFacets||{});
        openFamilies.clear();for(const f of saved?.openFamilies||[])openFamilies.add(f);
        manualView=saved?.manualView??null;defaultYears=saved?.defaultYears??false;
        state.accountUse=saved?.accountUse||'total';state.accountComponent=saved?.accountComponent||'total';state.demandGroup=saved?.demandGroup||'total';
        state.origin=saved?.origin||state.origin;state.destination=saved?.destination||state.destination;state.tradeUse=saved?.tradeUse||'total';state.tradeOrigin=saved?.tradeOrigin||'total';
      }
      const title = ()=>((state.metric==="gdp"&&active().length===1&&active()[0].recipe.gdp_bridge_verified===false)?"GDP estimate":({gdp:"GDP",value_added:"Value added",ghg:"GHG emissions",...A.titles,value_added_trade:state.tradeOrigin==='total'?A.titles.value_added_trade:(state.tradeOrigin==='domestic'?'Domestic':'Foreign')+' value added embodied in gross trade',trade:state.tradeUse==="intermediate"?"Intermediate trade":state.tradeUse==="final"?"Final-use trade":"Trade"}[state.metric]))+(state.perCapita?" per capita":"");
      const availableReadings = ()=>P.available(snapshots,state,M);
      const comparisonReadings = ()=>P.eligible(snapshots,state,M);
      const active = ()=>M.selected(comparisonReadings(),state);
      const candidates = ()=>M.selected(comparisonReadings(),state,false);
      const autoView = ()=>isTrade()?"chart":M.automaticView(comparisonReadings(),state);
      const view = ()=>manualView || autoView();
      const mapping = s=>s&&mappings[s.recipe.id];
      const val = (s,r,overrides={})=>A.isAccount(state.metric)?A.value(s,r,{...state,...overrides},wb,M,state.accountComponent==='total'?null:Number(state.accountComponent),T):M.value(s,r,{...state,...overrides},wb,mapping(s));
      const singleCountry = ()=>Array.isArray(state.country)?state.country.length===1?state.country[0]:null:state.country;
      // Sector part of the heading; the map shows one aggregate, the first selected.
      const sectionText = ()=>{
        if(state.section==="all")return "";
        const list=Array.isArray(state.section)?state.section:[state.section], labels=(isEmbodiedTrade()?candidates().find(s=>s.reading?.sector_classification)?.reading.sector_classification.sections:A.isAccount(state.metric)?candidates().find(s=>s.account?.sector_classification)?.account.sector_classification.sections:mapping(candidates()[0])?.sections)||{};
        const one=code=>code===M.HOUSEHOLDS?M.HOUSEHOLDS_LABEL:`${code} · ${labels[code]||code}`;
        return list.length===1?` · ${one(list[0])}`:view()==="map"?` · ${one(list[0])} (map: first selected aggregate)`:` · ${list.length} sector aggregates`;
      };
      const countryName = ()=>isTrade()?groupTitle(state.origin,"origins")+" → "+groupTitle(state.destination,"destinations"):!M.countryOptions(comparisonReadings(),state).regions.length?"No country / region":Array.isArray(state.country)?state.country.length?`${state.country.length} countries / regions`:"No country / region":M.isWorld(state.country)?"World":M.countryOptions(comparisonReadings(),state).regions.find(r=>r.id===state.country)?.name || wb.countries[state.country]?.name || state.country;
      const heading = ()=>`${title()} · ${countryName()}${sectionText()}`;
      const period = ys=>{if(!ys.length)return "No years";const sorted=M.unique(ys.map(Number)).sort((a,b)=>a-b),parts=[];let first=sorted[0],last=first;for(const y of [...sorted.slice(1),null]){if(y===last+1){last=y;continue;}parts.push(first===last?String(first):`${first}–${last}`);first=last=y;}return parts.join(", ");};
      // Databases, years and unit under the heading; long database lists collapse to names and a count.
      const subheading = ()=>{
        const selected=active();
        if(isTrade())return [M.unique(candidates().map(s=>s.recipe.source)).length+" databases selected",period(currentYears()),isEmbodiedTrade()&&state.section!=="all"?"Selected supplying sectors":state.tradeScope==="goods_proxy"?"Goods-producing groups (proxy)":"All sectors",isEmbodiedTrade()&&state.tradeUse!=="total"?(state.tradeUse==="intermediate"?"Intermediate use":"Final use"):""].filter(Boolean).join(" · ");
        if(!selected.length)return "";
        const versions=new Map();
        for(const s of selected){const f=s.recipe.source;if(!versions.has(f))versions.set(f,new Set());versions.get(f).add(M.version(s.recipe));}
        const names=[...versions.keys()], detailed=[...versions].map(([f,vs])=>vs.size===1?`${f} ${[...vs][0]}`.trim():`${f} (${vs.size} versions)`).join(", ");
        const databases=names.length>1?`${names.length} databases`:detailed.length>35?names[0]:detailed;
        return [databases,period(selected.map(s=>s.recipe.year))].filter(Boolean).join(" · ");
      };
      // The subtitle names the prevailing IPCC report and horizon; an asterisk flags any variant, explained in Notes on this comparison.
      // The chart footnote identifies every non-standard basis, including CO2-only proxies and source-characterised gases.
      const gwpSummary = rows=>{
        if(!M.isEmissionsMetric(state.metric))return null;
        const groups=new Map();
        for(const row of rows.filter(r=>r.database!=="World Bank"&&Number.isFinite(r.value))){
          const c=M.gwpConvention(row);
          if(!groups.has(c.key))groups.set(c.key,{...c,databases:new Set()});
          groups.get(c.key).databases.add(row.database==="OECD"?"OECD ICIO":row.database);
        }
        if(!groups.size)return null;
        const conventions=[...groups.values()];
        const family=c=>{const m=c.key.match(/^AR(\d)(?:-(\d+))?/);return m?`AR${m[1]} GWP${m[2]&&!isNaN(m[2])?m[2]:100}`:null;};
        const counts=new Map();
        for(const c of conventions){const f=family(c);if(f)counts.set(f,(counts.get(f)||0)+c.databases.size);}
        if(!counts.size)return {main:conventions.map(c=>c.label).join("; "),footnote:""};
        const main=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
        const plain=c=>family(c)===main&&/^AR\d-\d+$/.test(c.key);
        const qualified=conventions.filter(c=>!plain(c));
        return {main:main+(qualified.length?"*":""),
          footnote:qualified.length?`* ${qualified.map(g=>`${[...g.databases].join(", ")}: ${g.label}`).join("; ")}.`:""};
      };
      const wrapText = (text,width)=>{const lines=[];let line="";for(const word of text.split(" ")){if(line&&(line+" "+word).length>width){lines.push(line);line=word;}else line=line?line+" "+word:word;}if(line)lines.push(line);return lines;};
      const option = (value,label,selected)=>`<option value="${esc(value)}"${value===selected?" selected":""}>${esc(label)}</option>`;
      root.innerHTML=`
        <div class="eb-filter-panel">
          <div class="eb-question-row">
            <label>Indicator<select data-metric><option value="gdp">GDP</option><option value="value_added">Value added</option><option value="ghg">GHG emissions</option><option value="trade">Trade</option><option value="gross_output">Gross output</option><option value="domestic_use">Domestic use</option><option value="final_demand">Final demand</option><option value="value_added_footprint">Value added embodied in final demand</option><option value="ghg_footprint">GHG consumption footprint</option><option value="ghg_trade">GHG embodied in gross trade</option><option value="value_added_trade">Value added embodied in gross trade</option></select></label>
            <p class="eb-question-text" data-indicator-question></p>
            <div class="eb-trade-question" data-trade-controls hidden>
              <label>Trade scope<select data-trade-scope><option value="all">Total: goods and services</option><option value="goods_proxy">Goods-producing groups (proxy)</option></select></label>
              <label data-trade-origin-field hidden>Value-added origin<select data-trade-origin><option value="total">Total</option><option value="domestic">Domestic</option><option value="foreign">Foreign</option></select></label>
              <label>Use<select data-trade-use><option value="total">Total</option><option value="intermediate">Intermediate</option><option value="final">Final</option></select></label>
            </div>
          </div>
          <div class="eb-account-controls" data-account-controls hidden>
            <label data-account-use-field hidden>Use<select data-account-use><option value="total">Total</option><option value="intermediate">Intermediate</option><option value="final">Final</option></select></label>
            <label data-demand-group-field hidden>Demand<select data-demand-group><option value="total">Total final demand</option><option value="households_npish">Households + NPISH</option><option value="government">Government final consumption</option><option value="capital_formation">Gross capital formation</option><option value="other">Other final demand</option></select></label>
            <label data-account-component-field>Origin of contribution<select data-account-component></select></label>
          </div>
          <div class="eb-filters eb-filters--dimensions">
            <div class="eb-multi-field"><span>Years</span><details class="eb-picker" data-picker="year"><summary data-picker-label="year"></summary><div class="eb-picker-options" data-options="year"></div></details></div>
            <div class="eb-multi-field" data-economic-region><span>Country / region</span><details class="eb-picker" data-picker="country"><summary data-picker-label="country"></summary><input type="search" data-country-search aria-label="Find a country or region" placeholder="Search name or ISO code…"><div class="eb-picker-options" data-options="country"></div></details></div>
            ${['origin','destination'].map(kind=>`<div class="eb-multi-field" data-trade-region hidden><span>${kind==='origin'?'Origin regions':'Destination regions'}</span><details class="eb-picker" data-picker="${kind}"><summary data-picker-label="${kind}"></summary><input type="search" data-trade-search="${kind}" aria-label="Find ${kind} region" placeholder="Search name or ISO code…"><div class="eb-picker-options" data-options="${kind}"></div></details></div>`).join('')}
            <div class="eb-multi-field"><span>Sector aggregate</span><details class="eb-picker" data-picker="section"><summary data-picker-label="section"></summary><div class="eb-picker-options" data-options="section"></div></details></div>
            <label data-economic-measure>Measure<select data-measure><option value="total">Total</option><option value="per-capita">Per capita</option></select></label>
          </div>
          <div class="eb-filter-foot"><span data-filter-note></span><a href="${asset("data/economy/sector-correspondence.xlsx")}" data-sector-download download>Sector correspondence · Excel ↗</a></div>
          <details class="eb-database-options" data-database-options><summary>Databases and versions <span data-database-count></span></summary>
          <fieldset class="eb-family-choices" data-families>
            <legend><span>Selection</span><span class="eb-filter-actions" role="group" aria-label="Select databases and versions"><button type="button" data-bulk-filter="databases" data-bulk-action="select">Select all</button><button type="button" data-bulk-filter="databases" data-bulk-action="clear">Unselect all</button></span></legend>
            <div data-family-tree></div><small data-version-default></small>
          </fieldset>
          <details class="eb-unavailable" data-unavailable-choices><summary>Why are other databases unavailable?</summary><div data-unavailable-list></div></details>
          </details>
        </div>
        <div class="eb-viewbar"><div><h3 data-heading></h3><p class="eb-subheading" data-subheading></p><p class="eb-note" data-view-note></p></div><div class="eb-toggle" role="group" aria-label="Visualisation"><button data-view="auto" aria-label="Chart" title="Chart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/></svg></button><button data-view="map" aria-label="Map" title="Map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15M15 6v15"/></svg></button><button data-view="table" aria-label="Table" title="Table"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M10 4v16"/></svg></button></div></div>
        <div class="eb-layout"><div class="eb-visual"><div data-chart></div><div data-map-panel hidden><div class="eb-map-wrap"><svg class="eb-map" data-map viewBox="${esc(world.viewbox)}" role="group" aria-label="Country indicator map"><g data-map-layer></g></svg><div class="eb-zoom" role="group" aria-label="Map zoom"><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="reset">Reset</button></div><a class="eb-credit" href="https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/">Natural Earth · 1:110m</a></div><div class="eb-legend" data-legend></div></div><div data-table-panel hidden></div></div><p class="eb-note eb-gwp-note" data-gwp-note hidden></p>
</div>
        <p class="eb-note eb-indicator-note" data-indicator-note hidden></p><p class="eb-note eb-reference-caption" data-reference-caption></p><p class="eb-note" data-availability role="status"></p>
        <div class="eb-actions"><button class="eb-primary" data-export>Download MRIO data · CSV</button><button data-script aria-describedby="eb-script-hint">Download MARIO code</button><span data-export-label></span><span class="eb-script-hint" id="eb-script-hint" data-script-hint hidden></span></div>
        <div class="eb-explanations">
          <details class="eb-other-notes" data-comparison-notes><summary>Notes on this comparison</summary><div class="eb-disclosure-body"><p class="eb-note eb-chart-help" data-chart-help></p><p class="eb-context" data-indicator-details></p><p class="eb-context" data-context></p><p class="eb-context" data-households hidden></p><div data-reading-notes></div></div></details>
          <details class="eb-other-notes" data-how-it-works><summary>How it works</summary><div class="eb-disclosure-body"><div data-calculation-visual></div><div data-methods-slot></div></div></details>
          <details class="eb-other-notes" data-source-details><summary>Sources &amp; coverage</summary><div class="eb-disclosure-body" data-source-list><div data-source-table></div><div data-source-attributions></div><div data-source-notices></div></div></details>
        </div><p class="eb-note" data-message role="status" aria-live="polite"></p>`;
      const methods=document.querySelector("[data-browser-methods]");
      if(methods) {$("[data-methods-slot]").append(methods);methods.hidden=false;}
      const referenceNotice=document.querySelector("[data-reference-licence-notice]");
      if(referenceNotice)$("[data-source-notices]").append(referenceNotice);
      function renderUnavailable(){
        const allFamilies=M.unique([...economySnapshots,...tradeSnapshots].map(s=>s.recipe.source)).sort();
        const allowed=P.available(snapshots,state,M),allowedSeries=new Set(allowed.map(s=>M.seriesKey(s.recipe)));
        const lines=[];
        for(const family of allFamilies){
          const readings=snapshots.filter(s=>s.recipe.source===family),good=allowed.filter(s=>s.recipe.source===family);
          if(!good.length){
            const sourceReadings=economySnapshots.filter(s=>s.recipe.source===family);
            const missingIncome=family==='BONSAI'&&['gdp','value_added','value_added_footprint','value_added_trade'].includes(state.metric);
            const missingEnvironment=['ghg','ghg_footprint','ghg_trade'].includes(state.metric)&&!sourceReadings.some(s=>Object.keys(s.recipe.ghg_factors||{}).length);
            const reason=missingIncome?'This source has no value-added accounts.':missingEnvironment?'No environmental extension is loaded for this source.':
              isTrade()&&!isEmbodiedTrade()?(state.tradeScope==='goods_proxy'&&readings.length?'No goods-producing-group proxy has been calculated.':'Bilateral trade has not yet been calculated for this reading.'):
              'This indicator has not yet been calculated for the selected reading.';
            lines.push(`<li><strong>${esc(family==='OECD'?'OECD ICIO':family)}</strong> — ${esc(reason)}</li>`);
          }else{
            const blocked=M.unique(readings.filter(s=>!allowedSeries.has(M.seriesKey(s.recipe))).map(s=>M.version(s.recipe)));
            if(blocked.length)lines.push(`<li><strong>${esc(family)}</strong> — ${esc(blocked.join(', '))}: no collected reading for this indicator${state.metric==='trade'?' and scope':''}.</li>`);
          }
        }
        $('[data-unavailable-list]').innerHTML='<p>Availability follows completed calculations. Missing extensions or value-added accounts are distinguished from calculations still pending. Missing years stay gaps.</p>'+(lines.length?'<ul>'+lines.join('')+'</ul>':'<p>Every collected database has an eligible reading.</p>');
      }
      function accountNotesHtml(selected){
        return A.calculationNotes(selected,state.metric,M).map(g=>`<p><strong>${esc(g.label)}</strong> · ${esc(period(g.years))}. ${esc(g.note)}</p>`).join('');
      }
      function renderMethod(){
        const selected=active(),formats=M.unique((selected.length?selected:candidates()).map(s=>s.recipe.table||s.recipe.parser_options?.table||'IOT'));
        if(formats.length&&!formats.includes(methodFormat))methodFormat=formats[0];
        const recipes=(selected.length?selected:candidates()).filter(s=>(s.recipe.table||s.recipe.parser_options?.table||'IOT')===methodFormat).map(s=>s.recipe);
        const definition=methodDefinition=P.method(state,methodFormat,recipes),first=definition.inputs[0];
        $('[data-calculation-visual]').innerHTML=`<div class="eb-method-header"><p>${esc(P.question(state.metric))}</p>${formats.length>1?`<div class="eb-method-format" role="group" aria-label="Matrix format">${formats.map(f=>`<button type="button" data-method-format="${f}" aria-pressed="${f===methodFormat}">${f}</button>`).join('')}</div>`:`<span>${esc(methodFormat)}</span>`}</div>
          <div class="eb-method-flow"><section><h4>Native accounts</h4><div class="eb-method-inputs">${definition.inputs.map((item,i)=>`<button type="button" data-matrix-detail="${esc(item.symbol)}" aria-pressed="${i===0}"><i class="eb-matrix-schematic" aria-hidden="true"></i><code>${esc(item.symbol)}</code><span>${esc(item.label)}</span></button>`).join('')}</div></section>
          <section><h4>Calculation</h4><ol>${definition.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></section>
          <section class="eb-method-result"><h4>Displayed result</h4><p>${esc(definition.meaning)}</p><small>${esc(definition.unit)}</small></section></div>
          <p class="eb-method-formula">${esc(definition.formula)}</p><p class="eb-method-detail" data-matrix-description aria-live="polite"><strong>${esc(first.symbol)} · ${esc(first.axes)}.</strong> ${esc(first.detail)}</p>`;
        const methodGroups=new Map();
        for(const s of selected.length?selected:candidates()){
          const r=s.recipe,description=r.account_notes?.[state.metric]||s.account?.notes?.[state.metric]||(state.metric==='gdp'?[r.gdp_basis,r.gdp_note,r.gdp_quality_note].filter(Boolean).join(' '):state.metric==='value_added'?[r.value_added_basis,r.value_added_note].filter(Boolean).join(' '):state.metric==='ghg'?[r.ghg_method,r.ghg_note].filter(Boolean).join(' '):'Native signed intermediate and final flows; complete individual-country coverage, domestic pairs excluded.');
          const key=JSON.stringify([M.seriesKey(r),description]);
          if(!methodGroups.has(key))methodGroups.set(key,{recipe:r,description,years:[]});
          methodGroups.get(key).years.push(r.year);
        }
        $('[data-method-recipes]').innerHTML=methodGroups.size?'<div class="eb-scroll"><table class="eb-table eb-coverage-table"><thead><tr><th scope="col">Database / version</th><th scope="col">Selected years</th><th scope="col">Recipe</th></tr></thead><tbody>'+[...methodGroups.values()].map(({recipe:r,description,years})=>`<tr><th scope="row">${esc(r.source+' · '+M.version(r))}</th><td>${esc(period(years))}</td><td>${esc(description||'Reviewed native accounts and source units.')}</td></tr>`).join('')+'</tbody></table></div>':'<p>No database is selected.</p>';

        root.querySelectorAll('[data-method-metrics]').forEach(el=>el.hidden=!el.dataset.methodMetrics.split(' ').includes(state.metric));
        const notice=document.querySelector('[data-reference-licence-notice]');
        if(notice)notice.hidden=state.metric!=='ghg';
      }
      function renderSourcesAndLicences(){
        const selected=active(),templates=new Map();
        for(const s of [...selected,...candidates()])if(!templates.has(M.seriesKey(s.recipe)))templates.set(M.seriesKey(s.recipe),s);
        const sourceRows=[],attributions=[];
        const link=(url,label)=>url?`<a href="${esc(url)}">${esc(label)}</a>`:esc(label);
        const row=(label,url,years,coverage,table,licence)=>`<tr><th scope="row">${link(url,label)}</th><td>${esc(years)}</td><td>${esc(coverage)}</td><td>${table}</td><td>${licence}</td></tr>`;
        for(const [key,template] of templates){
          const loaded=selected.find(s=>M.seriesKey(s.recipe)===key)||template;
          const r=loaded.recipe,reading=loaded.reading,regions=reading?.regions||loaded.regions;
          const countries=regions.filter(x=>x.kind==='country').length,aggregates=regions.filter(x=>x.kind==='aggregate').length,unresolved=regions.length-countries-aggregates;
          const geography=regions.length?`${countries} individually identified countries${aggregates?' · '+aggregates+' aggregate regions':''}${unresolved?' · '+unresolved+' unresolved labels':''}`:'No reading loaded for the selected years';
          const label=(r.source==='OECD'?'OECD ICIO':r.source)+' · '+M.version(r),url=reading?.source_url||r.source_url;
          const years=period(availableReadings().filter(s=>M.seriesKey(s.recipe)===key).map(s=>s.recipe.year));
          const records=licences.guides[P.licenceKey(r)]||[],terms=records.find(t=>!t.releases||t.releases.includes(String(r.release)));
          const licenceLabel=terms?.label||reading?.license||'Source-specific terms not verified',licenceUrl=terms?.url||reading?.license_url||r.license_url;
          const table=esc(r.table||'IOT')+(r.sectors?.length?' · '+r.sectors.length+' native producer categories':'')+(r.parser_guide?' · '+link(new URL(r.parser_guide,base).href,'MARIO parsing guide'):'');
          sourceRows.push(row(label,url,years,geography,table,link(licenceUrl,licenceLabel)));
          const attribution=reading?.attribution||r.attribution;if(attribution&&!attributions.includes(attribution))attributions.push(attribution);
        }
        if((!isTrade()||state.metric==='value_added_trade')&&(state.metric==='gdp'||state.perCapita||!M.isEmissionsMetric(state.metric)&&selected.some(s=>s.recipe.currency==='EUR'))){
          sourceRows.push(row('World Bank WDI','https://data.worldbank.org/indicator/NY.GDP.MKTP.CD','Same-year observations','Country and World series',link('https://data.worldbank.org/indicator/NY.GDP.MKTP.CD','GDP')+' · '+link('https://data.worldbank.org/indicator/SP.POP.TOTL','Population')+' · '+link('https://data.worldbank.org/indicator/PA.NUS.FCRF','Exchange rates'),link(wb.license_url,'CC BY 4.0')));
          attributions.push('World Bank WDI · retrieved '+wb.retrieved_at.slice(0,10)+'.');
          if(selected.some(s=>s.recipe.currency==='EUR'))sourceRows.push(row('Eurostat','https://ec.europa.eu/eurostat/databrowser/view/ert_bil_eur_a/default/table?lang=en','1995–1998','EUR/ECU historical conversion','Annual exchange rates',link('https://ec.europa.eu/eurostat/help/copyright-notice','Eurostat reuse policy')));
        }
        if(!isTrade()&&state.metric==='ghg'){
          const source=M.isWorld(state.country)||state.perCapita?edgar.report:edgar;
          sourceRows.push(row('EDGAR 2026',source.source_url,'Same-year observations','Published country and World totals','Territorial AR5 GWP100 · '+link(source.download_url,'Published reference values'),link('https://creativecommons.org/licenses/by/4.0/','EU-owned material · CC BY 4.0')+'<br>'+link('https://creativecommons.org/licenses/by-nc-nd/4.0/','IEA–EDGAR CO₂ · CC BY-NC-ND 4.0')));
        }
        if(state.metric==='trade'&&state.tradeScope==='goods_proxy'){
          sourceRows.push(row('UN Comtrade','https://uncomtrade.org/docs/un-comtrade-api/',period([...tradeReferenceIndex?.values()||[]].map(r=>r.year)),'China and Italy as reporters; collected partners','Merchandise TOTAL · export and mirror-import declarations',link('https://uncomtrade.org/docs/re-dissemination-of-data/','UN Comtrade reuse conditions')));
        }
        $('[data-source-table]').innerHTML=sourceRows.length?'<div class="eb-scroll"><table class="eb-table eb-coverage-table"><thead><tr><th scope="col">Source / version</th><th scope="col">Published years</th><th scope="col">Coverage</th><th scope="col">Table / series</th><th scope="col">Licence</th></tr></thead><tbody>'+sourceRows.join('')+'</tbody></table></div>':'<p>No database is selected.</p>';
        $('[data-source-attributions]').innerHTML=attributions.length?'<details class="eb-attributions"><summary>Attribution and source notices</summary>'+attributions.map(t=>'<p>'+esc(t)+'</p>').join('')+'</details>':'';
      }
      function controls() {
        const pool=availableReadings();
        families=M.unique(pool.map(s=>s.recipe.source)).sort((a,b)=>a==='EXIOBASE'?-1:b==='EXIOBASE'?1:a.localeCompare(b));
        state.families=state.families.filter(f=>families.includes(f));
        for(const f of [...openFamilies])if(!families.includes(f))openFamilies.delete(f);
        $('[data-indicator-question]').textContent=P.question(state.metric);
        renderUnavailable();
        const versionsFor=f=>M.unique(pool.filter(s=>s.recipe.source===f).map(s=>M.version(s.recipe))).sort((a,b)=>b.split(" · ")[0].localeCompare(a.split(" · ")[0],undefined,{numeric:true})||a.localeCompare(b));
        // Resolve stored facet choices of selected families; unselected ones keep theirs untouched.
        for(const f of families) {
          if(compareFacets[f]&&state.families.includes(f)) {
            const def=M.focusFacets(pool,f,compareFacets[f],"all");
            compareFacets[f]=def.selection;
            versionChoices[f]=def.versions;
          }
          state.versions[f]=versionChoices[f] || (isTrade()||manualView==="table"?"all":M.latestVersions(pool,f));
        }
        // Prepare the facet panel for the one expanded database (accordion).
        const expanded=[...openFamilies][0];
        let panelHTML="";
        if(expanded && families.includes(expanded)) {
          if(!compareFacets[expanded]) {
            // Opening an accordion must describe the active readings,
            // including an explicit all-versions preset, without changing it.
            const chosen=pool.filter(s=>s.recipe.source===expanded&&M.includes(state.versions[expanded]||"all",M.version(s.recipe))).map(s=>M.recipeFacets(s.recipe));
            const all=pool.filter(s=>s.recipe.source===expanded).map(s=>M.recipeFacets(s.recipe));
            compareFacets[expanded]=chosen.length?Object.fromEntries(["units","version","format","system","price"].map(key=>{
              const values=M.unique(chosen.map(f=>f[key]).filter(v=>v!=null)),available=M.unique(all.map(f=>f[key]).filter(v=>v!=null));
              return [key,values.length===available.length?"all":values];
            })):{};
          }
          const def=M.focusFacets(pool,expanded,compareFacets[expanded],"all");
          // An unselected database shows no ticked facet (its count reads 0/x); ticking one selects it again.
          const live=state.families.includes(expanded);
          if(live){
            compareFacets[expanded]=def.selection;
            versionChoices[expanded]=def.versions;
            state.versions[expanded]=def.versions;
          }
          if(def.fields.length) panelHTML=`<div class="eb-compare-panel">${def.fields.map(field=>{
            const sel=def.selection[field.key];
            const bulk=field.options.length>1?`<span class="eb-filter-actions eb-facet-actions" role="group" aria-label="Select ${esc(field.label)}"><button type="button" data-facet-bulk="select" data-facet-family="${esc(expanded)}" data-facet-key="${field.key}">Select all</button><button type="button" data-facet-bulk="clear" data-facet-family="${esc(expanded)}" data-facet-key="${field.key}">Unselect all</button></span>`:"";
            return `<div class="eb-compare-facet"><span>${esc(field.label)}</span>${bulk}${field.options.map(opt=>
              `<label><input type="checkbox" data-compare-facet="${esc(expanded)}" data-facet-key="${field.key}" value="${esc(opt)}" ${live&&M.includes(sel,opt)?"checked":""}>${esc(opt)}</label>`
            ).join("")}</div>`;
          }).join("")}</div>`;
        }
        // Family headings — panel inserted right after the expanded node.
        $("[data-family-tree]").innerHTML=families.map((f,i)=>{
          const versions=versionsFor(f), enabled=state.families.includes(f), chosen=versions.filter(v=>enabled&&M.includes(state.versions[f],v));
          const expandable=versions.length>1;
          let html=`<div class="eb-family-node"><div class="eb-family-head">${expandable?`<button type="button" data-expand-family="${esc(f)}" aria-expanded="${openFamilies.has(f)}" aria-label="Configure versions of ${esc(f)}">${openFamilies.has(f)?"▾":"▸"}</button>`:""}<label><input type="checkbox" data-compare-family value="${esc(f)}" ${enabled?"checked":""} ${versions.length?"":"disabled"}>${esc(f==="OECD"?"OECD ICIO":f)}${expandable?`<small>${chosen.length}/${versions.length}</small>`:""}</label></div></div>`;
          if(f===expanded && panelHTML) html+=panelHTML;
          return html;
        }).join("");
        root.querySelectorAll("[data-compare-family]").forEach(el=>{
          const versions=versionsFor(el.value), chosen=versions.filter(v=>el.checked&&M.includes(state.versions[el.value],v));
          el.indeterminate=chosen.length>0&&chosen.length<versions.length;
          if(versions.length&&!chosen.length)el.checked=false;
        });
        $('[data-database-count]').textContent=M.unique(candidates().map(s=>s.recipe.source)).length+' selected';
        $("[data-version-default]").textContent=isTrade()?"All collected versions by default.":manualView==="table"?"All versions by default.":"Latest versions by default.";
        const years=isTrade()?T.years(candidates(),{year:"all"}):M.years(pool,state);
        // Default: the 20 most recent years before the current calendar year; later years are publisher forecasts.
        if(defaultYears&&years.length){
          defaultYears=false;
          const recent=M.recentYears(years,DEFAULT_YEARS);
          if(state.year==="all"&&recent.length&&recent.length<years.length)state.year=recent;
        }
        if(state.year!=="all"&&years.length) {
          const kept=(Array.isArray(state.year)?state.year:[state.year]).filter(y=>years.includes(Number(y)));
          state.year=kept.length===1?Number(kept[0]):kept.length?kept:Array.isArray(state.year)&&!state.year.length?[]:years.length?years.at(-1):[];
        }
        const countries=isTrade()?{regions:[],hasWorld:false}:M.countryOptions(pool,state);
        const allRegions=countries.regions, hasWorld=countries.hasWorld;
        // Preserve the country preference while an upstream filter is empty.
        // Explicit [] remains empty; missing years/versions can later recover.
        if(allRegions.length||hasWorld)state.country=countries.selection;
        function picker(kind,items,label) {
          const selection=(kind==="country"&&!items.length&&!hasWorld||kind==="year"&&!items.length)?[]:state[kind], choices=Array.isArray(selection)?selection:[selection], special=kind==="country"?"world":"all";
          const tradeKind=["origin","destination"].includes(kind),selectedSpecial=tradeKind?T.isAll(selection):selection===special;
          const specialLabel=tradeKind?(kind==="origin"?"All origins":"All destinations"):kind==="country"?"World":kind==="section"?(items.length?"All sector aggregates":"Whole economy"):"All years";
          $(`[data-picker-label="${kind}"]`).textContent=selectedSpecial?specialLabel:!choices.length?"None":choices.length===1?items.find(x=>String(x[0])===String(choices[0]))?.[1]||"None":kind==="year"&&period(choices).length<=24?period(choices):`${choices.length} selected`;
          let group="";
          const allTitle=kind==="country"&&hasWorld?"World: sum every native region once, including aggregates":`Select all ${label}`;
          const yearActions=kind==="year"?`<button type="button" data-bulk-filter="${kind}" data-bulk-action="last5">Last 5</button><button type="button" data-bulk-filter="${kind}" data-bulk-action="last10">Last 10</button><button type="button" data-bulk-filter="${kind}" data-bulk-action="last20">Last 20</button>`:"";
          const actions=`<div class="eb-filter-actions" role="group" aria-label="Select ${esc(label)}"><button type="button" data-bulk-filter="${kind}" data-bulk-action="select" title="${esc(allTitle)}">Select all</button><button type="button" data-bulk-filter="${kind}" data-bulk-action="clear" title="Unselect all ${esc(label)}">Unselect all</button>${yearActions}</div>`;
          const showSpecial=tradeKind||kind==="country"&&hasWorld;
          $(`[data-options="${kind}"]`).innerHTML=actions+(showSpecial?`<label><input type="checkbox" data-subset="${kind}" value="${special}" ${selectedSpecial?"checked":""}>${specialLabel}</label>`:"")+items.map(([value,name,category])=>{
            const heading=category&&group!==category?`<div class="eb-picker-group">${esc(category)}</div>`:"";group=category;
            return heading+`<label data-choice-search="${esc(`${name} ${value}`.toLowerCase())}"><input type="checkbox" data-subset="${kind}" value="${esc(value)}" ${(!(tradeKind||kind==="country")||!selectedSpecial)&&M.includes(selection,value)&&!(kind==="section"&&selectedSpecial&&!isEmbodiedTrade()&&!A.isAccount(state.metric)&&String(value).includes("+"))?"checked":""}>${esc(name)}</label>`;
          }).join("");
          const canRestore=Array.isArray(selection)&&!selection.length&&items.length>0;
          const disabled=items.length+(kind==="country"&&hasWorld?1:0)<=1&&!canRestore;
          $(`[data-picker="${kind}"]`).classList.toggle("is-disabled",disabled);
          $(`[data-picker="${kind}"] summary`).setAttribute("aria-disabled",disabled);
          // A disabled picker cannot be opened by pointer or keyboard, and closes if it was open.
          if(disabled)$(`[data-picker="${kind}"]`).open=false;
          $(`[data-picker="${kind}"] summary`).tabIndex=disabled?-1:0;
          $(`[data-options="${kind}"]`).querySelectorAll("input,button").forEach(el=>el.disabled=disabled);
        }
        picker("year",[...years].reverse().map(y=>[y,String(y)]),"available years");
        const regionItems=allRegions.filter(r=>r.kind==="country").map(r=>[r.id,r.name,"Countries / territories"]);
        regionItems.push(...allRegions.filter(r=>r.kind!=="country").map(r=>[r.id,`${r.name}${state.families.length===1?"":" · "+r.source+" · "+r.versions.join(" / ")}`,"Aggregate regions"]));
        picker("country",regionItems,"countries / regions");
        root.dataset.indicator=state.metric;
        $('[data-economic-region]').hidden=isTrade();$('[data-economic-measure]').hidden=isTrade();$('[data-trade-controls]').hidden=!isTrade();
        root.querySelectorAll('[data-trade-region]').forEach(el=>el.hidden=!isTrade());
        const account=A.isAccount(state.metric),components=active().find(s=>s.account)?.account.components[state.metric]||[];
        $('[data-account-controls]').hidden=!account||(components.length<2&&!['domestic_use','final_demand'].includes(state.metric));
        $('[data-account-component-field]').hidden=components.length<2;
        $('[data-account-use-field]').hidden=state.metric!=='domestic_use';$('[data-demand-group-field]').hidden=state.metric!=='final_demand';
        $('[data-account-component]').innerHTML=option('total','Total',state.accountComponent)+components.map((label,i)=>option(String(i),label,state.accountComponent)).join('');
        $('[data-account-use]').value=state.accountUse;$('[data-demand-group]').value=state.demandGroup;
        $('[data-account-component]').disabled=components.length<2;

        if(isTrade()) {
          const items=tradeManifest.countries.map(r=>[r.iso3,r.name]);
          picker('origin',items,'origin regions');picker('destination',items,'destination regions');
          const classifications=candidates().filter(s=>Object.keys(s.reading?.sector_files||{}).length||Object.keys(s.reading?.sector_flows||{}).length).map(s=>s.reading?.sector_classification).filter(Boolean),classIDs=M.unique(classifications.map(c=>c.id)),sectorLabels=Object.assign({},...classifications.map(c=>c.sections||{}));
          const sectorItems=isEmbodiedTrade()&&classIDs.length===1?Object.entries(sectorLabels).sort(([a],[b])=>a.localeCompare(b)).map(([code,name])=>[code,code+' · '+name]):[];
          picker('section',sectorItems,'exporting sector sections');
          if(!isEmbodiedTrade())$('[data-picker-label="section"]').textContent=state.tradeScope==='goods_proxy'?'All goods-producing groups':'All sectors';
          $('[data-sector-download]').hidden=true;$('[data-filter-note]').textContent=isEmbodiedTrade()?(classIDs.length===1?classifications[0].label+'. Exporting sectors; upstream content includes all industries. Indivisible native groups stay intact.':'Comparable exporting-sector results have not been collected for these readings.'):'Selected origins → selected destinations, aggregated; domestic pairs excluded.';
          if(isEmbodiedTrade()&&state.section!=='all')$('[data-filter-note]').textContent+=' '+M.unique(candidates().map(s=>T.sectorSelection(s.reading||{},state.section).note).filter(Boolean)).join(' ');
          $('[data-trade-scope]').value=state.tradeScope;$('[data-trade-use]').value=state.tradeUse;$('[data-metric]').value=state.metric;
          $('[data-trade-scope]').disabled=isEmbodiedTrade();
          $('[data-trade-origin-field]').hidden=state.metric!=='value_added_trade';$('[data-trade-origin]').value=state.tradeOrigin;
          root.querySelectorAll('[data-metric] option').forEach(o=>o.disabled=false);
          $('[data-view="map"]').disabled=true;$('[data-view="map"]').title='Trade compares origin–destination groups.';
          if(manualView==='map')manualView=null;
          root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===(manualView||'auto'))));
          filterTradeCountries();return;
        }
        root.querySelectorAll('[data-metric] option').forEach(o=>{o.disabled=false;o.title='';});
        filterCountries();
        const maps=candidates().map(mapping), compatible=maps.length&&maps.every(m=>m?.entries.length&&m.classification_id===maps[0]?.classification_id);
        // Sector aggregates apply to value added and GHG; GHG also offers direct household emissions, which need no sector mapping.
        const sectorsOK=state.metric!=="gdp"&&!A.isAccount(state.metric)&&compatible;
        const householdsOK=state.metric==="ghg"&&candidates().some(s=>s.recipe.final_demand_emissions_loaded!==false&&s.regions.some(r=>r.household_ghg!=null));
        const correspondences=maps.filter(m=>m?.entries.length);
        $("[data-sector-download]").hidden=!correspondences.length;
        $("[data-sector-download]").title=correspondences.length?`Verified sector mappings for ${M.unique(correspondences.map(m=>m.family)).join(", ")}`:"";
        const accountClasses=A.isAccount(state.metric)?candidates().filter(s=>Object.keys(s.account?.sector_files||{}).length).map(s=>s.account?.sector_classification).filter(Boolean):[],accountClassIDs=M.unique(accountClasses.map(c=>c.id)),accountSections=accountClassIDs.length===1?Object.assign({},...accountClasses.map(c=>c.sections||{})):{};
        const sectionLabels={...accountSections,...(sectorsOK?maps[0].sections:{}),...(householdsOK?{[M.HOUSEHOLDS]:M.HOUSEHOLDS_LABEL}:{})};
        if(!Object.keys(sectionLabels).length) state.section="all";
        if(state.section!=="all"){const kept=(Array.isArray(state.section)?state.section:[state.section]).filter(code=>code in sectionLabels);state.section=kept.length===1?kept[0]:kept.length?kept:Array.isArray(state.section)&&!state.section.length?[]:"all";}
        picker("section",Object.entries(sectionLabels).map(([code,name])=>code===M.HOUSEHOLDS?[code,name,"Final demand"]:[code,`${code} · ${name}`,householdsOK?"Producer sectors":undefined]),"sector aggregates");
        const chosenRegions=allRegions.filter(r=>M.includes(state.country,r.id));
        const perCapitaOK=state.section==="all"&&(M.isWorld(state.country)&&hasWorld||chosenRegions.length>0&&chosenRegions.every(r=>r.kind==="country"));
        if(!perCapitaOK) state.perCapita=false;
        $("[data-measure]").value=state.perCapita?"per-capita":"total";
        $("[data-measure] option[value='per-capita']").disabled=!perCapitaOK;
        $("[data-measure]").disabled=!perCapitaOK;
        $("[data-metric]").value=state.metric;
        $("[data-filter-note]").textContent=state.metric==="gdp"?"":!compatible?(householdsOK?"No common sector mapping; households are available.":"No common sector mapping."):`${maps[0].classification} sections.`;
        if(A.isAccount(state.metric)){$('[data-filter-note]').textContent=accountClassIDs.length===1?accountClasses[0].label+(state.metric.endsWith('_footprint')?'. Final-demand supplying sectors; upstream contributions include all industries.':'. Native supplying sectors.')+' Indivisible native groups stay intact.':'Comparable sector results have not been collected for these readings.';$('[data-sector-download]').hidden=true;}
        if(state.section!=='all')$('[data-filter-note]').textContent+=' '+M.unique(candidates().flatMap(s=>A.isAccount(state.metric)?[T.sectorSelection(s.account||{},state.section).note]:(Array.isArray(state.section)?state.section:[state.section]).filter(section=>section!==M.HOUSEHOLDS).map(section=>M.sectorSelection(s,mapping(s),section,state.metric).note)).filter(Boolean)).join(' ');
        const mapOK=active().length===1;
        root.querySelectorAll(".eb-filter-panel select").forEach(el=>{if(el.options.length===1)el.disabled=true;el.closest("label")?.classList.toggle("is-disabled",el.disabled);});
        $("[data-view='map']").disabled=!mapOK;
        $("[data-view='map']").title=mapOK?"Compare countries on a map":"Choose one database version and one year to use the map";
        if(manualView==="map"&&!mapOK) manualView=null;
        root.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.view===(manualView||"auto")));
      }
      function table(rows) {
        return `<div class="eb-scroll"><table class="eb-table"><thead><tr><th scope="col">Source / group</th><th scope="col">Year</th><th scope="col">${esc(displayScale.unit)}</th><th scope="col">Notes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label||r.database+" · "+r.version)}</td><td>${r.year}</td><td>${exact(C.scaled(r.value,displayScale))}</td><td>${esc(r.note||r.basis||"")}</td></tr>`).join("")}</tbody></table></div>`;
      }
      function chartColors() {
        const style=getComputedStyle(root);
        const color=name=>style.getPropertyValue(name).trim();
        return {background:color("--surface-2"),surface:color("--surface"),ink:color("--ink"),muted:color("--ink-muted"),grid:color("--line"),font:style.fontFamily,reference:color("--eb-reference"),
          palette:[color("--eb-accent"),color("--eb-series-orange"),"#886bb2","#459b79","#c46187","#527fbe",color("--eb-series-yellow"),"#6a9090"]};
      }
      let chartOperation=Promise.resolve();
      async function updateHoverDistance() {
        const node=$("[data-chart]"), axis=node._fullLayout?.xaxis;
        if(!axis || !node._marioYears || node._marioYears.length<2 || node.hidden)return;
        const distance=C.hoverDistance(node._marioYears,axis.l2p(2001)-axis.l2p(2000));
        const tick=Math.max(1,Math.ceil(Math.abs(axis.range[1]-axis.range[0])/7));
        const changes={};
        if(node._fullLayout.hoverdistance!==distance)changes.hoverdistance=distance;
        if(axis.tickmode!=="array"&&axis.dtick!==tick)changes["xaxis.dtick"]=tick;
        if(Object.keys(changes).length)await window.Plotly.relayout(node,changes);
      }
      async function drawChart(rows) {
        const node=$("[data-chart]"), years=currentYears();
        const options={state,years,nativeUnit:M.unit(state),colors:chartColors(),catalogue:M.unique(snapshots.map(s=>M.seriesKey(s.recipe))),
          databaseFamilies:families,width:node.clientWidth,
          revision:JSON.stringify([state.families,state.versions,state.year,state.metric,state.section,state.perCapita,state.country,state.origin,state.destination,state.tradeUse,state.tradeScope])};
        const figure=isTrade()?TC.figure(rows,tradeReferences(),options,C):C.figure(rows,options);
        displayScale=figure.scale;
        if(!figure.data.length) {
          const empty=chartOperation.then(()=>{
            if(node.data)window.Plotly.purge(node);
            node._marioHoverBound=false;node._tradeLegendBound=false;node._tradeReferenceIndices=[];
            node.style.height='';node.innerHTML='<p class="eb-empty">No database observations for this selection. See availability below.</p>';
          });
          chartOperation=empty.catch(()=>{});await empty;return;
        }
        // Title inside the figure so the PNG export carries it; the plot area keeps its height.
        const gwp=gwpSummary(rows), modebarClearance=node.clientWidth<480?34:0;
        // Long headings wrap on narrow charts instead of running past the plot.
        const titleLines=wrapText(heading(),Math.max(24,Math.floor((node.clientWidth-40)/9.5)));
        const subtitleLines=isTrade()?wrapText(subheading(),Math.max(22,Math.floor((node.clientWidth-40)/6.2))):[subheading()];
        const titleSpace=(gwp?80:62)+modebarClearance+(titleLines.length-1)*20+(subtitleLines.length-1)*16, colors=chartColors();
        figure.layout.height+=titleSpace;figure.layout.margin={...figure.layout.margin,t:figure.layout.margin.t+titleSpace};
        figure.layout.title={text:`<b>${titleLines.map(esc).join("<br>")}</b>`,font:{size:16,color:colors.ink},subtitle:{text:subtitleLines.map(esc).join("<br>")+(gwp?"<br>"+esc(gwp.main):""),font:{size:12,color:colors.muted}},xref:"container",x:0,xanchor:"left",yref:"container",y:1,yanchor:"top",pad:{l:18,t:18+modebarClearance}};
        if(gwp?.footnote){
          // The footnote is the legend title: it always sits right above the legend items and is part of the PNG export.
          const lines=wrapText(gwp.footnote,Math.max(40,Math.floor((node.clientWidth-40)/6.2)));
          figure.layout.height+=lines.length*15+8;
          figure.layout.legend={...figure.layout.legend,title:{text:lines.map(esc).join("<br>"),side:"top",font:{size:11,color:colors.muted}}};
        }
        const label=`${title()} · ${countryName()}. Interactive chart; values in ${figure.scale.unit}.`;
        const operation=chartOperation.then(async()=>{
          if(!figure.data.length) {
            if(node.data)window.Plotly.purge(node);
            node._marioHoverBound=false;
            node.style.height="";
            node.innerHTML='<p class="eb-empty">No database observations for this selection. See availability below.</p>';
            return;
          }
          if(!window.Plotly)throw new Error("The Plotly runtime could not load; select the table to view the data.");
          if(!node.data)node.innerHTML="";
          node.style.height=figure.layout.height+"px";
          node.setAttribute("aria-label",label);
          node._marioYears=years;
          await window.Plotly.react(node,figure.data,figure.layout,window.MarioFigureDownload.withCredit(figure.config,isTrade()?[heading()+' · '+(state.tradeScope==='goods_proxy'?'Goods-producing groups proxy':'MRIO goods and services'),...M.unique(rows.map(r=>r.reading?.attribution).filter(Boolean)),...(isEmbodiedTrade()?['Gross international flows: repeated border crossings can count upstream '+(state.metric==='ghg_trade'?'emissions':'value added')+' more than once.',...(state.metric==='value_added_trade'?['Domestic and Foreign identify where value added is generated relative to the exporter.']:[])]:[]),...(state.tradeScope==='goods_proxy'?['Source: UN Comtrade. Merchandise context; reported range is not a confidence interval or accuracy score.',...M.unique(tradeReferences().flatMap(r=>r.geography_notes||[]))]:[]),'Sources and terms: https://it-is-me-mario.github.io/database-explorer/resources/data-explorer/compare.html#trade']:[heading()+' · MARIO-derived results; reference accounting boundaries can differ.',...M.unique(active().map(s=>s.recipe.attribution||s.recipe.label)),...(rows.some(r=>r.database==='World Bank')||state.perCapita||state.metric!=='ghg'&&active().some(s=>s.recipe.currency&&s.recipe.currency!=='USD')?['World Bank WDI: CC BY 4.0. Historical EUR/ECU rates: Eurostat, where used.']:[]),...(rows.some(r=>r.database==='EDGAR')?['EDGAR references: European Union / JRC; IEA component terms apply.']:[]), 'Sources and terms: https://www.marioproject.com/en/latest/resources/data-explorer/compare.html']));
          node._tradeReferenceIndices=figure.referenceIndices||[];
          if(!node._tradeLegendBound){node._tradeLegendBound=true;node.on('plotly_restyle',updateTradeReferenceVisibility);}
          await updateHoverDistance();
          updateTradeReferenceVisibility();
          if(!node._marioHoverBound) {
            node._marioHoverBound=true;
            node.on("plotly_afterplot",()=>{chartOperation=chartOperation.then(updateHoverDistance).catch(()=>{});});

          }
        });
        chartOperation=operation.catch(()=>{});
        await operation;
      }
      function geographicRows(s) {
        return s.regions.filter(r=>M.isWorld(state.country)||M.includes(state.country,M.regionKey(s,r))).map(r=>({label:r.name,pick:M.regionKey(s,r),country:M.regionKey(s,r),database:s.recipe.source,version:M.version(s.recipe),year:s.recipe.year,value:val(s,r,{section:Array.isArray(state.section)?state.section[0]:state.section}),country_name:r.name,note:"",basis:M.basis(s.recipe,state.metric),unit:M.unit(state)})).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
      }
      function transform(){ $("[data-map-layer]").setAttribute("transform",`translate(${panX} ${panY}) scale(${zoom})`); }
      function map(s) {
        const rows=geographicRows(s),byISO=new Map(rows.map(r=>[r.country,r])),vs=rows.filter(r=>r.value!=null).map(r=>r.value);
        displayScale=C.scaleFor(rows,state,M.unit(state));
        const min=Math.min(0,...vs),max=Math.max(0,...vs);
        $("[data-map-layer]").innerHTML=world.features.map(f=>{
          const r=byISO.get(f.iso3),native=s.regions.find(r=>r.iso3===f.iso3),v=r?.value??null;
          const fill=v==null?"var(--line)":`color-mix(in srgb,var(--eb-high) ${max===min?0:Math.round((v-min)/(max-min)*100)}%,var(--eb-low))`;
          return `<path d="${esc(f.path)}" fill="${fill}"${native?` data-iso="${esc(f.iso3)}" data-selected="${!M.isWorld(state.country)&&M.includes(state.country,f.iso3)}" role="button" tabindex="0" aria-label="${esc(native.name+': '+compact(C.scaled(v,displayScale))+' '+displayScale.unit)}"`:""}><title>${esc(f.name+": "+compact(C.scaled(v,displayScale))+" "+displayScale.unit)}</title></path>`;
        }).join("")+`<path class="eb-borders" d="${esc(world.borders)}"/>`+world.features.filter(f=>!M.isWorld(state.country)&&M.includes(state.country,f.iso3)).map(f=>`<path class="eb-selected-halo" d="${esc(f.path)}"/><path class="eb-selected-outline" d="${esc(f.path)}"/>`).join("");
        transform();$("[data-legend]").innerHTML=`<span>${compact(C.scaled(min,displayScale))}</span><span class="eb-gradient"></span><span>${compact(C.scaled(max,displayScale))} ${esc(displayScale.unit)}</span><span><i class="eb-none"></i> No observation</span>`;
      }
      function tradeReferences() {
        if(state.metric!=='trade')return [];
        if(state.tradeScope!=='goods_proxy')return [];
        return currentYears().map(year=>T.referenceRange(tradeReferenceIndex,state.origin,state.destination,year));
      }
      async function renderTrade(sequence) {
        state.priceBasis='Current prices';
        const rows=T.observations(comparisonReadings(),{...state,year:currentYears()},M),refs=tradeReferences(),actualView=manualView==='table'?'table':'chart';
        const goodsProxy=state.metric==='trade'&&state.tradeScope==='goods_proxy';
        if(isEmbodiedTrade())for(const row of rows){const source=active().find(s=>s.recipe.year===row.year&&M.seriesKey(s.recipe)===row.series);row.note=[row.note,source?.account.notes[state.metric]].filter(Boolean).join(' ');if(state.metric==='ghg_trade'){row.gwp_basis=source?.account.recipe.gwp_basis||'';row.gwp_horizon=source?.account.recipe.gwp_horizon;}}
        chartRows=rows;displayScale=C.scaleFor(rows,state,M.unit(state));
        root.dataset.view=actualView;root.dataset.country='trade-group';root.dataset.multiple='true';
        $('[data-heading]').textContent=heading();$('[data-subheading]').textContent=subheading();
        $('[data-view-note]').hidden=true;
        $('[data-chart]').hidden=actualView==='table';$('[data-map-panel]').hidden=true;$('[data-table-panel]').hidden=actualView!=='table';
        if(actualView==='table') {
          $('[data-table-panel]').innerHTML=`<div class="eb-scroll"><table class="eb-table"><caption>${esc(displayScale.unit)} · selected origins → destinations</caption><thead><tr>${['Database / version','Year','Intermediate','Final','Total',...(goodsProxy?['Comtrade export','Comtrade mirror import']:[]),'Notes'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>{
            const ref=refs.find(r=>r.year===row.year);
            return `<tr><td>${esc(row.database+' · '+row.version)}</td><td>${row.year}</td>${[row.intermediate,row.final,row.total,...(goodsProxy?[ref?.exports?.value,ref?.imports?.value]:[])].map(v=>`<td>${v==null?'Unavailable':exact(C.scaled(v,displayScale))}</td>`).join('')}<td>${esc(row.note)}</td></tr>`;
          }).join('')}</tbody></table></div>`;
        } else {
          try {await drawChart(rows);}catch(error){if(sequence===renderSequence)$('[data-chart]').innerHTML=`<p class="eb-empty">${esc(error.message)} Select the table to view observations.</p>`;}
          if(sequence!==renderSequence)return;
        }
        const chartVisible=actualView==='chart'&&!!$('[data-chart]').data?.length;
        $('[data-heading]').hidden=$('[data-subheading]').hidden=chartVisible;
        $('[data-chart-help]').hidden=actualView==='table';
        $('[data-chart-help]').textContent=currentYears().length===1?'Bars separate intermediate and final uses. Click a component in the legend to hide it.'+(goodsProxy?' Comtrade totals are hidden while a component is hidden.':''):'Markers identify database versions. Use Total, Intermediate or Final to choose the displayed component. Unobserved years remain gaps.';
        const gwp=gwpSummary(rows);$('[data-gwp-note]').textContent=gwp?.footnote||'';$('[data-gwp-note]').hidden=!gwp?.footnote||actualView!=='table';$('[data-households]').hidden=true;
        $('[data-indicator-note]').hidden=false;
        $('[data-indicator-note]').textContent=state.tradeScope==='goods_proxy'?'MRIO agriculture/mining/manufacturing proxy; not an exact HS goods concordance.':'MRIO: all sectors, goods and services.';
        const anyReference=refs.some(r=>r.lower!=null);
        const referenceCaption=!goodsProxy?'':state.tradeUse!=='total'?'Comtrade totals are not shown for intermediate-only or final-only trade.':
          refs.some(r=>r.reason)?refs.find(r=>r.reason).reason:anyReference?'Comtrade goods: reported export–import range, or one available side. Context only; not a confidence interval.':'No complete Comtrade reporting side has been collected for this country group and year selection.';
        $('[data-reference-caption]').textContent=referenceCaption;
        const areaNotes=M.unique(refs.flatMap(r=>r.geography_notes||[]));
        if(areaNotes.length)$('[data-reference-caption]').textContent+=' '+areaNotes.join('. ')+'. Boundaries can differ from MRIO countries; group references require compatible coverage.';
        $('[data-reference-caption]').dataset.tradeCaption=$('[data-reference-caption]').textContent;
        const unavailable=rows.filter(r=>r.value==null);
        $('[data-availability]').textContent=!(T.isAll(state.origin)||T.isAll(state.destination)||T.pairs(state.origin,state.destination).length)?'Choose origins and destinations with at least one international pair.':
          `${rows.filter(r=>r.value!=null).length} readings available.${unavailable.length?' '+unavailable.length+' unavailable; see the table or Notes on this comparison.':''}`;
        $('[data-indicator-details]').textContent='Intermediate purchases and final demand enter once, retaining signed adjustments. Selected pairs exclude native within-region flows. Explicit countries must be individually represented. All origins/destinations include every native region, including intact Rest of World aggregates; these boundaries differ across databases. No year is substituted. Sector breakdowns and HS-to-industry concordances are deferred.';
        $('[data-context]').textContent='Origins: '+groupNames(state.origin)+'. Destinations: '+groupNames(state.destination)+'.'+(goodsProxy?' Comtrade export and mirror-import totals are aggregated separately over exactly the same pairs before forming the reported range; incomplete reporting sides remain unavailable.':'');
        const areaYears=new Map();refs.forEach(r=>(r.geography_notes||[]).forEach(note=>areaYears.set(note,[...(areaYears.get(note)||[]),r.year])));
        const referenceAreaNotes=[...areaYears].map(([note,years])=>period(years)+' · '+note);
        $('[data-reading-notes]').innerHTML=referenceAreaNotes.map(note=>'<p><strong>Source: UN Comtrade.</strong> '+esc(note)+'. Reporting areas are retained intact; their boundaries may differ from the MRIO country.</p>').join('')+unavailable.map(r=>`<p><strong>${esc(r.database+' · '+r.version+' · '+r.year)}</strong>: ${esc(r.note)}</p>`).join('');
        renderSourcesAndLicences();
        renderMethod();
        if(isEmbodiedTrade()){$('[data-indicator-note]').textContent=state.metric==='ghg_trade'?'Global upstream GHG in gross international flows; repeated border crossings can count emissions more than once.':'Value added in gross international flows: Domestic is generated in the exporting region; Foreign is generated elsewhere. Repeated border crossings can count value added more than once.';$('[data-indicator-details]').textContent='Origins and destinations identify the exporter and immediate importer. Upstream accounts can be generated elsewhere. Native within-region trade is excluded, including for All origins and All destinations. This gross-flow measure is not a decomposition of final absorption.';$('[data-reading-notes]').innerHTML=accountNotesHtml(active())+$('[data-reading-notes]').innerHTML;$('[data-reference-caption]').textContent='';}
        $('[data-export]').disabled=!rows.length;$('[data-export]').textContent='Download comparison · CSV';$('[data-export-label]').textContent='';
        const scriptReady=rows.some(r=>r.value!=null&&r.reading);
        $('[data-script]').disabled=!scriptReady;$('[data-script]').title=scriptReady?'One readable Python API guide per database':'';
        $('[data-script-hint]').hidden=scriptReady;
        $('[data-script-hint]').textContent=scriptReady?'':'Select at least one available reading to download its MARIO code.';
        $('[data-message]').textContent='';root.setAttribute('aria-busy','false');
      }
      function updateTradeReferenceVisibility(event) {
        const node=$('[data-chart]');
        if(state.metric!=='trade'||state.tradeScope!=='goods_proxy'||state.tradeUse!=='total'||currentYears().length!==1||!node.data)return;
        if(Array.isArray(event?.[1])&&event[1].every(i=>node.data[i]?.meta?.tradeReference))return;
        const hidden=node.data.some(trace=>trace.meta?.tradeComponent&&(trace.visible===false||trace.visible==='legendonly'));
        const updates={};
        for(const i of node._tradeReferenceIndices||[])if(node.layout.shapes[i]&&node.layout.shapes[i].visible!==!hidden)updates[`shapes[${i}].visible`]=!hidden;
        const referenceTraces=node.data.map((trace,i)=>trace.meta?.tradeReference&&((trace.visible!==false&&trace.visible!=='legendonly')===hidden)?i:null).filter(i=>i!==null);
        if(Object.keys(updates).length||referenceTraces.length)chartOperation=chartOperation.then(async()=>{
          if(Object.keys(updates).length)await window.Plotly.relayout(node,updates);
          if(referenceTraces.length)await window.Plotly.restyle(node,{visible:!hidden},referenceTraces);
        }).catch(()=>{});
        const caption=$('[data-reference-caption]');
        caption.textContent=hidden?'Comtrade totals are hidden while an intermediate/final component is hidden.':caption.dataset.tradeCaption||'';
      }

      async function render() {
        const sequence = ++renderSequence;
        root.setAttribute("aria-busy", "true");
        controls();
        $("[data-export]").disabled=true;$("[data-script]").disabled=true;
        $("[data-availability]").textContent="Loading selected readings…";
        try { await Promise.all([...active().map(ensureLoaded),...(state.metric==='trade'&&state.tradeScope==='goods_proxy'?[ensureTradeReferences()]:[])]); }
        catch (error) {
          if (sequence===renderSequence) {$("[data-availability]").textContent="The selected data could not load. Change the selection to retry.";root.setAttribute("aria-busy","false");}
          return;
        }
        if (sequence!==renderSequence) return;
        if(isTrade()){await renderTrade(sequence);return;}
        $("[data-export]").textContent="Download MRIO data · CSV";
        const priceBases=M.unique(active().map(s=>s.recipe.price_basis || "Current prices"));
        state.priceBasis=priceBases.length>1?"mixed":priceBases[0];
        const selected=active(), s=selected[0], r=M.findRegion(s,singleCountry()), rows=candidates().length?(A.isAccount(state.metric)?A.observations(comparisonReadings(),state,wb,M,T):M.observations(comparisonReadings(),state,wb,mappings,edgar)):[], actualView=view();
        const barView=C.usesBars(rows,state,M.selectedYears(snapshots,state));
        root.dataset.view=actualView;root.dataset.country=state.country;root.dataset.multiple=String(!singleCountry());
        $("[data-heading]").textContent=heading();
        $("[data-view-note]").hidden=true;
        $("[data-chart-help]").hidden=["map","table"].includes(actualView);
        $("[data-chart-help]").textContent=(M.unique(selected.map(s=>s.recipe.source)).join()==="EXIOBASE"?(barView?"Filled: monetary / Open: hybrid. ":"Marker: IOT system; diamond: SUT · Filled: monetary / Open: hybrid. "):"")+"Drag to zoom · Double-click to rescale · Click / double-click a legend entry to hide or isolate a series.";
        const multiple=!singleCountry()||rows.filter(row=>!["World Bank","EDGAR"].includes(row.database)).length>1;
        let display=rows;
        chartRows=display;
        $("[data-chart]").hidden=["map","table"].includes(actualView);$("[data-map-panel]").hidden=actualView!=="map";$("[data-table-panel]").hidden=actualView!=="table";
        displayScale=C.scaleFor(display,state,M.unit(state));
        if(actualView==="map") {map(s);chartRows=geographicRows(s);} else if(actualView==="table") $("[data-table-panel]").innerHTML=table(display); else {
          try { await drawChart(rows); }
          catch(error) {try{if($("[data-chart]").data)window.Plotly.purge($("[data-chart]"));}catch{}$("[data-chart]").innerHTML=`<p class="eb-empty">${esc(error.message)}</p>`;}
          if(sequence!==renderSequence)return;
        }
        const gwp=gwpSummary(rows);
        $("[data-subheading]").textContent=subheading()+(gwp?" · "+gwp.main:"");
        $("[data-gwp-note]").textContent=gwp?.footnote||"";$("[data-gwp-note]").hidden=!gwp?.footnote||!["map","table"].includes(actualView);
        $("[data-heading]").hidden=$("[data-subheading]").hidden=!["map","table"].includes(actualView)&&!!$("[data-chart]").data?.length;
        $("[data-context]").textContent=multiple?(state.metric==="gdp"?`Values in ${M.unit(state)}. Readings with an unverified product-tax bridge are labelled as estimates; World Bank is an external reference, not an accuracy score.`:"Values keep each database's production-account boundary. Missing extensions are shown as unavailable."):state.metric==="gdp"?s?.recipe.gdp_note:state.metric==="ghg"?s?.recipe.ghg_method:s?.recipe.value_added_note;
        const indicatorNotes=M.unique(selected.map(s=>state.metric==="gdp"&&s.recipe.gdp_proxy?s.recipe.gdp_note:state.metric==="ghg"&&s.recipe.ghg_proxy?s.recipe.ghg_note:state.metric==="ghg"&&s.recipe.source==="USEEIO"?"USEEIO includes import-related commodity emissions; it is not a US territorial inventory. Direct final-demand accounts are unavailable.":null).filter(Boolean));
        if(state.metric==="gdp")for(const family of M.unique(selected.filter(s=>s.recipe.gdp_quality_note).map(s=>s.recipe.source))){
          const checks=selected.filter(s=>s.recipe.source===family&&s.recipe.gdp_quality_note).sort((a,b)=>a.recipe.year-b.recipe.year);
          const concise=checks.every(s=>s.provenance?.gdp_bridge?.validation);
          indicatorNotes.push(concise?`${family} GDP · ${checks.map(s=>`${s.recipe.year}: ${(Math.abs(s.provenance.gdp_bridge.validation.relative_residual)*100).toFixed(3)}% source residual`).join("; ")}. Original income-side values retained; details in Notes on this comparison.`:M.unique(checks.map(s=>s.recipe.gdp_quality_note)).join(" "));
        }
        for(const release of M.unique(selected.filter(s=>s.recipe.ghg_usable===false).map(s=>s.recipe.release))) {
          const years=M.unique(selected.filter(s=>s.recipe.release===release&&s.recipe.ghg_usable===false).map(s=>s.recipe.year)).sort();
          indicatorNotes.push(`EXIOBASE ${release}: GHG totals unavailable for ${years.join(", ")} because of verified errors in the source extensions. Other indicators remain available; details and source reports are in Notes on this comparison.`);
        }
        indicatorNotes.push(...M.unique(selected.flatMap(s=>[s.recipe.price_note,s.recipe.source==="GLORIA"?null:s.recipe.scope_note]).filter(Boolean)));
        if(state.metric==="ghg") {
          const methods=M.unique(selected.map(s=>s.recipe.gwp_basis).filter(Boolean));
          if(methods.length) {
            const methodLabel=r=>r.source==="EXIOBASE"?r.parser_options?.unit==="Hybrid"?"AR5; three gases only":"AR5 + native HFC/PFC (basis unverified)":r.source==="ADB"?"AR5":r.source==="EMERGING"?"CO2 only, GWP 1":r.source==="USEEIO"?"source factors":r.gwp_basis;
            indicatorNotes.push((gwp?.main.endsWith("*")?"* ":"")+"GHG characterisation · "+M.unique(selected.filter(s=>s.recipe.gwp_basis).map(s=>`${s.recipe.source}: ${methodLabel(s.recipe)}`)).join("; ")+" · EDGAR: AR5 GWP100.");
            if(selected.some(s=>s.recipe.source!=="EMERGING"))indicatorNotes.push("Values are not harmonised to one IPCC report.");
          }
          if(state.section!=="all"){
            const chosen=Array.isArray(state.section)?state.section:[state.section], households=chosen.includes(M.HOUSEHOLDS);
            indicatorNotes.push(!households?"Sector totals exclude direct household emissions; select Households to show them.":chosen.length>1?"Producer sectors exclude direct household emissions, shown separately as Households.":"Households: direct final-demand emissions, not allocated to producer sectors.");
          }
          else if(selected.some(s=>s.recipe.final_demand_emissions_loaded!==false))indicatorNotes.push("Totals include direct final-demand emissions where supplied.");
        }
        $("[data-indicator-details]").textContent=indicatorNotes.join(" ");
        const cautions=[];
        if(selected.some(s=>state.metric==="gdp"&&s.recipe.gdp_proxy))cautions.push("EMERGING: GDP uses value added as a proxy.");
        if(state.metric==="gdp"&&selected.some(s=>s.recipe.gdp_quality_note))cautions.push(M.unique(selected.filter(s=>s.recipe.gdp_quality_note).map(s=>s.recipe.source)).join(" / ")+": source accounting residuals retained.");
        if(state.metric==="ghg"&&selected.some(s=>s.recipe.ghg_usable===false))cautions.push("Some EXIOBASE GHG totals withheld: source errors.");
        if(selected.some(s=>s.recipe.price_basis==="Previous year prices"))cautions.push("WIOD PYP: previous-year prices.");
        $("[data-indicator-note]").textContent=cautions.join(" ");
        $("[data-indicator-note]").hidden=!cautions.length;
        $("[data-households]").hidden=multiple||state.metric!=="ghg"||r?.household_ghg==null;
        const population=s&&M.reference(wb,r?.iso3,s.recipe.year).population;
        const household=state.perCapita?(population>0?r?.household_ghg/population:null):r?.household_ghg/1000;
        $("[data-households]").textContent=`Direct final-demand emissions, included once in Whole economy and excluded from sector totals: ${compact(household)} ${M.unit(state)}.`;
        const missing=rows.filter(r=>!["World Bank","EDGAR"].includes(r.database)&&r.value==null);
        $("[data-availability]").textContent=missing.length?"Some observations unavailable; see Notes on this comparison.":"";
        const referenceNames=M.unique(rows.filter(row=>M.isReference(row)&&row.value!=null).map(row=>row.database));
        const referenceSymbol=M.selectedYears(snapshots,state).length===1?"—":barView?"◆":"−";
        $("[data-reference-caption]").textContent=referenceNames.length?`${referenceSymbol} ${referenceNames.join(" / ")}: same region and year.${state.metric==="ghg"?" EDGAR: territorial, AR5 GWP100.":""}`:state.metric==="ghg"&&state.section!=="all"?"EDGAR covers whole-economy totals only.":state.metric==="ghg"||state.metric==="gdp"?"No matching reference.":"";
        // Code downloads require at least one available selected observation.
        const scriptReady=rows.some(row=>!["World Bank","EDGAR"].includes(row.database)&&row.value!=null);
        $("[data-script]").disabled=!scriptReady;
        $("[data-script]").title=scriptReady?"One readable Python API guide per database":"";
        $("[data-script-hint]").textContent=scriptReady?"":"Select at least one available observation to download its MARIO code.";
        $("[data-script-hint]").hidden=scriptReady;
        $("[data-export]").disabled=!chartRows.some(r=>r.value!=null);
        $("[data-export-label]").textContent="";
        // Prefer a selected-year recipe: availability/methods can change
        // within one coverage version (e.g. ADB emissions stop before 2024).
        const noteRecipes=new Map();
        for(const snapshot of [...selected,...candidates()]) {
          const id=M.seriesKey(snapshot.recipe);
          if(!noteRecipes.has(id))noteRecipes.set(id,snapshot.recipe);
        }
        const recipes=[...noteRecipes.values()];
        $("[data-reading-notes]").innerHTML=recipes.map(recipe=>{
          const selectedGroup=selected.filter(s=>M.seriesKey(s.recipe)===M.seriesKey(recipe));
          const group=selectedGroup.length?selectedGroup:candidates().filter(s=>M.seriesKey(s.recipe)===M.seriesKey(recipe));
          const indicators=["Value added",group.some(s=>M.metricAvailable([s],"gdp"))?"GDP":"GDP unavailable",group.some(s=>M.metricAvailable([s],"ghg"))?"GHG":"GHG unavailable"];
          const qualitySources=M.unique(group.flatMap(s=>s.recipe.ghg_quality_sources||[]));
          const gaps=M.unique(missing.filter(r=>r.series===M.seriesKey(recipe)).map(r=>r.note));
          const scopeNotes=recipe.source==="GLORIA"?M.unique(group.map(s=>s.recipe.scope_note).filter(Boolean)).join(" "):"";
          const accountingNotes=state.metric==="gdp"?M.unique(group.map(s=>s.recipe.gdp_note).filter(Boolean)).join(" "):"";
          return `<p><strong>${esc(recipe.label)}</strong> · ${esc(group.map(s=>s.recipe.year).join(", "))}. ${esc(indicators.join("; "))}. ${esc(recipe.ghg_method)} ${esc(recipe.ghg_note||"")} ${esc(scopeNotes)} ${esc(accountingNotes)} ${esc(gaps.join(". "))} ${qualitySources.map((url,i)=>`<a href="${esc(url)}">${i===0?"Release correction":"Source issue report"}</a>`).join(" · ")}</p>`;
        }).join("");
        renderSourcesAndLicences();
        renderMethod();
        if(A.isAccount(state.metric)){
          $('[data-indicator-note]').hidden=false;$('[data-indicator-note]').textContent=state.metric==='ghg_footprint'?'Allocable consumption footprint · zero-output production residuals are reported separately.':state.metric==='domestic_use'?'Domestic-origin intermediate and final use within the same region; signed adjustments are retained.':state.metric==='final_demand'?'Common categories: Households + NPISH, government and gross capital formation; source coverage qualifications and signed adjustments are retained.':state.metric==='value_added_footprint'?'Value added supported by final demand, distinguished by production origin.':'Gross output includes intermediate production at multiple supply-chain stages.';
          if(state.section!=='all')$('[data-indicator-note]').textContent+=' '+(state.metric.endsWith('_footprint')?'Selected final-demand supplying sectors; upstream contributions include all producing industries.':'Selected native supplying sectors.')+(state.metric==='ghg_footprint'?' Direct final-user emissions remain separate from sector slices.':'');
          if(state.metric==='final_demand'&&state.demandGroup==='households_npish'&&selected.some(s=>s.recipe.source==='EMERGING')) $('[data-indicator-note]').textContent+=' EMERGING shows its reported household amount; NPISH coverage is undocumented, so a complete combined SNA amount is not verified.';
          $('[data-indicator-details]').textContent='';$('[data-context]').textContent='Domestic/foreign refers to each native consumer region, including when summing World. Aggregates are not split into individual countries.';
          $('[data-reading-notes]').innerHTML=accountNotesHtml(selected)+(state.section!=='all'?M.unique(rows.filter(r=>r.value!=null).map(r=>r.note).filter(Boolean)).map(note=>'<p>'+esc(note)+'</p>').join(''):'')+missing.map(r=>`<p><strong>${esc(r.database+' · '+r.version+' · '+r.year)}</strong>: ${esc(r.note)}</p>`).join('');
        }
        $("[data-message]").textContent="";
        root.setAttribute("aria-busy", "false");
      }
      const refreshAppearance=()=>{if(root.getAttribute("aria-busy")!=="true"&&!$("[data-chart]").hidden&&$("[data-chart]").data)drawChart(chartRows).catch(()=>{});};
      new MutationObserver(refreshAppearance).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change",refreshAppearance);
      let lastChartWidth=0;
      new ResizeObserver(entries=>{
        const width=Math.round(entries[0].contentRect.width);
        if(width!==lastChartWidth){lastChartWidth=width;refreshAppearance();}
      }).observe($("[data-chart]"));
      function filterCountries() {
        const query=$("[data-country-search]").value.toLowerCase();
        root.querySelectorAll('[data-options="country"] [data-choice-search]').forEach(el=>el.hidden=!el.dataset.choiceSearch.includes(query));
      }
      function filterTradeCountries() {
        for(const kind of ['origin','destination']) {
          const query=$(`[data-trade-search="${kind}"]`).value.toLowerCase();
          root.querySelectorAll(`[data-options="${kind}"] [data-choice-search]`).forEach(el=>el.hidden=!el.dataset.choiceSearch.includes(query));
        }
      }
      root.addEventListener("input",e=>{if(e.target.matches("[data-country-search]"))filterCountries();if(e.target.matches('[data-trade-search]'))filterTradeCountries();});
      root.addEventListener("change", e=>{
        if(e.target.matches('[data-account-use]')){state.accountUse=e.target.value;render();return;}
        if(e.target.matches('[data-account-component]')){state.accountComponent=e.target.value;render();return;}
        if(e.target.matches('[data-demand-group]')){state.demandGroup=e.target.value;render();return;}

        const el=e.target;
        if(el.matches("[data-compare-family]")){
          state.families=el.checked?M.unique([...state.families,el.value]):state.families.filter(f=>f!==el.value);
          // Re-checking a family whose facets select nothing restores every version.
          if(el.checked && (!compareFacets[el.value] || Array.isArray(versionChoices[el.value])&&!versionChoices[el.value].length)){delete compareFacets[el.value];versionChoices[el.value]="all";}
          state.section="all";
        }
        if(el.matches("[data-compare-facet]")){
          const family=el.dataset.compareFacet, key=el.dataset.facetKey;
          const all=[...root.querySelectorAll(`[data-compare-facet="${family}"][data-facet-key="${key}"]`)];
          const checked=all.filter(x=>x.checked).map(x=>x.value);
          if(!compareFacets[family]) compareFacets[family]={};
          compareFacets[family][key]=checked.length===all.length&&checked.length>1?"all":checked.length===1?checked[0]:checked;
          if(!state.families.includes(family)) state.families=M.unique([...state.families,family]);
          state.section="all";
        }
                if(el.matches("[data-subset]")) {
          const kind=el.dataset.subset;
          const special=kind==="country"?"world":"all";
          const current=state[kind];
          let selection;
          if(["origin","destination"].includes(kind)){
            const previous=T.isAll(current)?[]:T.group(current);
            selection=el.value===special?(el.checked?[special]:[]):el.checked?M.unique([...previous,el.value]):previous.filter(v=>v!==el.value);
          }else if(el.value===special)selection=el.checked?special:[];
          else {
            let previous=current===special?(kind==="country"?[]:[...root.querySelectorAll(`[data-subset="${kind}"]`)].filter(x=>x.value!==special&&!(kind==="section"&&!isEmbodiedTrade()&&!A.isAccount(state.metric)&&x.value.includes("+"))).map(x=>x.value)):Array.isArray(current)?current:[current];
            if(kind==='section'&&el.checked&&!isEmbodiedTrade()&&!A.isAccount(state.metric))previous=previous.filter(value=>!String(value).split('+').some(code=>el.value.split('+').includes(code)));
            const chosen=el.checked?M.unique([...previous.map(String),el.value]):previous.map(String).filter(v=>v!==el.value);
            selection=chosen.length===1?(kind==="year"?Number(chosen[0]):chosen[0]):chosen.length?(kind==="year"?chosen.map(Number):chosen):[];
          }
          state[kind]=selection;
        }
        if(el.matches("[data-metric]")) {
          switchMetric(el.value);
          history.replaceState(null,'',isTrade()?'#trade':location.pathname+location.search);
        }
        if(el.matches('[data-trade-use]'))state.tradeUse=el.value;
        if(el.matches('[data-trade-origin]'))state.tradeOrigin=el.value;
        if(el.matches('[data-trade-scope]'))state.tradeScope=el.value;
        if(el.matches("[data-measure]")) state.perCapita=el.value==="per-capita";

        render();
      });
      // Keyboard activation of a summary also arrives as a click: never toggle a disabled picker.
      async function downloadCode(){
        const button=$('[data-script]');button.disabled=true;button.textContent='Preparing MARIO guides…';
        try{
          const result=await window.MarioCodeGuides.create({state:structuredClone(state),snapshots:[...active()],getJSON});
          save(result.blob,'mario-guides-'+state.metric+'.zip','application/zip');
          $('[data-message]').textContent=`Saved ${result.count} Python guides: one file per database. Edit the paths and run the parser and indicator cells.`;
        }catch(error){$('[data-message]').textContent='MARIO guides could not be prepared: '+error.message;}
        finally{button.textContent='Download MARIO code';button.disabled=!chartRows.some(r=>!['World Bank','EDGAR'].includes(r.database)&&Number.isFinite(r.value));}
      }
      root.addEventListener("click",e=>{if(e.target.closest(".eb-picker.is-disabled > summary"))e.preventDefault();},true);
      root.addEventListener("click",e=>{
        const b=e.target.closest("button"),p=e.target.closest("path[data-iso]");
        if(p&&!dragged){state.country=p.dataset.iso;render();return;}
        if(!b)return;
        if(b.dataset.methodFormat){methodFormat=b.dataset.methodFormat;renderMethod();return;}
        if(b.dataset.matrixDetail){
          const item=methodDefinition.inputs.find(x=>x.symbol===b.dataset.matrixDetail);
          if(item){$('[data-matrix-description]').innerHTML=`<strong>${esc(item.symbol)} · ${esc(item.axes)}.</strong> ${esc(item.detail)}`;root.querySelectorAll('[data-matrix-detail]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));}
          return;
        }
        if(b.dataset.bulkFilter){
          if(b.disabled)return;
          e.stopPropagation(); // Keep an open picker open while its options refresh.
          const kind=b.dataset.bulkFilter, action=b.dataset.bulkAction, select=action==="select";
          if(kind==="databases"){
            state.environmentallyExtended=false;
            state.families=select?[...families]:[];
            for(const family of families){versionChoices[family]=select?"all":[];delete compareFacets[family];}
            state.section="all";
          }else if(/^last\d+$/.test(action)){
            const n=Number(action.slice(4));
            const values=[...root.querySelectorAll(`[data-subset="${kind}"]`)].filter(el=>!el.disabled&&!["all","world"].includes(el.value)).map(el=>Number(el.value)).sort((a,b)=>a-b);
            const recent=M.recentYears(values,n).map(String);
            state[kind]=recent;
          }else{
            const world=kind==="country"&&!!$('[data-options="country"] input[value="world"]');
            const values=[...root.querySelectorAll(`[data-subset="${kind}"]`)].filter(el=>!el.disabled&&!["all","world"].includes(el.value)).map(el=>el.value);
            const selection=!select?[]:["origin","destination"].includes(kind)?["all"]:kind==="country"?world?"world":values:"all";
            state[kind]=selection;
          }
          render();
          const next=$(`[data-bulk-filter="${kind}"][data-bulk-action="${b.dataset.bulkAction}"]`);
          if(next&&!next.disabled&&(!next.closest("details")||next.closest("details").open))next.focus({preventScroll:true});
          return;
        }
        if(b.dataset.facetBulk){
          e.stopPropagation();
          const family=b.dataset.facetFamily, key=b.dataset.facetKey, action=b.dataset.facetBulk;
          if(!compareFacets[family]) compareFacets[family]={};
          compareFacets[family][key]=action==="select"?"all":[];
          if(action==="select"&&!state.families.includes(family)) state.families=M.unique([...state.families,family]);
          state.section="all";
          render();
          $(`[data-facet-bulk="${action}"][data-facet-family="${CSS.escape(family)}"][data-facet-key="${key}"]`)?.focus({preventScroll:true});
          return;
        }
        if(b.dataset.expandFamily){const f=b.dataset.expandFamily;if(openFamilies.has(f)){openFamilies.delete(f);}else{openFamilies.clear();openFamilies.add(f);}controls();return;}
        if(b.dataset.view){manualView=b.dataset.view==="auto"?null:b.dataset.view;render();}
        if(b.dataset.zoom){if(b.dataset.zoom==="reset"){zoom=1;panX=panY=0;}else{const next=Math.max(1,Math.min(8,zoom*(b.dataset.zoom==="in"?1.5:1/1.5))),ratio=next/zoom;panX=450-(450-panX)*ratio;panY=182.5-(182.5-panY)*ratio;zoom=next;}transform();}
        if(b.hasAttribute("data-export")){
          const rows=isEmbodiedTrade()?A.exportTradeRows(chartRows,state,T):A.isAccount(state.metric)?A.exportRows(chartRows,comparisonReadings(),state,displayScale,C,M):isTrade()?T.exportRows(chartRows,tradeReferences(),state):M.exportRows(chartRows,comparisonReadings(),state,displayScale,C);
          const label=selection=>T.group(selection).length<=2?T.group(selection).join('+'):T.group(selection).length+'-regions';
          const filename=isTrade()?`mario-${state.metric}-${label(state.origin)}-to-${label(state.destination)}-${state.year}-${state.tradeScope}-${state.tradeUse}${state.metric==='value_added_trade'?'-'+state.tradeOrigin:''}${isEmbodiedTrade()&&state.section!=='all'?'-sectors-'+T.group(state.section).join('+'):''}.csv`:
            `mario-compare-${state.country}-${Array.isArray(state.year)?state.year.length?`${Math.min(...state.year.map(Number))}-${Math.max(...state.year.map(Number))}`:"none":state.year}-${state.metric}.csv`;
          save(csv(rows),filename,"text/csv;charset=utf-8");
        }
        if(b.hasAttribute("data-script"))downloadCode();
      });
      root.addEventListener("keydown",e=>{if(e.target.matches("path[data-iso]")&&["Enter"," "].includes(e.key)){e.preventDefault();state.country=e.target.dataset.iso;render();}});
      document.addEventListener("click",e=>root.querySelectorAll(".eb-picker[open]").forEach(el=>{if(!el.contains(e.target))el.open=false;}));
      document.addEventListener("keydown",e=>{if(e.key==="Escape"){root.querySelectorAll(".eb-picker[open]").forEach(el=>{el.open=false;el.querySelector("summary").focus();});if($("[data-chart]").data)window.Plotly.Fx.unhover($("[data-chart]"));}});
      const svg=$("[data-map]");
      svg.addEventListener("pointerdown",e=>{if(e.button!==0)return;dragged=false;drag={x:e.clientX,y:e.clientY,px:panX,py:panY};});
      svg.addEventListener("pointermove",e=>{if(!drag||zoom===1)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)dragged=true;const scale=900/svg.getBoundingClientRect().width;panX=drag.px+dx*scale;panY=drag.py+dy*scale;transform();});
      window.addEventListener("pointerup",()=>{drag=null;});svg.addEventListener("pointercancel",()=>{drag=null;});
      if(location.hash==='#trade'||new URLSearchParams(location.search).get('indicator')==='trade')switchMetric('trade');
      window.addEventListener('hashchange',()=>{if(location.hash==='#trade'&&!isTrade()){switchMetric('trade');render();}});
      await render();
    }).catch(error=>{root.innerHTML=`<p class="eb-error">The browser could not load its data. ${esc(error.message)}</p>`;root.setAttribute("aria-busy","false");});
})();
