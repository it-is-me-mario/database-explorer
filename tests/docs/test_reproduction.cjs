const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const R=require('../../doc/source/_static/reproduction-download.js');
test('download archive preserves UTF-8 names, contents and CRC in a standard ZIP reader',async()=>{
 const blob=R.zip([{name:'recipes/source.py',data:'print("MARIO")\n'},{name:'selections/Italia_è.json',data:'{"value":null}\n'}]);
 const result=spawnSync('python3',['-c','import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))'],{input:Buffer.from(await blob.arrayBuffer())});
 assert.equal(result.status,0,result.stderr.toString());const files=JSON.parse(result.stdout);assert.equal(files['recipes/source.py'],'print("MARIO")\n');assert.equal(files['selections/Italia_è.json'],'{"value":null}\n');
 assert.throws(()=>R.zip([{name:'../private.py',data:'x'}]),/Invalid archive path/);
});
test('economic code selection retains explicit native geography and macrosector indices',()=>{
 const M=require('../../doc/source/_static/economy-model.js');
 const s={recipe:{year:2022,sectors:['goods','services'],source:'EXIOBASE'},regions:[{code:'CN',iso3:'CHN',kind:'country',name:'China'},{code:'ROW',kind:'aggregate',name:'RoW'}]};
 const state={metric:'value_added',country:'CHN',section:'C',perCapita:false},row={country:'CHN',sector:'C',value:35};
 const p=R.economicPoint(s,row,state,{entries:[{index:0,section:'C'}]},{},M);
 assert.deepEqual(p.region_codes,['CN']);assert.deepEqual(p.sector_indices,[0]);assert.equal(p.expected_value,35);assert.equal(p.row.value,null);
 const world=R.economicPoint(s,{country:'world',sector:'all',value:80},{...state,country:'world',section:'all'},null,{},M);assert.deepEqual(world.region_codes,['CN','ROW']);
});
