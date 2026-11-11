const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const external=process.env.EXPLORER_PREVIEW_URL,base=external||'http://127.0.0.1:8877/';
const out=path.join(process.env.EXPLORER_QA_DIR||path.join(os.tmpdir(),'explorer-accounts-qa'),'accounts');fs.mkdirSync(out,{recursive:true});
(async()=>{let server,browser;try{
 if(!external){server=spawn(process.env.PYTHON||'python3',['-m','http.server','8877','--bind','127.0.0.1','--directory',process.env.EXPLORER_SITE||path.resolve(__dirname,'../../_site')],{stdio:'ignore'});let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);}
 browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 await page.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});
 const root=page.locator('[data-economy-browser]'),chart=root.locator('[data-chart]'),ready=()=>page.waitForFunction(()=>document.querySelector('[data-economy-browser]')?.getAttribute('aria-busy')==='false');await ready();
 const metric=async value=>{await root.locator('[data-metric]').selectOption(value);await ready();};
 const pick=async(kind,value)=>{const p=root.locator(`[data-picker="${kind}"]`);if(await p.locator('summary').getAttribute('aria-disabled')==='true'){assert.equal(await root.locator(`[data-subset="${kind}"][value="${value}"]`).isChecked(),true);return;}await p.locator('summary').click();await root.locator(`[data-bulk-filter="${kind}"][data-bulk-action="clear"]`).click();await ready();await root.locator(`[data-subset="${kind}"][value="${value}"]`).check();await ready();await p.locator('summary').click();};
 const set=async(selector,value)=>{await root.locator(selector).selectOption(value);await ready();};
 const csv=async()=>{const event=page.waitForEvent('download');await root.locator('[data-export]').click();return fs.readFileSync(await (await event).path(),'utf8');};
 const sections=['Coverage and aggregation','Accounting and scope','Database-specific recipes','Reference series','Downloads and reproduction'];
 await metric('gross_output');assert.deepEqual(await root.locator('[data-compare-family]').evaluateAll(ns=>ns.map(n=>n.value)),['EXIOBASE','ADB','EMERGING','FIGARO','GLORIA','OECD','WIOD']);
 assert.deepEqual(await root.locator('[data-subset="year"]').evaluateAll(ns=>ns.map(n=>Number(n.value)).sort((a,b)=>a-b)),Array.from({length:31},(_,i)=>1995+i));
 await pick('year',2022);await pick('country','ITA');
 assert.match(await chart.evaluate(n=>n.layout.yaxis.title?.text||n.layout.xaxis.title?.text),/US\$/);assert.ok(['true','false'].includes(await root.locator('[data-picker="section"] summary').getAttribute('aria-disabled')));
 await metric('domestic_use');assert.deepEqual(await root.locator('[data-browser-methods] > details > summary').allTextContents(),sections);
 assert.ok(await chart.evaluate(n=>n.data.every(t=>t.type!=='bar'||!t.offsetgroup)));
 assert.match(await csv(),/Domestic/);assert.doesNotMatch(await csv(),/Imported output/);
 await set('[data-account-use]','final');assert.match(await csv(),/"final"/);await set('[data-account-use]','intermediate');assert.match(await csv(),/"intermediate"/);
 await page.screenshot({path:path.join(out,'domestic-use-desktop.png'),fullPage:true});
 await metric('final_demand');await set('[data-demand-group]','households_npish');assert.match(await csv(),/"households_npish"/);
 await pick('year',2023);assert.match(await root.locator('[data-indicator-note]').textContent(),/NPISH coverage is undocumented/);assert.match(await csv(),/No missing NPISH amount is treated as zero/);await pick('year',2022);
 await set('[data-demand-group]','government');assert.match(await csv(),/"government"/);await set('[data-demand-group]','capital_formation');assert.match(await csv(),/"capital_formation"/);assert.match(await csv(),/Domestic/);assert.match(await csv(),/Imported/);
 await metric('value_added_footprint');await set('[data-account-component]','1');assert.match(await csv(),/Foreign value added/);
 await metric('ghg_footprint');await pick('year',2022);assert.ok((await root.locator('[data-compare-family]').evaluateAll(ns=>ns.map(n=>n.value))).includes('ADB'));
 assert.match(await root.locator('[data-reading-notes]').textContent(),/Unallocated.*production emissions/);
 assert.doesNotMatch(await root.locator('[data-gwp-note]').textContent(),/FIGARO/); // No 2022 FIGARO footprint: its convention must not qualify displayed values.
 await set('[data-measure]','per-capita');assert.match(await csv(),/CO₂eq\/person/);await set('[data-measure]','total');
 const event=page.waitForEvent('download');await root.locator('[data-script]').click();const code=await event;assert.match(code.suggestedFilename(),/mario-guides-ghg_footprint\.zip$/);const file=await code.path();fs.copyFileSync(file,path.join(out,'code-ghg-footprint.zip'));
 const summary=JSON.parse(execFileSync('python3',['-c','import ast,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; names=z.namelist(); assert all(n.endswith(".py") and "/" not in n for n in names); [ast.parse(z.read(n).decode()) for n in names]; print(json.dumps({"scripts":len(names)}))',file],{encoding:'utf8'}));assert.ok(summary.scripts>=2);

 await page.screenshot({path:path.join(out,'ghg-footprint-desktop.png'),fullPage:true});
 await pick('year',1995);await set('[data-measure]','per-capita');const historicalEvent=page.waitForEvent('download');await root.locator('[data-script]').click();const historical=await historicalEvent;fs.copyFileSync(await historical.path(),path.join(out,'code-ghg-footprint-1995.zip'));await set('[data-measure]','total');
 await root.locator('[data-picker="year"] > summary').click();await root.locator('[data-bulk-filter="year"][data-bulk-action="select"]').click();await ready();await root.locator('[data-picker="year"] > summary').click();
 assert.ok(await chart.evaluate(n=>n.data.every(t=>t.type==='scatter')));assert.match(await root.locator('[data-reading-notes]').textContent(),/1995/);assert.match(await root.locator('[data-reading-notes]').textContent(),/2024/);
 await metric('ghg_trade');await pick('year',2022);assert.equal(await root.locator('[data-trade-scope]').isDisabled(),true);
 assert.equal(await chart.evaluate(n=>n.data.some(t=>t.meta?.tradeReference)),false);const carbon=await csv();assert.match(carbon,/intermediate_t_co2eq/);assert.doesNotMatch(carbon,/comtrade_export/);
 assert.match(await chart.evaluate(n=>n.layout.yaxis.title?.text||n.layout.xaxis.title?.text),/CO₂eq/);
 const carbonEvent=page.waitForEvent('download');await root.locator('[data-script]').click();const carbonCode=await carbonEvent;fs.copyFileSync(await carbonCode.path(),path.join(out,'code-ghg-trade-2022.zip'));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);await page.screenshot({path:path.join(out,'carbon-trade-mobile.png'),fullPage:true});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:path.join(out,'carbon-trade-dark.png'),fullPage:true});
 const getJSON=name=>page.evaluate(async({base,name})=>window.MarioJSONAssets.create(new URL('_static/',base)).getJSON(name),{base,name});
 const embodied=await getJSON('data/embodied-trade/manifest.json');
 const vaEntries=embodied.readings.filter(r=>(r.metrics||[]).includes('value_added_trade'));assert.ok(vaEntries.length,'No collected value-added trade reading');
 const vaRecords=await Promise.all(vaEntries.map(async entry=>({...await getJSON('data/embodied-trade/'+entry.file),...entry})));
 const vaYear=Math.max(...vaRecords.map(r=>r.recipe.year));
 await page.setViewportSize({width:1440,height:1050});await metric('value_added_trade');
 await root.locator('[data-database-options] > summary').click();await root.locator('[data-bulk-filter="databases"][data-bulk-action="select"]').click();await ready();await root.locator('[data-database-options] > summary').click();
 await pick('year',vaYear);await pick('origin','all');await pick('destination','all');
 assert.equal(await root.locator('[data-trade-origin]').inputValue(),'total');assert.equal(await root.locator('[data-trade-scope]').isDisabled(),true);
 const parsed=text=>JSON.parse(execFileSync('python3',['-c','import csv,io,json,sys; print(json.dumps(list(csv.DictReader(io.StringIO(sys.stdin.read().lstrip("\\ufeff"))))))'],{input:text,encoding:'utf8'}));
 const totalCSV=await csv(),totals=parsed(totalCSV);assert.doesNotMatch(totalCSV,/comtrade_/);assert.match(totalCSV,/value_added_origin/);assert.ok(totals.some(r=>r.total_usd!==''));
 await set('[data-trade-origin]','domestic');const domestic=parsed(await csv());await set('[data-trade-origin]','foreign');const foreign=parsed(await csv());
 const rowKey=r=>[r.database,r.version,r.year].join('|'),byKey=rows=>new Map(rows.map(r=>[rowKey(r),r]));const domesticByKey=byKey(domestic),foreignByKey=byKey(foreign);
 for(const row of totals.filter(r=>r.total_usd!=='')){const d=domesticByKey.get(rowKey(row)),f=foreignByKey.get(rowKey(row));assert.ok(d&&f);assert.ok(Math.abs(Number(row.total_usd)-Number(d.total_usd)-Number(f.total_usd))<=Math.max(1,Math.abs(Number(row.total_usd)))*1e-8);}
 assert.match(await chart.evaluate(n=>n.layout.yaxis.title?.text||n.layout.xaxis.title?.text),/US\$/);assert.equal(await chart.evaluate(n=>n.data.some(t=>t.meta?.tradeReference)),false);
 await set('[data-trade-origin]','total');
 const sectorOptions=await root.locator('[data-subset="section"]').evaluateAll(ns=>ns.map(n=>n.value));
 const latestSectorRecords=vaRecords.filter(r=>r.recipe.year===vaYear&&Object.keys(r.sector_files||{}).length),publishedSectorMode=latestSectorRecords.length?'sectors_available':'totals_only';
 if(publishedSectorMode==='totals_only'){
  assert.equal(sectorOptions.length,0,'Totals-only readings must not offer invented sector choices');assert.equal(await root.locator('[data-picker="section"] > summary').getAttribute('aria-disabled'),'true');
  assert.match(await root.locator('[data-filter-note]').textContent(),/Comparable exporting-sector results have not been collected/);
  assert.ok(vaRecords.filter(r=>r.recipe.year===vaYear).every(r=>r.sector_scope?.reason),'Totals-only publication requires an explicit missing-sector reason');
 }else{assert.ok(sectorOptions.length>0,'Published sectors are missing from the selector');}
 const vaEvent=page.waitForEvent('download');await root.locator('[data-script]').click();const vaCode=await vaEvent,vaFile=await vaCode.path();fs.copyFileSync(vaFile,path.join(out,'code-value-added-trade-total.zip'));
 const guides=JSON.parse(execFileSync('python3',['-c','import ast,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist(); assert names and len(names)==len(set(names)) and all(n.endswith(".py") and "/" not in n for n in names); [ast.parse(z.read(n).decode()) for n in names]; assert all("db.calc_trades_content(" in z.read(n).decode() for n in names); print(json.dumps(names))',vaFile],{encoding:'utf8'}));assert.ok(guides.length);

 await page.screenshot({path:path.join(out,'value-added-trade-total-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);await page.screenshot({path:path.join(out,'value-added-trade-total-mobile.png'),fullPage:true});
 await metric('domestic_use');assert.equal(await root.locator('[data-account-use]').inputValue(),'intermediate');await metric('gdp');assert.equal(await root.locator('[data-metric]').inputValue(),'gdp');
 const privateSectorQA=process.env.EXPLORER_EMBODIED_SECTOR_QA?await require('./check_embodied_sector_browser.cjs').run({browser,base,out,folders:process.env.EXPLORER_EMBODIED_SECTOR_QA.split(path.delimiter)}):{status:'not_requested',reason:'No private replay folder supplied; this run verifies public availability only.'};
 assert.deepEqual(errors,[]);console.log(JSON.stringify({new_indicators:7,value_added_trade_origin_reconciled:true,published_sector_mode:publishedSectorMode,whole_economy_download:true,private_sector_qa:privateSectorQA,uniform_methods:true,origin_components:true,final_demand_categories:true,per_capita:true,code_bundle:summary.scripts,carbon_has_no_comtrade:true,errors}));
 }finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
