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


def test_complete_series_versions_and_licence_metadata_are_explicit():
    records=jobs()
    assert len(records)==225
    assert {r['year'] for r in records if r['family']=='EXIOBASE' and r['version']=='3.11.2'}==set(range(1995,2025))
    assert {r['year'] for r in records if r['family']=='GLORIA'}==set(range(2000,2026))
    assert {r['year'] for r in records if r['family']=='OECD'}==set(range(1995,2023))
    assert {r['year'] for r in records if r['family']=='EMERGING'}=={2015,2018,2021,2023}
    assert len({r['id'] for r in records})==len(records)
    assert all('verify before' not in r['license'] for r in records)
    assert next(r for r in records if r['version']=='REX3')['family']=='EXIOBASE'
    assert all(r['family']=='FIGARO' for r in records if r['version']=='E3')
    assert {r['version'] for r in records if r['family']=='FIGARO'}=={'standard','E3'}


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


def test_published_trade_manifest_covers_the_reviewed_annual_jobs():
    from pipelines.trade_collect import OUTPUT
    manifest=json.loads((OUTPUT/'manifest.json').read_text())
    assert {r['id'] for r in manifest['datasets']}=={r['id'] for r in jobs()}
    for row in manifest['datasets']:
        data=json.loads((OUTPUT/row['file']).read_text())
        for parts in data['flows'].values():
            for values in parts.values():
                matrix=np.asarray(values)
                assert matrix.shape==(len(data['regions']),)*2 and np.isfinite(matrix).all()


def test_source_sut_slice_retains_exact_direct_flows_without_solving_a_model():
    from pipelines.trade_validation import sut_slice
    db=mario.load_test('SUT')
    blocks={key:db.get_block(key).to_numpy() for key in ('S','U','Ya','Yc')}
    actual=sut_slice(db.get_index('Region'),db.get_index('Activity'),db.get_index('Consumption category'),blocks)
    expected=components(db)
    assert actual[0]==expected[0]
    for a,b in zip(actual[1:],expected[1:]):np.testing.assert_allclose(a,b)


@pytest.mark.parametrize('archive',[False,True])
@pytest.mark.parametrize('backend',['pandas','polars'])
def test_source_stream_fingerprints_complete_csv_bytes_while_selecting_columns(tmp_path,archive,backend):
    from types import SimpleNamespace
    import hashlib,zipfile
    from pipelines.trade_streams.gloria import csv_batches,polars_csv_batches
    reader=polars_csv_batches if backend=='polars' else csv_batches
    raw=b'1,2,3,4\n5,6,7,8\n9,10,11,12\n'
    path=tmp_path/('source.zip' if archive else 'source.csv')
    if archive:
        with zipfile.ZipFile(path,'w') as z:z.writestr('matrix.csv',raw)
    else:path.write_bytes(raw)
    member='matrix.csv' if archive else None
    resource=SimpleNamespace(container=path,member=member,name=member or path.name)
    hashes={};chunks=list(reader(resource,columns=[0,2],dtype=np.dtype('float64'),batch_size=2,input_digests=hashes))
    np.testing.assert_array_equal(np.concatenate([r for r,_ in chunks]),[0,1,2])
    np.testing.assert_array_equal(np.concatenate([a for _,a in chunks]),[[1,3],[5,7],[9,11]])
    assert hashes[resource.name]=={'file':path.name,'member':resource.name,'sha256':hashlib.sha256(raw).hexdigest()}


def test_direct_trade_recipe_omits_unrelated_satellites_without_mutating_upstream_recipe():
    from recipes.indicators.trade import source_recipe
    original={'source':'EMERGING','parser_options':{'load_co2':True,'co2_path':'companion.mat'},'expected_units':{'Sector':{'goods':'M.USD'},'Satellite account':{'CO2':'t'}}}
    selected=source_recipe(original,[['CHN','ITA']])
    assert selected['parser_options']=={'load_co2':False,'regions':['CHN','ITA']}
    assert selected['expected_units']=={'Sector':{'goods':'M.USD'}}
    assert original['parser_options']['load_co2'] is True and original['parser_options']['co2_path']=='companion.mat'


def test_adb_goods_proxy_includes_combined_agriculture_and_rev1_manufacturing():
    from pipelines.trade_collect import ECONOMY
    mapping=json.loads((ECONOMY/'sector-sections.json').read_text())['mappings']['adb-2022-62-economies']
    labels=[r['native_label'] for r in mapping['entries']]
    expected=[r['native_label'] for r in mapping['entries'] if r['section'] in {'A+B','C','D'}]
    selected=goods_labels(labels,'adb-2022-62-economies')
    assert selected==expected and len(selected)==16
    assert 'Electrical and optical equipment' in selected
    assert 'Agriculture, hunting, forestry, and fishing' in selected
    assert 'Electricity, gas, and water supply' not in selected
