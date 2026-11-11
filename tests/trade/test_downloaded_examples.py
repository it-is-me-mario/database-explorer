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
import sys
sys.path.insert(0,str(ROOT/'doc/source/_static/reproduce'))


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
    db.meta.year=2015
    from recipes.run import compute
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
    config={'recipe':{'id':identifier,'source':'EXIOBASE' if table=='IOT' else 'GLORIA','parser':'parse_exiobase' if table=='IOT' else 'parse_gloria','parser_options':{},'table':table,'year':2015},
      'metric':'trade','native_pairs':[(regions[0],regions[1]),(regions[1],regions[0])], 'native_to_usd':20,
      'goods_labels':goods if scope=='goods_proxy' else None,'selection':{'tradeUse':'total'},
      'points':[{'available':True,'expected_value':sum(expected),'expected_components':dict(zip(('intermediate','final','total'),[*expected,sum(expected)])),'row':{}}]}
    with patch.object(mario,'parse_exiobase',return_value=db),patch.object(mario,'parse_gloria',return_value=db):
        result=compute(config,'licensed-local-fixture')[0]
    assert result['intermediate']==pytest.approx(expected[0]);assert result['final']==pytest.approx(expected[1]);assert result['value']==pytest.approx(sum(expected))
