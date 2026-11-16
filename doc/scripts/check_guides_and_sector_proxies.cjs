const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync,spawn}=require('node:child_process');
const external=process.env.EXPLORER_PREVIEW_URL,base=external||'http://127.0.0.1:8880/';
(async()=>{let server;if(!external){server=spawn(process.env.PYTHON||'python3',['-m','http.server','8880','--bind','127.0.0.1','--directory',process.env.EXPLORER_SITE||path.resolve(__dirname,'../../_site')],{stdio:'ignore'});let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Preview server did not start');}const browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 const out=path.join(process.env.EXPLORER_QA_DIR||'/private/tmp/explorer-guide-browser','guides-and-sectors');fs.mkdirSync(out,{recursive:true});
 await page.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});
 const root=page.locator('[data-economy-browser]'),ready=()=>page.waitForFunction(()=>document.querySelector('[data-economy-browser]')?.getAttribute('aria-busy')==='false');await ready();
 await root.locator('[data-metric]').selectOption('value_added_trade');await ready();
 async function choose(kind,value){const picker=root.locator(`[data-picker="${kind}"]`);await picker.locator('summary').click();await root.locator(`[data-bulk-filter="${kind}"][data-bulk-action="clear"]`).click();await ready();await root.locator(`[data-subset="${kind}"][value="${value}"]`).check();await ready();await picker.locator('summary').click();}
 await choose('year','2024');await choose('section','C');
 assert.match(await root.locator('[data-filter-note]').innerText(),/macrosector proxies/);
 assert.ok(await root.locator('[data-chart]').evaluate(n=>n.data.some(t=>(t.y||[]).some(v=>Number.isFinite(v)&&v>0))));
 const event=page.waitForEvent('download');await root.locator('[data-script]').click();const download=await event,zip=path.join(out,'actual-guides.zip');await download.saveAs(zip);
 const names=JSON.parse(execFileSync('python3',['-c','import ast,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist(); assert names and len(names)==len(set(names)); assert all(n.endswith(".py") and "/" not in n for n in names); [ast.parse(z.read(n).decode()) for n in names]; assert all("db.calc_trades_content(" in z.read(n).decode() for n in names); print(json.dumps(names))',zip],{encoding:'utf8'}));
 assert.ok(names.includes('exiobase.py')&&names.includes('adb.py'));
 await root.screenshot({path:path.join(out,'manufacturing-proxy.png')});
 await page.goto(new URL('resources/data-explorer/scope.html#sectoral-coverage',base).href,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('[data-ss-chart]')?.getAttribute('aria-busy')==='false');
 const chart=page.locator('[data-ss-chart]');
 const state=await chart.evaluate(n=>({labels:n.layout.xaxis.ticktext,values:n.data[1].z,bounds:[...n.querySelectorAll('.xtick text')].map(t=>{const r=t.getBoundingClientRect();return {text:t.textContent,l:r.left,r:r.right,t:r.top,b:r.bottom};})}));
 const rex=state.labels.findIndex(s=>s.includes('REX3'));assert.ok(rex>=0);assert.ok(state.values.some(row=>row[rex]>0));
 for(const label of state.labels)assert.doesNotMatch(label,/IOT|SUT|Monetary/);
 assert.ok(state.labels.includes('FIGARO<br>(64)'));
 for(let i=0;i<state.bounds.length;i++)for(let j=i+1;j<state.bounds.length;j++){const a=state.bounds[i],b=state.bounds[j];assert.ok(Math.min(a.r,b.r)-Math.max(a.l,b.l)<=1||Math.min(a.b,b.b)-Math.max(a.t,b.t)<=1,`overlapping sector labels: ${a.text}/${b.text}`);}
 await chart.screenshot({path:path.join(out,'sectoral-light.png')});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await chart.screenshot({path:path.join(out,'sectoral-dark.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('[data-sectoral-scope]').screenshot({path:path.join(out,'sectoral-mobile.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({guides:names,manufacturing_proxy:true,rex_concordance:true,labels_do_not_overlap:true,page_errors:errors}));
 }finally{await browser.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
