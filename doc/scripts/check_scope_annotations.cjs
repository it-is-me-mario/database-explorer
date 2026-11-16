/* Run against a built local preview; screenshots are private QA artifacts. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const external=process.env.EXPLORER_PREVIEW_URL,base=external||'http://127.0.0.1:8879/';
const output=process.env.EXPLORER_QA_DIR?path.join(process.env.EXPLORER_QA_DIR,'scope-annotations'):path.join(os.tmpdir(),'explorer-scope-annotations');
const expected=['EXIOBASE REX3','EXIOBASE ixi and FIGARO E3','EXIOBASE pxp','FIGARO'];
(async()=>{let server,browser;
 try {
 fs.mkdirSync(output,{recursive:true});
 if(!external){
  server=spawn(process.env.PYTHON||'python3',['-m','http.server','8879','--bind','127.0.0.1','--directory',process.env.EXPLORER_SITE||path.resolve(__dirname,'../../_site')],{stdio:'ignore'});
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Classification preview server did not start');
 }
 browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('resources/data-explorer/scope.html',base).href,{waitUntil:'networkidle'});
  const chart=page.locator('[data-scope-chart]');
  await page.waitForFunction(()=>document.querySelector('[data-database-scope]')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.getByText('REX3 is grouped under EXIOBASE, with its own resolved geography',{exact:false}).count(),0);
  for(const theme of ['light','dark'])for(const width of [1440,768,390,320]) {
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.setViewportSize({width,height:1100});
   await page.waitForFunction(()=>{const n=document.querySelector('[data-scope-chart]');return n?.data&&Math.abs(n._fullLayout.width-n.clientWidth)<2&&n.layout.height===(n.clientWidth<540?580:410);});
   await page.waitForTimeout(150);
   const state=await chart.evaluate(n=>{
    const bounds=n.getBoundingClientRect(),rect=node=>{const r=node.getBoundingClientRect();return {left:r.left-bounds.left,right:r.right-bounds.left,top:r.top-bounds.top,bottom:r.bottom-bounds.top};};
    const labels=[...n.querySelectorAll('.textpoint')].map(node=>({text:[...node.querySelectorAll('tspan.line')].map(t=>t.textContent).join(' ')||node.textContent,...rect(node)}));
    return {width:bounds.width,height:bounds.height,labels,markers:[...n.querySelectorAll('.scatterlayer .point')].map(rect),traces:n.data.map(t=>({mode:t.mode,name:t.name,meta:t.meta,x:t.x,y:t.y})),overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.equal(state.overflow,false,`${theme}/${width}: page overflow`);
   assert.equal(state.traces.filter(t=>t.mode==='lines').length,1,'no annotation leader lines');
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   for(const text of expected) {
    const label=state.labels.find(l=>l.text===text);assert.ok(label,`${theme}/${width}: ${text}`);
    assert.ok(label.left>=0&&label.right<=state.width&&label.top>=0&&label.bottom<=state.height,`${theme}/${width}: clipped ${text}`);
    assert.ok(state.labels.every(other=>other===label||!overlap(label,other)),`${theme}/${width}: overlapping label ${text}`);
    assert.ok(state.markers.every(marker=>!overlap(label,marker)),`${theme}/${width}: label covers marker ${text}`);
   }
   for(const name of ['EXIOBASE','FIGARO'])assert.equal(state.traces.filter(t=>t.mode==='markers'&&t.name===name).length,1);
   await chart.screenshot({path:path.join(output,`scope-${theme}-${width}.png`)});
  }
  await page.locator('[data-scope-year]').selectOption('2020');
  await page.waitForFunction(()=>document.querySelector('[data-scope-chart]').data.some(t=>t.mode==='text'&&t.name==='EXIOBASE ixi'));
  assert.equal(await chart.evaluate(n=>n.data.some(t=>t.mode==='text'&&t.name.includes('FIGARO E3'))),false);
  await page.locator('[data-scope-year]').selectOption('all');
  await page.waitForFunction(()=>document.querySelector('[data-scope-chart]').data.some(t=>t.name==='EXIOBASE ixi and FIGARO E3'));
  assert.deepEqual(errors,[]);
  console.log('Classification annotations passed: four labels, distinct marker families, no leaders, year filtering, both themes and desktop/tablet/mobile.');
 } finally {await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
