/* Check already executed download folders; this never executes source models. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const folders=process.argv.slice(2),out=process.env.EXPLORER_QA_DIR||path.join(os.tmpdir(),'explorer-reproduced-chart-qa');
assert.ok(folders.length,'Pass one or more executed download folders containing chart.html and results.js');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.EXPLORER_BROWSER_CHANNEL?{channel:process.env.EXPLORER_BROWSER_CHANNEL}:{})});try{
 for(const folder of folders){
  assert.ok(fs.existsSync(path.join(folder,'results.js')),'Missing actual recomputed results.js');
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
  await page.goto(pathToFileURL(path.resolve(folder,'chart.html')).href,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#chart')?.data?.length);
  for(const width of [1440,390,768,320,1440]){
   await page.setViewportSize({width,height:1050});
   await page.waitForFunction(()=>{const n=document.querySelector('#chart');return Math.abs(n._fullLayout.width-n.clientWidth)<2&&(n.clientWidth>=480?n.layout.title.pad.t===18:n.layout.title.pad.t===52);});
   await page.waitForTimeout(150);
   const state=await page.locator('#chart').evaluate(node=>{
    const box=node.getBoundingClientRect(),plain=text=>{const element=document.createElement('span');element.innerHTML=String(text||'').replace(/<br\s*\/?>/gi,' ');return element.textContent.replace(/\s+/g,' ').trim();};
    return {width:box.width,plotTop:node._fullLayout._size.t,title:plain(node.layout.title.text),expectedTitle:plain(window.MARIO_REPRODUCED.layout.title.text),subtitle:plain(node.layout.title.subtitle?.text),expectedSubtitle:plain(window.MARIO_REPRODUCED.layout.title.subtitle?.text),
     headers:[...node.querySelectorAll('.gtitle,.gsubtitle')].map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent,left:b.left-box.left,right:b.right-box.left,top:b.top-box.top,bottom:b.bottom-box.top};}),
     bars:node.data.filter(t=>t.type==='bar').map(t=>({name:t.name,y:t.y})),components:node.data.map(t=>t.meta?.tradeComponent),mode:node.layout.barmode,overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.equal(state.title,state.expectedTitle);assert.equal(state.subtitle,state.expectedSubtitle);assert.ok(state.headers.length>=1);assert.equal(state.overflow,false);
   for(const header of state.headers){assert.ok(header.left>=-1&&header.right<=state.width+1,`Clipped header at ${width}px: ${JSON.stringify(header)}`);assert.ok(header.top>=0&&header.bottom<=state.plotTop-2,`Header overlaps plot at ${width}px: ${JSON.stringify(header)}`);}
   if(state.components.includes('intermediate')){assert.deepEqual(state.components,['intermediate','final']);assert.equal(state.mode,'relative');}
   assert.ok(state.bars.every(t=>t.y.every(Number.isFinite)));assert.deepEqual(errors,[]);
   await page.locator('#chart').screenshot({path:path.join(out,path.basename(folder)+'-'+width+'.png')});
  }
  console.log(JSON.stringify({folder,responsive_title_and_subtitle:true,widths:[1440,390,768,320,1440],errors}));await page.close();
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
