const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

module.exports = async function checkGloriaHistory({page, root, chart, ready, metric, pick, set, csv, readCSV, onlyFamily, sourceRoot, out}) {
  const years = Array.from({length: 26}, (_, index) => 2000 + index);
  const readings = new Map(years.map(year => [year, JSON.parse(fs.readFileSync(path.join(sourceRoot, `gloria-060-${year}-sut.json`)))]));
  const shards = new Map();
  function source(year) {
    const reading = readings.get(Number(year));
    assert.ok(reading, String(year));
    if (!shards.has(Number(year))) shards.set(Number(year), JSON.parse(fs.readFileSync(path.join(sourceRoot, reading.sector_files.C))));
    return {reading, shard: shards.get(Number(year))};
  }
  function close(actual, expected) {
    assert.ok(Math.abs(Number(actual) - expected) <= .000001 + 1e-10 * Math.abs(expected), `${actual} != ${expected}`);
  }
  function unitScale(row, indicator) {
    if (indicator === 'ghg_footprint') {
      assert.match(row.unit, /Mt/);
      return 1e6;
    }
    const scales = [['trillion', 1e12], ['billion', 1e9], ['million', 1e6], ['thousand', 1e3]];
    return scales.find(([label]) => row.unit.includes(label))?.[1] || 1;
  }
  async function allYears() {
    assert.deepEqual(await root.locator('[data-subset="year"]').evaluateAll(nodes => nodes.map(node => Number(node.value)).sort((a, b) => a - b)), years);
    await root.locator('[data-picker="year"] > summary').click();
    await root.locator('[data-bulk-filter="year"][data-bulk-action="select"]').click();
    await ready();
    await root.locator('[data-picker="year"] > summary').click();
  }
  async function downloadGuide(indicator) {
    const event = page.waitForEvent('download');
    await root.locator('[data-script]').click();
    const archive = path.join(out, `code-gloria-history-${indicator}.zip`);
    await (await event).saveAs(archive);
    execFileSync('python3', ['-c', [
      'import ast,sys,zipfile',
      'archive=zipfile.ZipFile(sys.argv[1])',
      'assert archive.namelist()==["gloria.py"]',
      'source=archive.read("gloria.py").decode()',
      'ast.parse(source)',
      'assert source.count("mario.parse_gloria(")==1',
      'assert "YEARS = " + str(list(range(2000,2026))) in source',
      'assert "mario.set_linear_solver(\\"scipy\\")" in source',
      'assert "mario.set_linear_strategy(\\"direct\\")" in source',
      'if sys.argv[2]=="ghg_trade":',
      '    assert "gwp={GHG_ACCOUNT: 1.0}" in source',
      '    assert "db.calc_trades_content(indicator=\\"GHG\\"" in source',
      '    assert "ipcc_report=" not in source',
    ].join('\n'), archive, indicator]);
  }

  await page.setViewportSize({width: 1440, height: 1050});
  for (const indicator of ['value_added_trade', 'ghg_trade']) {
    await metric(indicator);
    await onlyFamily('GLORIA');
    await pick('section', 'C');
    await pick('origin', 'CHN');
    await pick('destination', 'ITA');
    await set('[data-trade-use]', 'total');
    if (indicator === 'value_added_trade') await set('[data-trade-origin]', 'total');
    await set('[data-legend-by]', 'database');
    await allYears();
    const rows = readCSV(await csv());
    assert.equal(rows.length, years.length);
    assert.deepEqual(rows.map(row => Number(row.year)).sort((a, b) => a - b), years);
    for (const row of rows) {
      const {reading, shard} = source(row.year);
      const origin = reading.regions.findIndex(region => region.iso3 === 'CHN');
      const destination = reading.regions.findIndex(region => region.iso3 === 'ITA');
      assert.ok(origin >= 0 && destination >= 0);
      const block = indicator === 'ghg_trade' ? shard.ghg_trade : shard.value_added_trade.total;
      for (const use of ['intermediate', 'final']) close(row[use + (indicator === 'ghg_trade' ? '_t_co2eq' : '_usd')], block[use][origin][destination]);
      assert.equal(row.sectors, 'C');
      if (indicator === 'value_added_trade') close(row.usd_per_native_currency, 1);
      else assert.match(row.gwp_basis, /source|native/i);
    }
    assert.ok(await chart.evaluate(node => node.data.every(trace => trace.type === 'scatter')));
    await chart.screenshot({path: path.join(out, `gloria-${indicator}-history-manufacturing.png`)});
    await downloadGuide(indicator);
  }

  await metric('value_added_trade');
  await onlyFamily('GLORIA');
  await pick('year', 2000);
  await set('[data-legend-by]', 'component');
  const components = readCSV(await csv());
  assert.equal(components.length, 2);
  const {reading, shard} = source(2000);
  const origin = reading.regions.findIndex(region => region.iso3 === 'CHN');
  const destination = reading.regions.findIndex(region => region.iso3 === 'ITA');
  for (const row of components) {
    assert.ok(['domestic', 'foreign'].includes(row.value_added_origin));
    const block = shard.value_added_trade[row.value_added_origin];
    close(row.displayed_usd, block.intermediate[origin][destination] + block.final[origin][destination]);
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await chart.screenshot({path: path.join(out, 'gloria-va-origins-2000-mobile.png')});
  await page.setViewportSize({width: 1440, height: 1050});

  for (const indicator of ['value_added_footprint', 'ghg_footprint']) {
    await metric(indicator);
    await onlyFamily('GLORIA');
    await pick('country', 'ITA');
    await pick('section', 'C');
    const measure = root.locator('[data-measure]');
    if (await measure.isEnabled()) await set('[data-measure]', 'total');
    else assert.equal(await measure.inputValue(), 'total');
    await set('[data-account-component]', 'total');
    await set('[data-legend-by]', 'database');
    await allYears();
    const totals = readCSV(await csv());
    assert.equal(totals.length, years.length);
    for (const row of totals) {
      const {reading, shard} = source(row.year);
      const consumer = reading.regions.findIndex(region => region.iso3 === 'ITA');
      const expected = shard.accounts[indicator][consumer].reduce((sum, value) => sum + value, 0);
      assert.equal(row.component, 'Total');
      close(row.value, expected / unitScale(row, indicator));
    }
    await chart.screenshot({path: path.join(out, `gloria-${indicator}-history-total.png`)});
    await set('[data-legend-by]', 'component');
    const rows = readCSV(await csv());
    assert.equal(rows.length, years.length * 2);
    const labels = indicator === 'ghg_footprint' ? ['Domestic emissions', 'Foreign emissions'] : ['Domestic value added', 'Foreign value added'];
    for (const row of rows) {
      const {reading, shard} = source(row.year);
      const consumer = reading.regions.findIndex(region => region.iso3 === 'ITA');
      const component = labels.indexOf(row.component);
      assert.ok(component >= 0, row.component);
      close(row.value, shard.accounts[indicator][consumer][component] / unitScale(row, indicator));
    }
    await chart.screenshot({path: path.join(out, `gloria-${indicator}-history-manufacturing.png`)});
  }
  console.log(JSON.stringify({approved_gloria_history: {years, readings: years.length, trade: true, footprints: true, manufacturing_proxy: true, exporter_relative_va: true, one_python_guide: true}}));
  await metric('gdp');
};
