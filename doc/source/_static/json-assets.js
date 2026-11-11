/* Resolve build-compressed JSON without changing canonical data or global fetch. */
((global)=>{
 'use strict';
 const clients=new Map();
 const unsupported='This browser cannot decompress the explorer data. Use a current Chrome, Edge, Firefox, or Safari version.';
 function create(staticBase,options={}){
  const base=new URL(staticBase,global.location?.href);
  if(!base.pathname.endsWith('/'))throw Error('The JSON asset base must end in a slash.');
  const key=base.href;
  if(!options.registry&&clients.has(key))return clients.get(key);
  let registry=null,registryRequest=null;
  const pending=new Map();
  function logicalPath(path){
   const url=new URL(path,base);
   if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.search||url.hash)throw Error('JSON asset path is outside its static base: '+path);
   return url.pathname.slice(base.pathname.length);
  }
  function validate(value){
   if(value?.schema_version!==1||!value.assets||typeof value.assets!=='object'||Array.isArray(value.assets))throw Error('Invalid JSON asset registry.');
   for(const [name,item] of Object.entries(value.assets)){
    if(logicalPath(name)!==name||!name.endsWith('.json')||!item||typeof item.path!=='string'||!Number.isSafeInteger(item.bytes)||item.bytes<=0||!Number.isSafeInteger(item.compressed_bytes)||item.compressed_bytes<=0||!/^[a-f0-9]{64}$/.test(item.sha256||''))throw Error('Invalid JSON asset registry entry: '+name);
    const local=item.encoding==='gzip'&&logicalPath(item.path)===item.path&&item.path===name+'.gz'&&!item.source_commit;
    const remote=item.encoding==='identity'&&/^[a-f0-9]{40}$/.test(item.source_commit||'')&&/^data\/embodied-trade\/[^/]+--[^/]+\.json$/.test(name)&&item.compressed_bytes===item.bytes&&item.path===`https://raw.githubusercontent.com/it-is-me-mario/database-explorer/${item.source_commit}/doc/source/_static/${name}`;
    if(!local&&!remote)throw Error('Invalid JSON asset registry entry: '+name);
   }
   registry=value;return value;
  }
  async function request(url){
   const response=await global.fetch(url,{cache:'no-cache'});
   if(!response.ok)throw Error('Could not load '+url+' (HTTP '+response.status+').');
   return response;
  }
  function ready(){
   if(!registryRequest){
    const pendingRegistry=options.registry?Promise.resolve().then(()=>validate(options.registry)):request(new URL('json-assets.json',base).href).then(r=>r.json()).then(validate);
    registryRequest=pendingRegistry;pendingRegistry.catch(()=>{if(registryRequest===pendingRegistry)registryRequest=null;});
   }
   return registryRequest;
  }
  function resolve(path){
   if(!registry)throw Error('Load the JSON asset registry before resolving a download.');
   const name=logicalPath(path),item=registry.assets[name];
   return {url:new URL(item?.path||name,base).href,encoding:item?.encoding||null};
  }
  async function decode(response,item,name){
   let bytes=new Uint8Array(await response.arrayBuffer());
   // Fetch may have already removed an HTTP Content-Encoding layer. Sniff the
   // delivered bytes, then validate the original payload in either case.
   if(item.encoding==='gzip'&&bytes[0]===0x1f&&bytes[1]===0x8b){
    if(bytes.length!==item.compressed_bytes)throw Error('Compressed JSON size mismatch: '+name);
    if(typeof global.DecompressionStream!=='function')throw Error(unsupported);
    let decompressor;
    try{decompressor=new global.DecompressionStream('gzip');}catch{throw Error(unsupported);}
    let seen=0;
    const bounded=new TransformStream({transform(chunk,controller){seen+=chunk.byteLength;if(seen>item.bytes)throw Error('Decoded JSON size mismatch: '+name);controller.enqueue(chunk);}});
    bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(decompressor).pipeThrough(bounded)).arrayBuffer());
   }
   if(bytes.length!==item.bytes)throw Error('Decoded JSON size mismatch: '+name);
   if(!global.crypto?.subtle)throw Error('This browser cannot verify the explorer data. Open the HTTPS site in a current browser.');
   const hash=Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
   if(hash!==item.sha256)throw Error('JSON checksum mismatch: '+name+'. Reload the page.');
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }
  async function getJSON(path){
   await ready();const name=logicalPath(path);
   if(!pending.has(name)){
    const item=registry.assets[name],promise=request(resolve(name).url).then(response=>item?decode(response,item,name):response.json());
    pending.set(name,promise);promise.then(()=>pending.delete(name),()=>pending.delete(name));
   }
   return pending.get(name);
  }
  const client={getJSON,resolve,ready};
  if(!options.registry)clients.set(key,client);
  return client;
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.MarioJSONAssets=api;
})(globalThis);
