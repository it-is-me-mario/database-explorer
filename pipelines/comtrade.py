"""Explicitly fetch and cache a small merchandise-only Comtrade reference.

Default coverage is reporters China/Italy, 2015/2022, exports/imports and all
partners at TOTAL. Builds never call this collector. Truncation is an error.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import country_converter as coco

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS'


def collect(refresh=False):
    logging.getLogger('country_converter').setLevel(logging.ERROR)
    observations, requests, last_request = {}, [], 0.
    cache = ROOT / '_cache/comtrade'
    cache.mkdir(parents=True, exist_ok=True)
    for year in (2015, 2022):
        for reporter in (156, 380):
            for flow in ('X', 'M'):
                parameters = {'period': str(year), 'reporterCode': str(reporter),
                              'cmdCode': 'TOTAL', 'flowCode': flow}
                url = BASE + '?' + urllib.parse.urlencode(parameters)
                path = cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
                if path.is_file() and not refresh:
                    saved = json.loads(path.read_text())
                else:
                    pause = 4. - (time.monotonic() - last_request)
                    if pause > 0:
                        time.sleep(pause)
                    with urllib.request.urlopen(url, timeout=60) as response:
                        result = json.load(response)
                    last_request = time.monotonic()
                    saved = {'query_url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'response': result}
                    path.write_text(json.dumps(saved, separators=(',', ':')) + '\n')
                rows = saved['response'].get('data')
                if saved['response'].get('error') or not isinstance(rows, list) or len(rows) >= 500:
                    raise ValueError('Comtrade response failed or may be truncated; do not publish a partial total.')
                print(year, reporter, flow, 'records', len(rows), flush=True)
                requests.append({'query_url': url, 'retrieved_at': saved['retrieved_at'], 'records': len(rows)})
                for row in rows:
                    if str(row.get('cmdCode')) != 'TOTAL' or int(row.get('period', 0)) != year:
                        raise ValueError('Unexpected commodity scope or year.')
                    if row.get('partner2Code', 0) != 0 or row.get('motCode', 0) != 0 or row.get('customsCode', 'C00') != 'C00':
                        continue
                    partner = int(row['partnerCode'])
                    if partner == 0:
                        continue
                    origin_code, destination_code = (reporter, partner) if flow == 'X' else (partner, reporter)
                    origin = coco.convert(names=origin_code, src='UNcode', to='ISO3', not_found='__unmapped__')
                    destination = coco.convert(names=destination_code, src='UNcode', to='ISO3', not_found='__unmapped__')
                    if not isinstance(origin, str) or not isinstance(destination, str) or '__unmapped__' in (origin, destination):
                        continue
                    if origin == destination:
                        continue
                    kind = 'export' if flow == 'X' else 'mirror_import'
                    value = row.get('primaryValue')
                    if value is None or float(value) < 0:
                        raise ValueError('Invalid merchandise value.')
                    key = (origin, destination, year, kind)
                    item = {'origin': origin, 'destination': destination, 'year': year, 'kind': kind,
                            'value_usd': float(value), 'scope': 'merchandise TOTAL',
                            'valuation': 'usually FOB' if flow == 'X' else 'usually CIF',
                            'reporter_code': reporter, 'partner_code': partner,
                            'is_reported': row.get('isReported'), 'is_aggregate': row.get('isAggregate'),
                            'query_url': url, 'retrieved_at': saved['retrieved_at']}
                    if key in observations and observations[key]['value_usd'] != item['value_usd']:
                        raise ValueError('Conflicting reference records for one country pair.')
                    observations[key] = item
    payload = {'schema_version': 1, 'source': 'UN Comtrade', 'type': 'C', 'frequency': 'A',
               'commodity': 'TOTAL', 'coverage_note': 'Pilot reporters China and Italy; other pairs remain uncollected.',
               'reuse_url': 'https://uncomtrade.org/docs/re-dissemination-of-data/',
               'requests': requests, 'observations': list(observations.values())}
    target = ROOT / 'doc/source/_static/data/trade/comtrade.json'
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    result = collect(args.refresh)
    print('Published', len(result['observations']), 'pilot reference observations.')
