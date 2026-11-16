"""Reordering native geography must retain all previously collected results."""
import json
import numpy as np
from pipelines import public_accounts as collector


def test_direct_update_reorders_preserved_carbon_axes_and_origin_residuals(tmp_path,monkeypatch):
    monkeypatch.setattr(collector,'OUTPUT',tmp_path/'accounts')
    monkeypatch.setattr(collector,'ROOT',tmp_path)
    folder=collector.OUTPUT;folder.mkdir()
    recipe={'id':'example','regions':[{'label':'A'},{'label':'B'}],'currency':'USD'}
    data={'schema_version':1,'id':'example','recipe':{**recipe,'footprint_compute':{'solver':'scipy','strategy':'iterative','refinement_steps':1}},'regions':[
        {'code':'A','accounts':{'ghg_footprint':[10,11]}},
        {'code':'B','accounts':{'ghg_footprint':[20,21]}}],
        'metrics':['ghg_footprint'],'components':{'ghg_footprint':['Domestic','Foreign']},
        'notes':{},'residuals':{'ghg_tonnes':[1,2]},
        'ghg_trade':{'intermediate':[[11,12],[21,22]],'final':[[31,32],[41,42]]},
        'provenance':{'footprint_boundaries':{'ghg_footprint':{'production_by_origin':[22,43],'allocated_by_origin':[21,41],'unrepresented_direct':[1,2],'unassigned_requirements':[0,0],'direct_final_contribution':[3,4]}}}}
    target=folder/'example.json';target.write_text(json.dumps(data))
    collector.publish({'id':'example','recipe':{**recipe,'footprint_compute':{'solver':'scipy','strategy':'direct','refinement_steps':0}},'original':{'recipe':recipe}},
        {'gross_output':np.array([[200],[100]])},details={'regions':['B','A']})
    result=json.loads(target.read_text())
    assert [r['code'] for r in result['regions']]==['B','A']
    assert [r['accounts']['ghg_footprint'] for r in result['regions']]==[[20,21],[10,11]]
    assert result['residuals']['ghg_tonnes']==[2,1]
    assert result['ghg_trade']['intermediate']==[[22,21],[12,11]]
    assert result['ghg_trade']['final']==[[42,41],[32,31]]
    assert result['provenance']['ghg_trade_region_order']==['B','A']
    assert result['recipe']['footprint_compute']=={'solver':'scipy','strategy':'iterative','refinement_steps':1}
    proof=result['provenance']['footprint_boundaries']['ghg_footprint']
    assert proof['production_by_origin']==[43,22]
    assert proof['direct_final_contribution']==[4,3]


def test_emerging_checks_the_economic_and_extension_vintages_independently(tmp_path):
    import hashlib,pytest
    from pipelines.account_jobs.emerging import verify_inputs
    source=tmp_path/'economic.mat';source.write_bytes(b'reviewed economic source')
    co2=tmp_path/'co2.mat';co2.write_bytes(b'reviewed CO2 source')
    provenance={'input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'emissions':{'sha256':hashlib.sha256(co2.read_bytes()).hexdigest()}}
    recipe={'parser_options':{'load_co2':True,'co2_path':str(co2)}}
    assert [r['role'] for r in verify_inputs(source,recipe,provenance)]==['economic','CO2']
    with pytest.raises(ValueError,match='exact reviewed EMERGING CO2 companion path'):
        verify_inputs(source,{'parser_options':{'load_co2':True}},provenance)
    co2.write_bytes(b'another release of CO2')
    with pytest.raises(ValueError,match='CO2 checksum differs'):verify_inputs(source,recipe,provenance)
    recipe['parser_options']['load_co2']=False
    assert len(verify_inputs(source,recipe,provenance))==1
    source.write_bytes(b'another economic vintage')
    with pytest.raises(ValueError,match='economic checksum differs'):verify_inputs(source,recipe,provenance)
