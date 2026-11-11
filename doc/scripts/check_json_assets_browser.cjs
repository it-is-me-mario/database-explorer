/* Exercise the actual compressed build, downloads, and visible failure states. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process'),{gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const external=process.env.EXPLORER_PREVIEW_URL,base=external||'http://127.0.0.1:8878/',out=path.join(process.env.EXPLORER_QA_DIR||os.tmpdir(),'explorer-json-assets');
(async()=>{let server,browser;try{
 fs.mkdirSync(out,{recursive:true});
 if(!external){server=spawn(process.env.PYTHON||'python3',['-m','http.server','8878','--bind','127.0.0.1','--directory',process.env.EXPLORER_SITE||path.resolve(__dirname,'../../_site')],{stdio:'ignore'});let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);}
 const registry=await(await fetch(new URL('_static/json-assets.json',base))).json();assert.equal(registry.schema_version,1);assert.ok(Object.keys(registry.assets).length>100,'Test requires the real compressed build');
 browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],requests=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});
 const compare=page.locator('[data-economy-browser]'),ready=()=>page.waitForFunction(()=>document.querySelector('[data-economy-browser]')?.getAttribute('aria-busy')==='false');await ready();assert.equal(await compare.locator('.eb-error').count(),0);
 assert.ok(requests.some(u=>u.endsWith('/data/economy/browser-index.json.gz')));
 await compare.locator('[data-metric]').selectOption('value_added_trade');await ready();
 await compare.locator('[data-database-options] > summary').click();await compare.locator('[data-compare-family][value="ADB"]').check();await ready();
 for(const family of await compare.locator('[data-compare-family]:checked').evaluateAll(nodes=>nodes.map(n=>n.value)))if(family!=='ADB'){await compare.locator(`[data-compare-family][value="${family}"]`).uncheck();await ready();}
 await compare.locator('[data-database-options] > summary').click();
 const yearPicker=compare.locator('[data-picker="year"]');if(await yearPicker.locator('summary').getAttribute('aria-disabled')!=='true'){await yearPicker.locator('summary').click();await compare.locator('[data-bulk-filter="year"][data-bulk-action="clear"]').click();await ready();await compare.locator('[data-subset="year"][value="2023"]').check();await ready();await yearPicker.locator('summary').click();}
 await compare.locator('[data-trade-origin]').selectOption('foreign');await ready();
 const downloadPromise=page.waitForEvent('download');await compare.locator('[data-script]').click();const download=await downloadPromise,zip=path.join(out,'actual-adb-foreign.zip');fs.copyFileSync(await download.path(),zip);
 const metadata=JSON.parse(execFileSync('python3',['-c','import ast,json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.namelist()==["adb.py"]; s=z.read("adb.py").decode(); ast.parse(s); assert "mario.parse_adb(" in s and "db.calc_trades_content(" in s; print(json.dumps({"metric":"value_added_trade","scripts":1,"guide":True}))',zip],{encoding:'utf8'}));
 await page.goto(new URL('resources/data-explorer/scope.html#sectoral-coverage',base).href,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('[data-ss-chart]')?.getAttribute('aria-busy')==='false');
 await page.waitForFunction(()=>document.querySelector('[data-database-scope]')?.getAttribute('aria-busy')==='false'&&document.querySelector('[data-extension-scope]')?.getAttribute('aria-busy')==='false'&&document.querySelector('[data-database-comparisons]')?.getAttribute('aria-busy')==='false');
 assert.ok(await page.locator('[data-database-comparisons] [data-map-country]').count(),'The geographic reader did not render country shapes');
 const scope=page.locator('[data-sectoral-scope]');assert.ok(await scope.locator('.ss-source-list a[href$=".json.gz"]').count());
 for(const link of await scope.locator('a[href$=".json.gz"]').all())assert.match(await link.textContent(),/JSON · gzip$/);
 const evidence=scope.locator('.ss-source-list a[href$=".json.gz"]').first(),evidenceURL=await evidence.getAttribute('href'),assetPath=new URL(evidenceURL).pathname.split('/_static/')[1],evidenceEntry=Object.values(registry.assets).find(item=>item.path===assetPath);assert.ok(evidenceEntry);
 const evidenceResponse=await page.request.get(evidenceURL),packed=await evidenceResponse.body(),original=packed[0]===0x1f&&packed[1]===0x8b?gunzipSync(packed):packed;assert.equal(original.length,evidenceEntry.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),evidenceEntry.sha256);
 assert.ok(requests.some(u=>u.endsWith('/data/economy/sectoral-scope.json.gz')));assert.ok(requests.some(u=>u.endsWith('/data/database_profiles.json.gz')));assert.ok(requests.some(u=>u.endsWith('/data/economy/extension-scope.json.gz')));
 const compressedOriginals=new Set(Object.keys(registry.assets).map(name=>new URL('_static/'+name,base).href));assert.equal(requests.filter(u=>compressedOriginals.has(u)).length,0,'A reader requested an unpublished raw JSON asset');
 await page.locator('[data-sectoral-scope] details.ss-notes > summary').click();await evidence.scrollIntoViewIfNeeded();await evidence.screenshot({path:path.join(out,'gzip-evidence-link.png')});
 assert.deepEqual(errors,[]);
 // Failure paths use separate browser contexts so cached registry state cannot hide them.
 const unsupported=await browser.newContext();await unsupported.addInitScript(()=>Object.defineProperty(window,'DecompressionStream',{value:undefined,configurable:true}));const old=await unsupported.newPage();await old.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});await old.waitForSelector('.eb-error');assert.match(await old.locator('.eb-error').innerText(),/browser cannot decompress.*Chrome.*Firefox.*Safari/);await unsupported.close();
 const mismatch=await browser.newContext();await mismatch.route('**/_static/json-assets.json',route=>route.fulfill({json:{...registry,assets:{...registry.assets,'data/economy/browser-index.json':{...registry.assets['data/economy/browser-index.json'],sha256:'0'.repeat(64)}}}}));const bad=await mismatch.newPage();await bad.goto(new URL('resources/data-explorer/compare.html',base).href,{waitUntil:'networkidle'});await bad.waitForSelector('.eb-error');assert.match(await bad.locator('.eb-error').innerText(),/JSON checksum mismatch/);await mismatch.close();
 console.log(JSON.stringify({compressed_build:true,actual_button_zip:zip,metadata,evidence_sha256:evidenceEntry.sha256,visible_unsupported_and_corruption_errors:true,page_errors:errors}));
 }finally{await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
