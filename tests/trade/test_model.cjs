const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../doc/source/_static/trade-model.js');
const reading = {regions: [{iso3:'CHN',kind:'country'}, {iso3:'ITA',kind:'country'}, {iso3:null,kind:'aggregate'}],
  flows: {all: {intermediate:[[9,20,4],[5,8,2],[1,2,3]], final:[[1,-2,0],[2,1,0],[0,0,1]]}}};
test('directed flow includes signed final demand once', () => {
  assert.deepEqual(model.flow(reading,'CHN','ITA','all'),{intermediate:20,final:-2,total:18});
  assert.equal(model.flow(reading,'ITA','CHN','all').total,7);
});
test('missing country, scope and nonfinite observations remain unavailable', () => {
  assert.equal(model.flow(reading,'USA','ITA','all'),null);
  assert.equal(model.flow(reading,'CHN','ITA','goods_proxy'),null);
  const missing=structuredClone(reading);missing.flows.all.final[0][1]=null;
  assert.equal(model.flow(missing,'CHN','ITA','all'),null);
});
test('reference direction, year and reporter side never fall back', () => {
  const rows=[{origin:'CHN',destination:'ITA',year:2015,kind:'export',value_usd:20},
    {origin:'CHN',destination:'ITA',year:2015,kind:'mirror_import',value_usd:23}];
  assert.equal(model.reference(rows,'CHN','ITA',2015,'mirror_import').value_usd,23);
  assert.equal(model.reference(rows,'ITA','CHN',2015,'export'),null);
  assert.equal(model.reference(rows,'CHN','ITA',2022,'export'),null);
});
test('zero and missing references do not create infinity or zero scores', () => {
  assert.equal(model.ratio(10,0),null);assert.equal(model.ratio(null,10),null);
  assert.equal(model.ratio(0,10),0);assert.equal(model.ratio(20,10),2);
});
test('CSV retains missing cells and escapes punctuation', () => {
  assert.equal(model.csv([{source:'a,"b"',value:null}]),'"source","value"\r\n"a,""b""",""\r\n');
});
