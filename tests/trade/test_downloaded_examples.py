"""Execute generated downloads on real MARIO fixtures, without source downloads."""
import io
import json
from pathlib import Path
import subprocess
from unittest.mock import patch

import mario
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('table', ['IOT', 'SUT'])
@pytest.mark.parametrize('scope', ['all', 'goods_proxy'])
def test_downloaded_native_trade_example(table, scope):
    db = mario.load_test(table)
    regions = db.get_index('Region')
    labels = db.get_index('Sector' if table == 'IOT' else 'Commodity')
    goods = [label for label in labels if label != 'Services']
    identifier = 'trade-exiobase-3112-2015-ixi' if table == 'IOT' else 'trade-gloria-060-2015-sut'
    mapping_id = identifier.removeprefix('trade-')
    mapping = {'classification_id': 'cpa-2002', 'entries': [
        {'native_label': label, 'section': 'D' if label in goods else 'J'} for label in labels]}
    payload = {'row': {'year': 2015, 'format': table, 'system': 'ixi', 'recipe': {'id': identifier},
        'reading': {'family': 'EXIOBASE' if table == 'IOT' else 'GLORIA', 'version': '3.11.2' if table == 'IOT' else '060',
            'source_url': 'https://example.org/source', 'license_url': 'https://example.org/terms',
            'native_scale': 10, 'usd_per_native_currency': 2,
            'regions': [{'iso3': iso, 'kind': 'country', 'label': label} for iso, label in zip(('CHN', 'ITA'), regions)]}},
        'state': {'origin': ['CHN', 'ITA'], 'destination': ['CHN', 'ITA'], 'tradeScope': scope}}
    code = subprocess.check_output(['node', '-e',
        "const fs=require('fs'),T=require('./doc/source/_static/trade-model.js');"
        "const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(T.pythonStart(p.row,p.state));"],
        input=json.dumps(payload), text=True, cwd=ROOT)
    with patch.object(mario, 'parse_exiobase', return_value=db), patch.object(mario, 'parse_gloria', return_value=db), \
            patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps({'mappings': {mapping_id: mapping}}).encode())):
        namespace = {}
        exec(compile(code, '<downloaded-trade-example>', 'exec'), namespace)
    expected = []
    for name in (('Z', 'Y') if table == 'IOT' else ('U', 'Yc')):
        block = db.get_block(name)
        total = 0.
        for origin in regions:
            for destination in regions:
                if origin == destination:
                    continue
                row_mask = block.index.get_level_values(0) == origin
                if scope == 'goods_proxy':
                    row_mask &= block.index.get_level_values(-1).isin(goods)
                column_mask = block.columns.get_level_values(0) == destination
                total += block.iloc[np.flatnonzero(row_mask), np.flatnonzero(column_mask)].to_numpy().sum()
        expected.append(total * 20)
    assert namespace['intermediate_usd'] == pytest.approx(expected[0])
    assert namespace['final_usd'] == pytest.approx(expected[1])
