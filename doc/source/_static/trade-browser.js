(function () {
  'use strict';
  const host = document.querySelector('[data-trade-browser]');
  if (!host) return;
  const model = window.TradeModel, base = host.dataset.root + '_static/data/trade/';
  const number = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en', {maximumFractionDigits: 3}).format(value / 1e9);
  const make = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; };
  async function start() {
    const manifest = await fetch(base + 'manifest.json').then(r => { if (!r.ok) throw Error('Trade catalogue unavailable'); return r.json(); });
    host.replaceChildren();
    const controls = make('div', null, 'trade-controls'); host.append(controls);
    function select(label, entries, initial) {
      const wrap = make('label', label), control = document.createElement('select');
      for (const [value, text] of entries) { const option = make('option', text); option.value = value; control.append(option); }
      control.value = initial; wrap.append(control); controls.append(wrap); return control;
    }
    const countries = manifest.countries.map(r => [r.iso3, r.name]);
    const origin = select('Origin', countries, 'CHN');
    const destination = select('Destination', countries, 'ITA');
    const years = [...new Set(manifest.datasets.map(r => r.year))].sort();
    const year = select('Year', years.map(y => [String(y), String(y)]), String(years[0] || 2015));
    const scope = select('MRIO scope', [['goods_proxy', 'Goods-producing groups (proxy)'], ['all', 'Total: goods and services']], 'goods_proxy');
    const referenceKind = select('Comtrade reference', [['export', 'Origin export (usually FOB)'], ['mirror_import', 'Destination import (usually CIF)']], 'export');
    const status = make('p', '', 'trade-status'); status.setAttribute('role', 'status'); host.append(status);
    const references = make('div', null, 'trade-references'); host.append(references);
    const chart = make('div', null, 'trade-chart'); chart.setAttribute('role', 'img'); host.append(chart);
    const tableWrap = make('div', null, 'trade-table'); host.append(tableWrap);
    const download = make('button', 'Download this comparison · CSV'); download.type = 'button'; host.append(download);
    const cache = new Map(); let generation = 0, exportRows = [], renderedWidth = 0;
    const referenceRows = await fetch(base + 'comtrade.json').then(r => { if (!r.ok) throw Error('Comtrade reference unavailable'); return r.json(); }).then(r => r.observations);
    async function render() {
      const token = ++generation;
      if (origin.value === destination.value) { status.textContent = 'Choose two different countries for international trade.'; references.replaceChildren(); tableWrap.replaceChildren(); if (window.Plotly) Plotly.purge(chart); download.disabled = true; host.setAttribute('aria-busy', 'false'); return; }
      const entries = manifest.datasets.filter(r => r.year === Number(year.value));
      status.textContent = 'Loading selected readings…'; download.disabled = true; host.setAttribute('aria-busy', 'true');
      const readings = await Promise.all(entries.map(async entry => {
        if (!cache.has(entry.id)) cache.set(entry.id, fetch(base + entry.file).then(r => { if (!r.ok) throw Error('Reading unavailable: ' + entry.id); return r.json(); }));
        return cache.get(entry.id);
      }));
      if (token !== generation) return;
      const selected = model.reference(referenceRows, origin.value, destination.value, year.value, referenceKind.value);
      references.replaceChildren();
      for (const [kind, label] of [['export', 'Comtrade export'], ['mirror_import', 'Comtrade mirror import']]) {
        const row = model.reference(referenceRows, origin.value, destination.value, year.value, kind);
        const card = make('div', null, 'trade-reference'); card.append(make('strong', label), make('span', row ? number(row.value_usd) + ' billion USD' : 'Not collected for this pair/year'));
        references.append(card);
      }
      exportRows = readings.map(reading => {
        const value = model.flow(reading, origin.value, destination.value, scope.value);
        return { database: reading.label, year: Number(year.value), origin: origin.value, destination: destination.value,
          scope: scope.value === 'all' ? 'MRIO goods and services' : 'Goods-producing groups proxy',
          intermediate_usd: value?.intermediate ?? null, final_usd: value?.final ?? null, total_usd: value?.total ?? null,
          comtrade_kind: referenceKind.value, comtrade_usd: selected?.value_usd ?? null,
          comtrade_valuation: selected?.valuation ?? '',
          ratio_to_reference: model.ratio(value?.total, selected?.value_usd),
          comparison_note: 'Different accounting/valuation boundaries; ratio is not an accuracy score.',
          source: reading.source_url, license: reading.license, native_unit: reading.native_unit,
          license_url: reading.license_url, attribution: reading.attribution,
          native_currency: reading.native_currency, usd_per_native_currency: reading.usd_per_native_currency,
          source_price_basis: reading.price_basis, goods_proxy_note: reading.goods_proxy_note,
          comtrade_query: selected?.query_url ?? '', comtrade_retrieved_at: selected?.retrieved_at ?? '',
          comtrade_source: selected ? 'UN Comtrade' : '', comtrade_reuse_url: 'https://uncomtrade.org/docs/re-dissemination-of-data/',
          comtrade_is_reported: selected?.is_reported ?? null, comtrade_is_aggregate: selected?.is_aggregate ?? null };
      });
      const table = document.createElement('table'), caption = make('caption', 'Billion current USD · origin → destination'); table.append(caption);
      const head = document.createElement('thead'), header = document.createElement('tr');
      for (const text of ['Database', 'Intermediate', 'Final', 'Total', 'Ratio to reference']) header.append(make('th', text));
      head.append(header); table.append(head);
      const body = document.createElement('tbody');
      for (const row of exportRows) { const tr = document.createElement('tr'); for (const value of [row.database, number(row.intermediate_usd), number(row.final_usd), number(row.total_usd), row.ratio_to_reference == null ? 'Unavailable' : row.ratio_to_reference.toFixed(3) + '×']) tr.append(make('td', value)); body.append(tr); }
      table.append(body); tableWrap.replaceChildren(table);
      const present = exportRows.filter(r => r.total_usd != null);
      if (window.Plotly) {
        const width = host.clientWidth, compact = width < 520;
        renderedWidth = width;
        const traces = [{type: 'bar', orientation: 'h', x: present.map(r => r.total_usd / 1e9), y: present.map(r => r.database), name: 'MRIO', marker: {color: '#fdca27'}, hovertemplate: '%{y}: %{x:.3f} billion USD<extra></extra>'}];
        if (selected) traces.push({type: 'scatter', mode: 'markers', x: present.map(() => selected.value_usd / 1e9), y: present.map(r => r.database), name: 'Comtrade ' + referenceKind.value, marker: {symbol: 'line-ns', size: 20, line: {width: 3}, color: '#5a70b5'}, hovertemplate: 'Comtrade: %{x:.3f} billion USD<extra></extra>'});
        await Plotly.react(chart, traces, {width, height: Math.max(300, present.length * 48 + 100), margin: {l: compact ? 115 : 160, r: 20, t: 20, b: 55}, xaxis: {title: {text: 'Billion current USD'}}, yaxis: {automargin: true, tickfont: {size: compact ? 10 : 12}}, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: {color: getComputedStyle(host).color}, showlegend: false}, {responsive: true, displaylogo: false});
      }
      if (token !== generation) return;
      chart.setAttribute('aria-label', 'Bilateral trade: ' + origin.value + ' to ' + destination.value + ', ' + year.value);
      status.textContent = present.length + ' readings available. ' + (scope.value === 'all' ? 'MRIO totals include services; Comtrade covers goods.' : 'The goods proxy is not an exact merchandise concordance.') + (selected ? '' : ' No Comtrade reference has been collected for this pair/year.');
      download.disabled = false; host.setAttribute('aria-busy', 'false');
    }
    for (const control of [origin, destination, year, scope, referenceKind]) control.addEventListener('change', () => render().catch(showError));
    new MutationObserver(() => render().catch(showError)).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    new ResizeObserver(() => { if (window.Plotly && Math.abs(host.clientWidth - renderedWidth) > 1) render().catch(showError); }).observe(host);
    download.addEventListener('click', () => { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([model.csv(exportRows)], {type: 'text/csv;charset=utf-8'})); a.href = url; a.download = 'trade-' + origin.value + '-' + destination.value + '-' + year.value + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
    await render();
  }
  function showError(error) { host.setAttribute('aria-busy', 'false'); const p = make('p', error.message); p.setAttribute('role', 'alert'); host.append(p); }
  start().catch(showError);
})();
