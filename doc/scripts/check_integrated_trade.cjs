// Browser regression for the shared Indicator control, native trade and references.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const repo=path.resolve(__dirname,'../..');
const out=process.env.EXPLORER_QA_DIR||path.join(os.tmpdir(),'explorer-integrated-trade-qa');
fs.mkdirSync(out,{recursive:true});
const base=process.env.EXPLORER_PREVIEW_URL||'http://127.0.0.1:8875/';
function csvRows(text){
 const rows=[],s=text.replace(/^\uFEFF/,'');let row=[],cell='',quoted=false;
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===','){row.push(cell);cell='';}
  else if(!quoted&&c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 const head=rows.shift();return rows.map(row=>Object.fromEntries(head.map((key,i)=>[key,row[i]])));
}
(async()=>{
 let server,browser;
 try{
  if(!process.env.EXPLORER_PREVIEW_URL){
   server=spawn(process.env.PYTHON||'python3',['-m','http.server','8875','--bind','127.0.0.1','--directory',process.env.EXPLORER_SITE||path.join(repo,'_site')],{stdio:'ignore'});
   let available=false;
   for(let i=0;i<80;i++){try{const r=await fetch(base);if(r.ok){available=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
   assert.ok(available,'Preview server did not become ready');
  }
  browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
  page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  const root=page.locator('[data-economy-browser]'),chart=root.locator('[data-chart]');
  const ready=()=>page.waitForFunction(()=>document.querySelector('[data-economy-browser]')?.getAttribute('aria-busy')==='false');
  const centeredBars=async()=>{
   const offsets=await chart.evaluate(node=>{
    const axis=node._fullLayout.xaxis,left=node.getBoundingClientRect().left+axis._offset;
    const traces=node._fullData.filter(t=>t.type==='bar'&&t.visible!==false&&t.visible!=='legendonly');
    return [...node.querySelectorAll('.barlayer .trace.bars')].flatMap((group,i)=>
     [...group.querySelectorAll('.point path')].map((path,j)=>{
      const box=path.getBoundingClientRect();
      return {category:traces[i].x[j],pixels:box.left+box.width/2-left-axis.d2p(traces[i].x[j])};
     }));
   });
   assert.ok(offsets.length,'Expected rendered bars for the selected annual flow');
   assert.ok(offsets.every(o=>Math.abs(o.pixels)<.75),'Bars must be centered on their category ticks: '+JSON.stringify(offsets));
  };
  const year=async value=>{
   const picker=root.locator('[data-picker="year"]');if(!await picker.evaluate(n=>n.open))await picker.locator('summary').click();
   await root.locator('[data-bulk-filter="year"][data-bulk-action="clear"]').click();await ready();
   await root.locator(`[data-subset="year"][value="${value}"]`).check();await ready();await picker.locator('summary').click();
  };
  const regions=async(kind,codes)=>{
   const picker=root.locator(`[data-picker="${kind}"]`);if(!await picker.evaluate(n=>n.open))await picker.locator('summary').click();
   await root.locator(`[data-trade-search="${kind}"]`).fill('');
   await root.locator(`[data-bulk-filter="${kind}"][data-bulk-action="clear"]`).click();await ready();
   for(const code of codes){await root.locator(`[data-subset="${kind}"][value="${code}"]`).check();await ready();}
   await picker.locator('summary').click();
  };
  const download=async()=>{const pending=page.waitForEvent('download');await root.locator('[data-export]').click();const d=await pending;return fs.readFileSync(await d.path(),'utf8');};
  await page.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});await ready();
  console.log('Loaded economic comparison.');
  assert.equal(await root.locator('select[data-metric]').inputValue(),'gdp');
  const economic={families:await root.locator('[data-compare-family]:checked').evaluateAll(ns=>ns.map(n=>n.value)),year:await root.locator('[data-picker-label="year"]').innerText()};
  await root.locator('select[data-metric]').selectOption('trade');await ready();await year(2022);
  assert.equal(await root.locator('select[data-metric]').count(),1);
  assert.equal(await root.locator('[data-economic-region]').isHidden(),true);assert.equal(await root.locator('[data-economic-measure]').isHidden(),true);
  assert.equal(await root.locator('[data-view="map"]').isDisabled(),true);
  assert.equal(await root.locator('[data-trade-scope]').inputValue(),'all');
  assert.equal(await root.locator('[data-trade-use] option[value="total"]').innerText(),'Total');
  for(const use of ['total','intermediate','final','total']){
   await root.locator('[data-trade-use]').selectOption(use);await ready();await centeredBars();
  }
  assert.ok(await chart.evaluate(n=>n.data.length>0&&n.data.filter(t=>!t.meta?.tradeReference).every(t=>t.type==='bar')));
  assert.match(await root.locator('[data-indicator-note]').innerText(),/goods and services/);
  assert.equal(await chart.evaluate(n=>n.layout.shapes.some(s=>s.name?.startsWith('Comtrade'))||n.data.some(t=>t.meta?.tradeReference)),false);
  assert.equal(await root.locator('[data-reference-caption]').textContent(),'');
  assert.doesNotMatch(await root.locator('[data-source-list]').textContent(),/Comtrade/);
  await root.locator('[data-view="table"]').click();await ready();
  assert.doesNotMatch(await root.locator('[data-table-panel]').innerText(),/Comtrade/);
  assert.doesNotMatch(await download(),/comtrade_|comparison_note/);
  await root.locator('[data-view="auto"]').click();await ready();
  await root.locator('[data-trade-scope]').selectOption('goods_proxy');await ready();
  assert.ok(await chart.evaluate(n=>n.layout.shapes.some(s=>s.name?.startsWith('Comtrade'))));
  assert.equal(await chart.evaluate(n=>n.data.filter(t=>t.meta?.tradeReference).length),2);
  await chart.locator('.legendtext').filter({hasText:/^Final$/}).locator('..').locator('.legendtoggle').click();
  await page.waitForFunction(()=>document.querySelector('[data-chart]')?.layout.shapes.filter(s=>s.name?.startsWith('Comtrade')).every(s=>s.visible===false));
  assert.match(await root.locator('[data-reference-caption]').innerText(),/hidden/);
  await chart.locator('.legendtext').filter({hasText:/^Final$/}).locator('..').locator('.legendtoggle').click();
  await page.waitForFunction(()=>document.querySelector('[data-chart]')?.layout.shapes.some(s=>s.name?.startsWith('Comtrade')&&s.visible===true));
  console.log('Annual bars, reference range and legend verified.');
  const refLegend=chart.locator('.legendtext').filter({hasText:/^Comtrade goods/}).locator('..').locator('.legendtoggle');
  await refLegend.click();
  await page.waitForFunction(()=>{const n=document.querySelector('[data-chart]');return n?.layout.shapes.filter(s=>s.name?.startsWith('Comtrade')).every(s=>s.visible===false||s.visible==='legendonly')&&n.data.filter(t=>t.meta?.tradeReference).every(t=>t.visible===false||t.visible==='legendonly');});
  await refLegend.click();
  await page.waitForFunction(()=>{const n=document.querySelector('[data-chart]');return n?.layout.shapes.some(s=>s.name?.startsWith('Comtrade')&&s.visible===true)&&n.data.filter(t=>t.meta?.tradeReference).every(t=>t.visible!==false&&t.visible!=='legendonly');});
  // Shared appearance redraws must also keep the reference caption consistent.
  await chart.locator('.legendtext').filter({hasText:/^Final$/}).locator('..').locator('.legendtoggle').click();
  await page.waitForFunction(()=>document.querySelector('[data-reference-caption]').textContent.includes('hidden'));
  await page.setViewportSize({width:1400,height:1050});
  await page.waitForFunction(()=>{const n=document.querySelector('[data-chart]');return Math.abs(n._fullLayout.width-n.clientWidth)<2&&document.querySelector('[data-reference-caption]').textContent.includes('hidden')===n.data.some(t=>t.meta?.tradeComponent&&(t.visible===false||t.visible==='legendonly'));});
  await page.setViewportSize({width:1440,height:1050});
  await page.waitForFunction(()=>{const n=document.querySelector('[data-chart]');return Math.abs(n._fullLayout.width-n.clientWidth)<2;});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'trade-annual.png'),fullPage:true});
  await root.locator('[data-trade-scope]').selectOption('goods_proxy');await ready();
  assert.match(await root.locator('[data-indicator-note]').innerText(),/proxy/);
  assert.equal(await root.locator('[data-compare-family][value="EMERGING"]').count(),0);
  assert.match(await root.locator('[data-unavailable-list]').textContent(),/REX3/);
  await root.locator('[data-view="table"]').click();await ready();
  assert.equal(await root.locator('[data-table-panel] tr').filter({hasText:'REX3'}).count(),0);
  let text=await download();assert.match(text,/"goods_proxy"/);assert.doesNotMatch(text,/ratio_to_reference|NaN|Infinity/);
  assert.equal(csvRows(text).some(r=>r.database==='EXIOBASE'&&r.version.includes('REX3')),false);
  await root.locator('[data-view="auto"]').click();await ready();
  const yp=root.locator('[data-picker="year"]');await yp.locator('summary').click();await root.locator('[data-bulk-filter="year"][data-bulk-action="select"]').click();await ready();await yp.locator('summary').click();
  assert.ok(await chart.evaluate(n=>n.data.every(t=>t.type==='scatter'&&t.mode==='markers')));
  assert.equal(await chart.evaluate(n=>n.layout.shapes.filter(s=>s.name?.startsWith('Comtrade')).length),2);
  assert.deepEqual(await chart.locator('.xtick text').allTextContents(),['2015','2022']);
  await root.locator('[data-trade-use]').selectOption('intermediate');await ready();
  assert.equal(await chart.evaluate(n=>n.layout.shapes.filter(s=>s.name?.startsWith('Comtrade')).length),0);
  await root.locator('[data-trade-use]').selectOption('final');await ready();
  assert.match(await root.locator('[data-reference-caption]').innerText(),/not shown/);
  await root.locator('[data-trade-use]').selectOption('total');await ready();
  console.log('Both scopes, table, CSV and temporal components verified.');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'trade-timeseries.png'),fullPage:true});
  await root.locator('[data-trade-scope]').selectOption('all');await ready();
  assert.equal(await chart.evaluate(n=>n.layout.shapes.some(s=>s.name?.startsWith('Comtrade'))||n.data.some(t=>t.meta?.tradeReference)),false);
  await year(2022);
  await regions('origin',['CHN','JPN']);await regions('destination',['CHN','ITA']);
  text=await download();const rows=csvRows(text),selected=rows.find(r=>r.database==='EXIOBASE'&&r.version==='3.11.2 · ixi'&&r.year==='2022');assert.ok(selected);
  const reading=JSON.parse(fs.readFileSync(path.join(repo,'doc/source/_static/data/trade/trade-exiobase-3112-2022-ixi.json')));
  const ix=code=>reading.regions.findIndex(r=>r.iso3===code&&r.kind==='country');
  const value=[['CHN','ITA'],['JPN','CHN'],['JPN','ITA']].reduce((sum,[a,b])=>sum+reading.flows.all.intermediate[ix(a)][ix(b)]+reading.flows.all.final[ix(a)][ix(b)],0);
  assert.ok(Math.abs(Number(selected.total_usd)-value)<Math.abs(value)*1e-12);
  assert.equal(selected.domestic_excluded,'true');assert.equal('comtrade_export_usd' in selected,false);
  await root.locator('[data-trade-scope]').selectOption('goods_proxy');await ready();
  const proxySelected=csvRows(await download()).find(r=>r.database==='EXIOBASE'&&r.version==='3.11.2 · ixi'&&r.year==='2022');
  assert.equal(proxySelected.comtrade_export_usd,'');assert.notEqual(proxySelected.comtrade_mirror_import_usd,'');
  await regions('destination',['ITA','FRA']);
  assert.match(await root.locator('[data-reference-caption]').innerText(),/No complete Comtrade/);
  await regions('origin',[]);assert.match(await chart.innerText(),/No database observations/);
  await regions('origin',['CHN']);await regions('destination',['ITA']);
  assert.ok(await chart.evaluate(n=>n.data.length>0));
  await chart.locator('.legendtext').filter({hasText:/^Final$/}).locator('..').locator('.legendtoggle').click();
  await page.waitForFunction(()=>document.querySelector('[data-chart]')?.layout.shapes.filter(s=>s.name?.startsWith('Comtrade')).every(s=>s.visible===false));
  await chart.locator('.legendtext').filter({hasText:/^Final$/}).locator('..').locator('.legendtoggle').click();
  console.log('Group sums, reference coverage and empty-state recovery verified.');
  await root.locator('select[data-metric]').selectOption('gdp');await ready();
  assert.deepEqual(await root.locator('[data-compare-family]:checked').evaluateAll(ns=>ns.map(n=>n.value)),economic.families);
  assert.equal(await root.locator('[data-picker-label="year"]').innerText(),economic.year);
  assert.equal(await root.locator('[data-economic-region]').isVisible(),true);assert.equal(await root.locator('[data-economic-measure]').isVisible(),true);
  assert.match(await root.locator('[data-heading]').textContent(),/GDP/);
  await page.goto(new URL('resources/data-explorer/trade.html',base).href,{waitUntil:'networkidle'});await ready();
  assert.match(page.url(),/compare\.html#trade$/);assert.equal(await root.locator('select[data-metric]').inputValue(),'trade');
  assert.equal(await chart.evaluate(n=>n.data.some(t=>t.meta?.tradeReference)),false);
  await root.locator('[data-trade-scope]').selectOption('goods_proxy');await ready();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const node=document.querySelector('[data-chart]');return node?.querySelector('.main-svg')?.getBoundingClientRect().width<=node.clientWidth+1;});
  await centeredBars();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'trade-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await ready();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,'trade-dark.png'),fullPage:true});
  assert.equal(await root.locator('[data-methods-trade]').isHidden(),true); // inside collapsed How it works
  await root.locator('[data-how-it-works] > summary').click();
  assert.equal(await root.locator('[data-methods-trade]').isVisible(),true);assert.equal(await root.locator('[data-methods-economy]').isHidden(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: integrated indicator, both scopes, stacked legend, time markers, reference range/coverage, exact group sums, domestic exclusion, CSV, empty-state recovery, GDP state, scope availability, old URL, notes, mobile and theme.');
 }finally{if(browser)await browser.close();if(server)server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
