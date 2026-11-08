import json
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipelines.trade_collect import components, geography, goods_labels, jobs
import mario


def test_components_preserve_orientation_final_demand_and_domestic_values():
    axis=pd.MultiIndex.from_tuples([('CN','Sector','goods'),('CN','Sector','services'),('IT','Sector','goods'),('IT','Sector','services')])
    fd=pd.MultiIndex.from_tuples([('IT','Consumption category','households'),('CN','Consumption category','households')])
    z=pd.DataFrame(np.arange(16).reshape(4,4),index=axis,columns=axis,dtype=float)
    y=pd.DataFrame([[5,1],[-2,2],[8,3],[7,4]],index=axis,columns=fd,dtype=float)
    db=mario.Database(table='IOT',Z=z,Y=y,E=pd.DataFrame([[1.]*4],index=['CO2'],columns=axis),V=pd.DataFrame([[1.]*4],index=['VA'],columns=axis),EY=pd.DataFrame([[0.,0.]],index=['CO2'],columns=fd),
        units={k:pd.DataFrame({'unit':u},index=names) for k,u,names in [('Sector','USD',['goods','services']),('Satellite account','kg',['CO2']),('Factor of production','USD',['VA'])]},calc_all=False)
    regions,a,b=components(db)
    cn,it=regions.index('CN'),regions.index('IT')
    assert a[cn,it]==z.iloc[:2,2:].to_numpy().sum()
    assert b[cn,it]==3.
    assert b[it,cn]==7.
    assert a[cn,cn]==z.iloc[:2,:2].to_numpy().sum()
    _,ga,gb=components(db,['goods'])
    assert ga[cn,it]==z.iloc[0,2:].sum()
    assert gb[cn,it]==5.


def test_unknown_country_and_aggregate_are_not_invented_country_observations():
    rows=geography(['CN','IT','ROW','made-up-region','XKX'],'')
    assert rows[0]['iso3']=='CHN' and rows[1]['iso3']=='ITA'
    assert rows[2]['kind']=='aggregate' and rows[2]['iso3'] is None
    assert rows[3]['kind']=='unresolved' and rows[3]['iso3'] is None
    assert rows[4]['kind']=='country' and rows[4]['iso3']=='XKX'


def test_proxy_requires_all_native_labels_to_be_mapped():
    assert goods_labels(['an unmapped product'],'exiobase-3112-2015-ixi') is None
    assert goods_labels(['CPA_A01','CPA_C10','CPA_F41'],'',e3=True)==['CPA_A01','CPA_C10']


def test_cpa_2002_manufacturing_is_section_d_not_nace_rev2_section_c():
    from pipelines.trade_collect import ECONOMY
    mapping=json.loads((ECONOMY/'sector-sections.json').read_text())['mappings']['exiobase-3112-2015-pxp']
    manufactured=next(row['native_label'] for row in mapping['entries'] if row['section']=='D')
    assert goods_labels([manufactured],'exiobase-3112-2015-pxp')==[manufactured]


def test_pilot_years_versions_and_licence_metadata_are_explicit():
    records=jobs()
    assert {r['year'] for r in records}=={2015,2022}
    assert len({r['id'] for r in records})==len(records)
    assert all('verify before' not in r['license'] for r in records)
    assert next(r for r in records if r['version']=='REX3')['family']=='EXIOBASE'
    assert all(r['family']=='FIGARO' for r in records if r['version']=='E3')


def test_frozen_upstream_recipe_remains_collectable_without_copying_library_pages(tmp_path):
    import importlib.util
    from pipelines.trade_collect import ROOT
    spec=importlib.util.spec_from_file_location('explorer_catalogue',ROOT/'doc/scripts/database_catalogue.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    manifest=json.loads((ROOT/'doc/database_catalogue.recipes.json').read_text())
    recipe=next(r for r in manifest['recipes'] if r['id']=='exiobase-monetary--01')
    job={'id':'fixture','label':'Local fixture','recipe':recipe['id'],'parameters':{'path':str(tmp_path),'year':2015}}
    resolved,parameters=module.resolve_job(job,manifest)
    assert resolved['fingerprint']==recipe['fingerprint']
    assert parameters['path']==str(tmp_path) and parameters['download'] is False
    altered=json.loads(json.dumps(manifest))
    next(r for r in altered['recipes'] if r['id']==recipe['id'])['parameters']['year']=2022
    with pytest.raises(ValueError,match='differs from the frozen'):
        module.resolve_job(job,altered)
