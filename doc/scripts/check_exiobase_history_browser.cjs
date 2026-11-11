const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

module.exports = async function checkExiobaseHistory({page, root, chart, ready, metric, pick, set, csv, readCSV, onlyFamily, getJSON, sourceRoot, out}) {
  const years = Array.from({length: 30}, (_, index) => 1995 + index);
  const worldBank = await getJSON('data/economy/world-bank.json');
  const sources = new Map();

  async function selectRelease() {
    await onlyFamily('EXIOBASE');
    const expander = root.locator('[data-expand-family="EXIOBASE"]');
    if (await expander.getAttribute('aria-expanded') !== 'true') {
      await expander.click();
      await ready();
    }
    for (const [key, wanted] of [['units', ['Monetary']], ['version', ['3.11.2']], ['format', ['IOT']], ['system', ['ixi', 'pxp']]]) {
      for (const value of wanted) {
        await root.locator(`[data-compare-facet="EXIOBASE"][data-facet-key="${key}"][value="${value}"]`).check();
        await ready();
      }
      const selected = await root.locator(`[data-compare-facet="EXIOBASE"][data-facet-key="${key}"]:checked`).evaluateAll(nodes => nodes.map(node => node.value));
      for (const value of selected) {
        if (!wanted.includes(value)) {
          await root.locator(`[data-compare-facet="EXIOBASE"][data-facet-key="${key}"][value="${value}"]`).uncheck();
          await ready();
        }
      }
    }
  }

  async function selectAllYears() {
    assert.deepEqual(await root.locator('[data-subset="year"]').evaluateAll(nodes => nodes.map(node => Number(node.value)).sort((a, b) => a - b)), years);
    await root.locator('[data-picker="year"] > summary').click();
    await root.locator('[data-bulk-filter="year"][data-bulk-action="select"]').click();
    await ready();
    await root.locator('[data-picker="year"] > summary').click();
  }

  function native(row) {
    const system = row.version.match(/\b(ixi|pxp)\b/)?.[1];
    assert.ok(system, row.version);
    const identifier = `exiobase-3112-${row.year}-${system}`;
    if (!sources.has(identifier)) {
      const source = JSON.parse(fs.readFileSync(path.join(sourceRoot, identifier + '.json')));
      const shard = JSON.parse(fs.readFileSync(path.join(sourceRoot, source.sector_files.C)));
      sources.set(identifier, {source, shard});
    }
    return {...sources.get(identifier), system};
  }

  function close(actual, expected) {
    assert.ok(Math.abs(Number(actual) - expected) <= .000001 + 1e-10 * Math.abs(expected), `${actual} != ${expected}`);
  }

  function checkTrade(rows, emissions) {
    assert.equal(rows.length, 60, JSON.stringify([...new Set(rows.map(row => row.version))]));
    for (const system of ['ixi', 'pxp']) {
      assert.deepEqual(rows.filter(row => row.version.includes(system)).map(row => Number(row.year)).sort((a, b) => a - b), years);
    }
    for (const row of rows) {
      const {source, shard} = native(row);
      const origin = source.regions.findIndex(region => region.iso3 === 'CHN');
      const destination = source.regions.findIndex(region => region.iso3 === 'ITA');
      assert.ok(origin >= 0 && destination >= 0);
      const rate = emissions ? 1 : worldBank.currency_rates.EUR.years[String(row.year)];
      if (!emissions) close(row.usd_per_native_currency, rate);
      const block = emissions ? shard.ghg_trade : shard.value_added_trade.total;
      for (const use of ['intermediate', 'final']) {
        close(row[use + (emissions ? '_t_co2eq' : '_usd')], block[use][origin][destination] * rate);
      }
      assert.equal(row.sectors, 'C');
    }
  }

  await page.setViewportSize({width: 1440, height: 1050});
  await metric('value_added_trade');
  await selectRelease();
  await pick('section', 'C');
  await pick('origin', 'CHN');
  await pick('destination', 'ITA');
  await set('[data-trade-use]', 'total');
  await set('[data-trade-origin]', 'total');
  await set('[data-legend-by]', 'database');
  await selectAllYears();
  checkTrade(readCSV(await csv()), false);
  assert.ok(await chart.evaluate(node => node.data.every(trace => trace.type === 'scatter')));
  await chart.screenshot({path: path.join(out, 'exiobase-va-history-manufacturing.png')});

  const downloadEvent = page.waitForEvent('download');
  await root.locator('[data-script]').click();
  const download = await downloadEvent;
  const archive = path.join(out, 'code-exiobase-va-history.zip');
  await download.saveAs(archive);
  execFileSync('python3', ['-c', [
    'import ast,sys,zipfile',
    'archive=zipfile.ZipFile(sys.argv[1])',
    'assert archive.namelist()==["exiobase.py"]',
    'source=archive.read("exiobase.py").decode()',
    'ast.parse(source)',
    'assert source.count("mario.parse_exiobase(")==2',
    'assert "IOT_{year}_ixi.zip" in source and "IOT_{year}_pxp.zip" in source',
    'assert "for row in VALUE_ADDED_ROWS" in source',
    'assert "Taxes less subsidies on products purchased: Total" not in source',
  ].join('\n'), archive]);

  await pick('year', 1995);
  await set('[data-legend-by]', 'component');
  const components = readCSV(await csv());
  assert.equal(components.length, 4);
  for (const row of components) {
    const {source, shard} = native(row);
    assert.ok(['domestic', 'foreign'].includes(row.value_added_origin));
    const origin = source.regions.findIndex(region => region.iso3 === 'CHN');
    const destination = source.regions.findIndex(region => region.iso3 === 'ITA');
    const block = shard.value_added_trade[row.value_added_origin];
    close(row.displayed_usd, (block.intermediate[origin][destination] + block.final[origin][destination]) * worldBank.currency_rates.EUR.years['1995']);
  }
  await chart.screenshot({path: path.join(out, 'exiobase-va-origins-1995-desktop.png')});
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await chart.screenshot({path: path.join(out, 'exiobase-va-origins-1995-mobile.png')});

  await page.setViewportSize({width: 1440, height: 1050});
  await metric('ghg_trade');
  await selectRelease();
  await pick('section', 'C');
  await pick('origin', 'CHN');
  await pick('destination', 'ITA');
  await set('[data-trade-use]', 'total');
  await set('[data-legend-by]', 'database');
  await selectAllYears();
  checkTrade(readCSV(await csv()), true);
  await chart.screenshot({path: path.join(out, 'exiobase-ghg-history-manufacturing.png')});

  for (const indicator of ['value_added_footprint', 'ghg_footprint']) {
    await metric(indicator);
    await selectRelease();
    await pick('year', 1995);
    await pick('country', 'ITA');
    await pick('section', 'C');
    const measure = root.locator('[data-measure]');
    if (await measure.isEnabled()) await set('[data-measure]', 'total');
    else assert.equal(await measure.inputValue(), 'total');
    await set('[data-account-component]', 'total');
    await set('[data-legend-by]', 'database');
    const rows = readCSV(await csv());
    assert.equal(rows.length, 4);
    const labels = indicator === 'value_added_footprint' ? ['Domestic value added', 'Foreign value added'] : ['Domestic emissions', 'Foreign emissions'];
    for (const row of rows) {
      const {source, shard} = native(row);
      const consumer = source.regions.findIndex(region => region.iso3 === 'ITA');
      const component = labels.indexOf(row.component);
      assert.ok(component >= 0, row.component);
      const footprint = shard.accounts[indicator][consumer][component];
      if (indicator === 'value_added_footprint') {
        assert.match(row.unit, /billion/);
        close(row.value, footprint * worldBank.currency_rates.EUR.years['1995'] / 1e9);
      } else {
        assert.match(row.unit, /Mt/);
        close(row.value, footprint / 1e6);
      }
    }
  }
  await metric('gdp');
};
