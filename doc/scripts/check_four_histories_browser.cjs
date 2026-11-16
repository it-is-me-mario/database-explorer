const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const model = require('../source/_static/economy-model.js');

module.exports = async function checkFourHistories({page, root, chart, ready, metric, pick, set, csv, readCSV, onlyFamily, getJSON, sourceRoot, out}) {
  const families = ['FIGARO', 'OECD', 'WIOD', 'ADB'];
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json')));
  const readings = manifest.readings.map(entry => JSON.parse(fs.readFileSync(path.join(sourceRoot, entry.file))));
  const expected = readings.filter(reading => families.includes(reading.recipe.source)
    && !(reading.recipe.source === 'OECD' && reading.recipe.release !== 'Regular')
    && !(reading.recipe.source === 'FIGARO' && reading.recipe.release === 'E3'));
  const byKey = new Map(expected.map(reading => [[reading.recipe.source, model.version(reading.recipe), reading.recipe.year].join('|'), reading]));
  const worldBank = await getJSON('data/economy/world-bank.json');
  const shards = new Map();
  const observed = {};

  function source(row) {
    const reading = byKey.get([row.database, row.version, row.year].join('|'));
    assert.ok(reading, JSON.stringify([row.database, row.version, row.year]));
    if (!shards.has(reading.id)) shards.set(reading.id, JSON.parse(fs.readFileSync(path.join(sourceRoot, reading.sector_files.C))));
    return {reading, shard: shards.get(reading.id)};
  }

  function close(actual, target) {
    assert.ok(Math.abs(Number(actual) - target) <= .000001 + 1e-10 * Math.abs(target), `${actual} != ${target}`);
  }

  function rate(reading) {
    return reading.recipe.currency === 'USD' ? 1 : worldBank.currency_rates[reading.recipe.currency].years[String(reading.recipe.year)];
  }

  function positions(reading) {
    const origin = reading.regions.findIndex(region => region.iso3 === 'CHN');
    const destination = reading.regions.findIndex(region => region.iso3 === 'ITA');
    assert.ok(origin >= 0 && destination >= 0);
    return {origin, destination};
  }

  async function facet(key, wanted) {
    const options = root.locator(`[data-compare-facet][data-facet-key="${key}"]`);
    if (!await options.count()) return;
    const values = wanted || await options.evaluateAll(nodes => nodes.map(node => node.value));
    for (const value of values) {
      await root.locator(`[data-compare-facet][data-facet-key="${key}"][value="${value}"]`).check();
      await ready();
    }
    for (const value of await options.evaluateAll(nodes => nodes.filter(node => node.checked).map(node => node.value))) {
      if (!values.includes(value)) {
        await root.locator(`[data-compare-facet][data-facet-key="${key}"][value="${value}"]`).uncheck();
        await ready();
      }
    }
  }

  async function selectFamily(family) {
    await onlyFamily(family);
    const expander = root.locator(`[data-expand-family="${family}"]`);
    if (await expander.count()) {
      if (await expander.getAttribute('aria-expanded') !== 'true') await expander.click();
      await ready();
      await facet('version', family === 'FIGARO' ? [''] : null);
      await facet('format');
      await facet('system');
    }
  }

  async function selectAllYears(years) {
    assert.deepEqual(await root.locator('[data-subset="year"]').evaluateAll(nodes => nodes.map(node => Number(node.value)).sort((a, b) => a - b)), years);
    await root.locator('[data-picker="year"] > summary').click();
    await root.locator('[data-bulk-filter="year"][data-bulk-action="select"]').click();
    await ready();
    await root.locator('[data-picker="year"] > summary').click();
  }

  await page.setViewportSize({width: 1440, height: 1050});
  for (const family of families) {
    const records = expected.filter(reading => reading.recipe.source === family);
    const years = [...new Set(records.map(reading => reading.recipe.year))].sort((a, b) => a - b);
    await metric('value_added_trade');
    await selectFamily(family);
    await pick('section', 'C');
    await pick('origin', 'CHN');
    await pick('destination', 'ITA');
    await set('[data-trade-origin]', 'total');
    await set('[data-trade-use]', 'total');
    await set('[data-legend-by]', 'database');
    await selectAllYears(years);
    const rows = readCSV(await csv()).filter(row => row.total_usd !== '');
    assert.equal(rows.length, records.length, family);
    assert.equal(new Set(rows.map(row => [row.version, row.year].join('|'))).size, records.length);
    for (const row of rows) {
      const {reading, shard} = source(row);
      const {origin, destination} = positions(reading);
      for (const use of ['intermediate', 'final']) close(row[use + '_usd'], shard.value_added_trade.total[use][origin][destination] * rate(reading));
      close(row.usd_per_native_currency, rate(reading));
      assert.equal(row.sectors, 'C');
      if (family === 'OECD') assert.equal(row.version, 'Regular');
    }
    assert.ok(await chart.evaluate(node => node.data.every(trace => trace.type === 'scatter')));
    await chart.screenshot({path: path.join(out, family.toLowerCase() + '-va-history-manufacturing.png')});

    await pick('year', years[0]);
    await set('[data-legend-by]', 'component');
    const components = readCSV(await csv()).filter(row => row.displayed_usd !== '');
    assert.equal(components.length, records.filter(reading => reading.recipe.year === years[0]).length * 2);
    for (const row of components) {
      const {reading, shard} = source(row);
      const {origin, destination} = positions(reading);
      assert.ok(['domestic', 'foreign'].includes(row.value_added_origin));
      const block = shard.value_added_trade[row.value_added_origin];
      close(row.displayed_usd, (block.intermediate[origin][destination] + block.final[origin][destination]) * rate(reading));
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await chart.screenshot({path: path.join(out, family.toLowerCase() + '-va-history-origins-mobile.png')});
    await page.setViewportSize({width: 1440, height: 1050});

    await metric('value_added_footprint');
    await selectFamily(family);
    await pick('year', years[0]);
    await pick('country', 'ITA');
    await pick('section', 'C');
    const measure = root.locator('[data-measure]');
    if (await measure.isEnabled()) await set('[data-measure]', 'total');
    else assert.equal(await measure.inputValue(), 'total');
    await set('[data-account-component]', 'total');
    await set('[data-legend-by]', 'database');
    const footprints = readCSV(await csv()).filter(row => row.value !== '');
    assert.equal(footprints.length, records.filter(reading => reading.recipe.year === years[0]).length * 2);
    for (const row of footprints) {
      const {reading, shard} = source(row);
      const consumer = reading.regions.findIndex(region => region.iso3 === 'ITA');
      const component = ['Domestic value added', 'Foreign value added'].indexOf(row.component);
      assert.ok(component >= 0, row.component);
      const scale = [['trillion', 1e12], ['billion', 1e9], ['million', 1e6], ['thousand', 1e3]].find(([label]) => row.unit.includes(label))?.[1] || 1;
      close(row.value, shard.accounts.value_added_footprint[consumer][component] * rate(reading) / scale);
    }
    observed[family] = {years, readings: rows.length, oldest_footprint_components: footprints.length};
  }

  await metric('value_added_trade');
  for (const family of families) await selectFamily(family);
  const databaseOptions = root.locator('[data-database-options]');
  if (!await databaseOptions.evaluate(node => node.open)) await databaseOptions.locator(':scope > summary').click();
  for (const family of families) {
    await root.locator(`[data-compare-family][value="${family}"]`).check();
    await ready();
  }
  const years = [...new Set(expected.map(reading => reading.recipe.year))].sort((a, b) => a - b);
  await selectAllYears(years);
  const downloadEvent = page.waitForEvent('download');
  await root.locator('[data-script]').click();
  const download = await downloadEvent;
  const archive = path.join(out, 'code-four-histories-va.zip');
  await download.saveAs(archive);
  execFileSync('python3', ['-c', [
    'import ast,sys,zipfile',
    'archive=zipfile.ZipFile(sys.argv[1])',
    'assert sorted(archive.namelist())==["adb.py","figaro.py","oecd.py","wiod.py"]',
    'for name in archive.namelist():',
    '    source=archive.read(name).decode()',
    '    ast.parse(source)',
    '    assert "mario.parse_" in source and "db.calc_trades_content(indicator=row" in source',
    '    assert "mario.set_compute_method(\\"solve\\")" in source',
    'assert "WIOT{year}_Nov16_ROW.xlsb" in archive.read("wiod.py").decode()',
    'assert "intsut{year % 100:02d}_nov16.xlsb" in archive.read("wiod.py").decode()',
    'assert "/path/to/OECD/Extended" not in archive.read("oecd.py").decode()',
  ].join('\n'), archive]);
  console.log(JSON.stringify({approved_four_histories: observed, one_python_per_database: true}));
  await metric('trade');
  await selectFamily('OECD');
  await pick('year', 1995);
  const monetary = readCSV(await csv()).filter(row => row.total_usd !== '');
  assert.ok(monetary.length);
  assert.deepEqual([...new Set(monetary.map(row => row.version))], ['Regular']);
  await metric('gdp');
};
