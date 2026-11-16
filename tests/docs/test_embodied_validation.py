"""Reject inconsistent published aggregates without loading source databases."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('site_checks',ROOT/'check_site.py')
CHECK=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


def scaled(value,factor):
    if isinstance(value,dict):return {key:scaled(part,factor) for key,part in value.items()}
    if isinstance(value,list):return [scaled(part,factor) for part in value]
    return value*factor


@pytest.fixture
def published(tmp_path):
    block={'intermediate':[[30,-2],[4,20]],'final':[[10,3],[5,15]]}
    accounts={'value_added_footprint':[[40,50],[50,45]],'ghg_footprint':[[4,5],[5,4.5]]}
    totals={'ghg_trade':scaled(block,.1),'value_added_trade':{'total':block,'domestic':scaled(block,.7),'foreign':scaled(block,.3)}}
    reading={'schema_version':1,'id':'sample','recipe':{'id':'sample'},'regions':[{'code':'A'},{'code':'B'}],
             'metrics':['value_added_footprint','ghg_footprint','ghg_trade','value_added_trade'],
             'accounts':copy.deepcopy(accounts),'residuals':{'value_added':[10,5],'ghg_tonnes':[1,.5]},
             'direct_final_user_emissions':[2,3],**copy.deepcopy(totals),
             'sector_groups':{'A':['agriculture'],'C':['manufacturing']},
             'sector_files':{'A':'sample--a.json','C':'sample--c.json'},
             'provenance':{'region_order':['A','B'],'mario_version':'1.3.4','inputs':[{'sha256':'a'*64}],
                           'metric_compute':{metric:{'solver':'scipy'} for metric in ['ghg_trade','value_added_trade','value_added_footprint','ghg_footprint']},
                           'footprint_boundaries':{'value_added_footprint':{'production_by_origin':[100,100],
                               'allocated_by_origin':[90,95],'unrepresented_direct':[3,2],'unassigned_requirements':[7,3]},
                               'ghg_footprint':{'production_by_origin':[10,10],'allocated_by_origin':[9,9.5],
                                   'unrepresented_direct':[.3,.2],'unassigned_requirements':[.7,.3]}}}}
    reading['accounts']['ghg_footprint']=[[6,5],[8,4.5]]
    record={key:reading[key] for key in ['id','metrics','sector_files','sector_groups']};record['file']='sample.json'
    def write(name,data):(tmp_path/name).write_text(json.dumps(data))
    write('manifest.json',{'schema_version':1,'readings':[record]})
    write('sample.json',reading)
    for group,factor in [('A',.25),('C',.75)]:
        write(reading['sector_files'][group],{'id':'sample','section':group,**scaled({'accounts':accounts,**totals},factor)})
    return tmp_path


def test_reconciles_signed_trade_all_sectors_and_direct_final_emissions(published):
    assert CHECK.check_embodied(published)==1


@pytest.mark.parametrize('damage', ['region_order','non_finite','va_origin','missing_sector','final_user_emissions','origin_balance','missing_proof','detached_proof','detached_residual','orphan_footprint','all_sector_files_missing','manifest_sector_scope'])
def test_rejects_misleading_published_results(published,damage):
    file=published/'sample.json';data=json.loads(file.read_text())
    if damage=='region_order':data['provenance']['region_order'].reverse()
    elif damage=='non_finite':data['ghg_trade']['final'][0][1]=float('nan')
    elif damage=='va_origin':data['value_added_trade']['foreign']['final'][0][1]+=1
    elif damage=='missing_sector':
        del data['sector_files']['C']
        manifest=json.loads((published/'manifest.json').read_text())
        manifest['readings'][0]['sector_files']=data['sector_files']
        (published/'manifest.json').write_text(json.dumps(manifest))
    elif damage=='all_sector_files_missing':
        data['sector_files']={}
        manifest=json.loads((published/'manifest.json').read_text())
        manifest['readings'][0]['sector_files']={}
        (published/'manifest.json').write_text(json.dumps(manifest))
    elif damage=='orphan_footprint':
        data['metrics']=[metric for metric in data['metrics'] if metric not in {'ghg_footprint','ghg_trade'}]
        del data['ghg_trade']
        del data['provenance']['footprint_boundaries']['ghg_footprint']
        manifest=json.loads((published/'manifest.json').read_text())
        manifest['readings'][0]['metrics']=data['metrics']
        (published/'manifest.json').write_text(json.dumps(manifest))
    elif damage=='manifest_sector_scope':
        manifest=json.loads((published/'manifest.json').read_text())
        manifest['readings'][0]['sector_groups']['A']=['manufacturing']
        (published/'manifest.json').write_text(json.dumps(manifest))
    elif damage=='final_user_emissions':data['direct_final_user_emissions'][0]+=1
    elif damage=='origin_balance':data['provenance']['footprint_boundaries']['value_added_footprint']['allocated_by_origin'][0]+=1
    elif damage=='missing_proof':del data['provenance']['footprint_boundaries']['ghg_footprint']
    elif damage=='detached_proof':
        proof=data['provenance']['footprint_boundaries']['ghg_footprint']
        proof['allocated_by_origin'][0]+=1
        proof['production_by_origin'][0]+=1
    elif damage=='detached_residual':data['residuals']['ghg_tonnes'][0]+=1
    file.write_text(json.dumps(data))
    with pytest.raises(AssertionError):CHECK.check_embodied(published)


@pytest.mark.parametrize('rounding,accepted',[(.1000005,True),(.10001,False)])
def test_published_origin_rounding_uses_the_collectors_combined_tolerance(published,rounding,accepted):
    file=published/'sample.json';data=json.loads(file.read_text())
    data['provenance']['footprint_boundaries']['value_added_footprint']['production_by_origin'][0]+=rounding
    file.write_text(json.dumps(data))
    if accepted:assert CHECK.check_embodied(published)==1
    else:
        with pytest.raises(AssertionError):CHECK.check_embodied(published)
