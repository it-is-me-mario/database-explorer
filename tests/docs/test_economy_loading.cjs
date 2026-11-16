const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/economy-browser.js'),'utf8');
test('a failed startup exposes a retry action and clears the busy state',async()=>{
 const attributes=new Map(),listeners=new Map();let reloads=0;
 const retry={addEventListener:(event,callback)=>listeners.set(event,callback)};
 const root={dataset:{root:'../../'},innerHTML:'Loading the data browser…',setAttribute:(name,value)=>attributes.set(name,value),querySelector:selector=>selector==='[data-retry-load]'?retry:null};
 const error=new Error('Temporary failure <503>');
 vm.runInNewContext(script,{
  document:{querySelector:()=>root},URL,
  location:{href:'https://example.test/resources/data-explorer/compare.html?indicator=ghg',reload:()=>reloads++},
  window:{MarioJSONAssets:{create:()=>({getJSON:async()=>{throw error;}})}}
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(attributes.get('aria-busy'),'false');assert.match(root.innerHTML,/role="alert"/);
 assert.match(root.innerHTML,/Temporary failure &lt;503&gt;/);assert.match(root.innerHTML,/>Retry loading<\/button>/);
 listeners.get('click')();assert.equal(reloads,1);
});
