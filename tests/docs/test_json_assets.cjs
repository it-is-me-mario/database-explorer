const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gzipSync}=require('node:zlib'),{createHash,webcrypto}=require('node:crypto');
const script=fs.readFileSync(path.resolve(__dirname,'../../doc/source/_static/json-assets.js'),'utf8');
const raw=Buffer.from('{"label":"Italia · CO₂","values":[1.2345678901234567,-0,1e-100,null]}\n'),gzip=gzipSync(raw),name='data/example.json';
const entry=(data=raw,packed=gzip)=>({path:name+'.gz',encoding:'gzip',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),compressed_bytes:packed.length});
const registry=item=>({schema_version:1,assets:{[name]:item||entry()}});
function fixture({index=registry(),body=gzip,headers={},overrides={},status=200}={}){
 const requests=[],context={module:{exports:{}},URL,Response,Blob,TextDecoder,TransformStream,DecompressionStream,crypto:webcrypto,...overrides};
 context.fetch=async url=>{requests.push(url);return String(url).endsWith('/json-assets.json')?new Response(JSON.stringify(index),{status}):new Response(body,{headers});};
 vm.runInNewContext(script,context);const api=context.module.exports,client=api.create('https://example.test/explorer/_static/');return {api,client,context,requests};
}
test('compressed JSON recovers original numbers and UTF-8 with one registry and in-flight request',async()=>{
 const {api,client,requests}=fixture();assert.equal(api.create('https://example.test/explorer/_static/'),client);
 const [a,b]=await Promise.all([client.getJSON(name),client.getJSON(name)]);assert.equal(JSON.stringify(a),JSON.stringify(JSON.parse(raw)));assert.equal(a,b);assert.ok(Object.is(a.values[1],-0));
 assert.equal(requests.filter(x=>x.endsWith('/json-assets.json')).length,1);assert.equal(requests.filter(x=>x.endsWith('.gz')).length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(client.resolve(name))),{url:'https://example.test/explorer/_static/data/example.json.gz',encoding:'gzip'});
 await client.getJSON(name);assert.equal(requests.filter(x=>x.endsWith('.gz')).length,2,'settled data is not cached outside its component');
});
test('explicit empty registries support source fixtures and untouched raw URLs',async()=>{
 const {api,requests}=fixture({body:raw}),client=api.create('https://example.test/source/_static/',{registry:{schema_version:1,assets:{}}});
 await client.getJSON(name);assert.equal(requests.length,1);assert.equal(requests[0],'https://example.test/source/_static/data/example.json');assert.equal(client.resolve(name).encoding,null);
});
test('HTTP-decoded gzip is verified once instead of being decompressed again',async()=>{
 const {client}=fixture({body:raw,headers:{'Content-Encoding':'gzip'},overrides:{DecompressionStream:undefined}});
 assert.equal((await client.getJSON(name)).label,'Italia · CO₂');
});
test('unsupported gzip browsers get an explicit actionable error',async()=>{
 await assert.rejects(fixture({overrides:{DecompressionStream:undefined}}).client.getJSON(name),/browser cannot decompress.*Chrome.*Firefox.*Safari/);
});
test('compressed and decoded sizes, checksums, and gzip integrity are enforced',async()=>{
 await assert.rejects(fixture({index:registry({...entry(),compressed_bytes:gzip.length+1})}).client.getJSON(name),/Compressed JSON size mismatch/);
 await assert.rejects(fixture({index:registry({...entry(),bytes:raw.length-1})}).client.getJSON(name),/Decoded JSON size mismatch/);
 await assert.rejects(fixture({index:registry({...entry(),bytes:raw.length+1})}).client.getJSON(name),/Decoded JSON size mismatch/);
 await assert.rejects(fixture({index:registry({...entry(),sha256:'0'.repeat(64)})}).client.getJSON(name),/JSON checksum mismatch/);
 const corrupted=Buffer.from(gzip);corrupted[corrupted.length-8]^=1;
 await assert.rejects(fixture({body:corrupted}).client.getJSON(name));
});
test('missing or malformed registries never fall back to unregistered raw files',async()=>{
 const missing=fixture({status:404});await assert.rejects(missing.client.getJSON(name),/HTTP 404/);assert.equal(missing.requests.length,1);
 for(const index of [{schema_version:2,assets:{}},{schema_version:1,assets:[]},registry({...entry(),path:'https://other.test/data.json.gz'}),registry({...entry(),path:'../data.json.gz'}),registry({...entry(),sha256:'bad'}),registry({...entry(),encoding:'br'})]){
  const f=fixture({index});await assert.rejects(f.client.getJSON(name));assert.equal(f.requests.length,1);
 }
});
test('invalid JSON is rejected even when its original-byte checksum matches',async()=>{
 const data=Buffer.from('{bad JSON'),packed=gzipSync(data);
 await assert.rejects(fixture({index:registry(entry(data,packed)),body:packed}).client.getJSON(name),/JSON|property|token/);
});
test('failed asset requests can retry without re-fetching the registry',async()=>{
 const {client,context,requests}=fixture();await client.ready();let attempts=0;
 context.fetch=async()=>{attempts++;return attempts===1?new Response('missing',{status:404}):new Response(gzip);};
 await assert.rejects(client.getJSON(name),/HTTP 404/);assert.equal((await client.getJSON(name)).label,'Italia · CO₂');assert.equal(attempts,2);assert.equal(requests.length,1);
});
test('downloads wait for the registry and cannot escape the static asset root',async()=>{
 const {client}=fixture();assert.throws(()=>client.resolve(name),/Load the JSON asset registry/);await client.ready();
 assert.throws(()=>client.resolve('../../private.json'),/outside its static base/);assert.throws(()=>client.resolve('https://outside.test/file.json'),/outside its static base/);
});


test('a transient registry failure does not poison the shared loader',async()=>{
 const {api,client,context}=fixture();let attempts=0;
 context.fetch=async url=>{if(String(url).endsWith('/json-assets.json')){attempts++;return attempts===1?new Response('retry',{status:503}):new Response(JSON.stringify(registry()));}return new Response(gzip);};
 await assert.rejects(client.ready(),/HTTP 503/);const recovered=api.create('https://example.test/explorer/_static/');assert.equal(recovered,client);assert.equal((await recovered.getJSON(name)).label,'Italia · CO₂');assert.equal(attempts,2);
});
