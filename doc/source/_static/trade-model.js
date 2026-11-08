(function (root) {
  'use strict';
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function flow(reading, origin, destination, scope) {
    const i = reading.regions.findIndex(r => r.iso3 === origin && r.kind === 'country');
    const j = reading.regions.findIndex(r => r.iso3 === destination && r.kind === 'country');
    const block = reading.flows[scope];
    if (i < 0 || j < 0 || !block) return null;
    const intermediate = block.intermediate[i][j], final = block.final[i][j];
    if (!finite(intermediate) || !finite(final)) return null;
    return { intermediate, final, total: intermediate + final };
  }
  function reference(rows, origin, destination, year, kind) {
    return rows.find(r => r.origin === origin && r.destination === destination &&
      r.year === Number(year) && r.kind === kind) || null;
  }
  function ratio(value, denominator) {
    return finite(value) && finite(denominator) && denominator !== 0 ? value / denominator : null;
  }
  function csv(rows) {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    const cell = value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    return [keys.map(cell).join(','), ...rows.map(row => keys.map(k => cell(row[k])).join(','))].join('\r\n') + '\r\n';
  }
  const api = { flow, reference, ratio, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TradeModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
