"""Executable public downloads share collection recipes, including selection math."""
import copy,json,sys
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pandas as pd
import pytest
import mario
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'doc/source/_static/reproduce'))
from recipes.indicators.production import aggregate
from recipes.databases.loading import final_demand_taxes
from recipes.run import compute,point_value


def recipe(db):
    return {'id':'fixture','source':'EXIOBASE','release':'3.3.18','year':2015,'table':db.table_type,'parser':'parse_exiobase',
        'parser_options':{'table':db.table_type,'unit':'Hybrid'},'currency':'USD','currency_scale':1000,
        'value_added_block':'V' if db.table_type=='IOT' else 'Va','value_added_rows':['Wages','Capital'],
        'sectors':db.get_index('Sector' if db.table_type=='IOT' else 'Activity'),
        'regions':[{'label':r,'name':r,'kind':'country','iso3':r} for r in db.get_index('Region')],
        'ghg_factors':{'CO2':.001},'emissions_block':'E' if db.table_type=='IOT' else 'Ea',
        'tax_bridge':'source_activity_taxes','product_tax_rows':['Taxes'],'final_demand_emissions_loaded':True}


@pytest.mark.parametrize('table',['IOT','SUT'])
def test_modular_indicators_match_independent_native_factors_and_direct_emissions(table):
    db=mario.load_test(table);r=recipe(db);rows=aggregate(db,r,final_demand_taxes('unused',r))
    V=db.get_block(r['value_added_block']);E=db.get_block(r['emissions_block']);EY=db.get_block('EY')
    for row in rows:
        code=row['code'];mask=V.columns.get_level_values('Region')==code
        assert sum(row['value_added'])==pytest.approx(V.loc[['Wages','Capital']].iloc[:,mask].to_numpy().sum()*1000)
        assert row['gdp']==pytest.approx(V.iloc[:,mask].to_numpy().sum()*1000)
        assert sum(row['ghg'])==pytest.approx(E.loc['CO2'].iloc[mask].sum()*.001)
        assert row['household_ghg']==pytest.approx(EY.loc['CO2'].loc[lambda x:x.index.get_level_values('Region')==code].sum()*.001)


@pytest.mark.parametrize('metric',['gdp','value_added','ghg'])
def test_download_runner_recomputes_a_world_selection_from_the_same_modular_recipes(metric):
    db=mario.load_test('IOT');db.meta.year=2015;r=recipe(db);V=db.get_block('V');E=db.get_block('E');EY=db.get_block('EY')
    expected=V.to_numpy().sum()*1000 if metric=='gdp' else V.loc[['Wages','Capital']].to_numpy().sum()*1000 if metric=='value_added' else (E.loc['CO2'].sum()+EY.loc['CO2'].sum())*.001/1e6
    point={'row':{'value':None,'indicator':metric},'available':True,'expected_value':expected,'region_codes':db.get_index('Region'),'sector_indices':list(range(len(r['sectors']))),'whole_economy':True,'households':False,'population':None,'ghg_tonnes_per_unit':1e6}
    config={'recipe':r,'metric':metric,'world_bank':{},'points':[point]}
    with patch.object(mario,'parse_exiobase',return_value=db):
        result=compute(config,'local-fixture')
    assert result[0]['value']==pytest.approx(expected)
    assert config['points'][0]['row']['value'] is None
    changed=copy.deepcopy(config);changed['points'][0]['expected_value']=expected*2
    with patch.object(mario,'parse_exiobase',return_value=db),pytest.raises(ValueError,match='differs from'):
        compute(changed,'different-vintage')


def test_no_ey_observation_is_invented_and_missing_geography_is_rejected():
    db=mario.load_test('IOT');r=recipe(db);r['final_demand_emissions_loaded']=False
    rows=aggregate(db,r)
    assert all('household_ghg' not in row for row in rows)
    with pytest.raises(ValueError,match='Incomplete'):
        point_value(rows,{'region_codes':['missing']},r,'ghg',{})


def test_exiobase_source_tax_adapter_reads_exact_final_demand_rows(tmp_path):
    columns=pd.MultiIndex.from_tuples([('CN','HH'),('CN','Gov'),('IT','HH')])
    frame=pd.DataFrame([[3.,-1.,7.]],index=['tax'],columns=columns)
    folder=tmp_path/'factor_inputs';folder.mkdir();frame.to_csv(folder/'F_Y.txt',sep='\t')
    result=final_demand_taxes(tmp_path,{'tax_bridge':'exiobase_factor_inputs','product_tax_rows':['tax']})
    assert result=={'CN':2.,'IT':7.}
